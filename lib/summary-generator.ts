// lib/summary-generator.ts
// Generates AI business summaries using Groq (Llama 3.3 70B).
// Called by both the daily and weekly cron routes.

import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';

export type SummaryType = 'daily' | 'weekly';

interface SummaryStats {
  orders:        number;
  revenue:       number;
  profit:        number;
  deliveredPct:  number;
  failedOrders:  number;
  newAgents:     number;
  activeAgents:  number;
  topNetwork:    string;
  topBundle:     string;
  withdrawals:   number;
  pendingWd:     number;
  topAgent:      string | null;
  topAgentSales: number;
}

// ── Fetch stats for a date range ──────────────────────────────
async function fetchStats(from: Date, to: Date): Promise<SummaryStats> {
  const supabase = createSupabaseAdminClient();

  const [ordersRes, agentsRes, withdrawalsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('network, bundle_key, size, admin_price, admin_profit, delivery_status, agent_id, created_at')
      .eq('status', 'success')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),

    supabase
      .from('agents')
      .select('id, status, created_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),

    supabase
      .from('withdrawals')
      .select('amount, status')
      .gte('requested_at', from.toISOString())
      .lte('requested_at', to.toISOString()),
  ]);

  const orders      = ordersRes.data  || [];
  const newAgents   = agentsRes.data  || [];
  const withdrawals = withdrawalsRes.data || [];

  const revenue = orders.reduce((s, o) => s + (o.admin_price || 0), 0);
  const profit  = orders.reduce((s, o) => s + (o.admin_profit || 0), 0);

  const delivered    = orders.filter(o => o.delivery_status === 'delivered').length;
  const failed       = orders.filter(o => o.delivery_status === 'failed').length;
  const deliveredPct = orders.length > 0 ? Math.round((delivered / orders.length) * 100) : 0;

  // Top network by order count
  const netCount: Record<string, number> = {};
  orders.forEach(o => { netCount[o.network] = (netCount[o.network] || 0) + 1; });
  const topNetwork = Object.entries(netCount).sort(([,a],[,b]) => b - a)[0]?.[0] || 'N/A';

  // Top bundle by order count
  const bundleCount: Record<string, number> = {};
  orders.forEach(o => { const k = `${o.network?.toUpperCase()} ${o.size}`; bundleCount[k] = (bundleCount[k] || 0) + 1; });
  const topBundle = Object.entries(bundleCount).sort(([,a],[,b]) => b - a)[0]?.[0] || 'N/A';

  // Top agent
  const agentCount: Record<string, number> = {};
  orders.filter(o => o.agent_id).forEach(o => { agentCount[o.agent_id] = (agentCount[o.agent_id] || 0) + 1; });
  const topAgentId  = Object.entries(agentCount).sort(([,a],[,b]) => b - a)[0]?.[0] || null;
  let topAgent = null;
  if (topAgentId) {
    const { data: ag } = await supabase.from('agents').select('name').eq('id', topAgentId).single();
    topAgent = ag?.name || null;
  }

  // Count active agents (all-time, not just this period)
  const { count: activeCount } = await supabase
    .from('agents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  const wdAmount  = withdrawals.reduce((s, w) => s + (w.amount || 0), 0);
  const pendingWd = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + (w.amount || 0), 0);

  return {
    orders:        orders.length,
    revenue,
    profit,
    deliveredPct,
    failedOrders:  failed,
    newAgents:     newAgents.length,
    activeAgents:  activeCount || 0,
    topNetwork:    topNetwork.toUpperCase(),
    topBundle,
    withdrawals:   wdAmount,
    pendingWd,
    topAgent,
    topAgentSales: topAgentId ? (agentCount[topAgentId] || 0) : 0,
  };
}

// ── Call Groq to write the summary ────────────────────────────
async function generateNarrative(type: SummaryType, stats: SummaryStats, label: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey) return '';

  const prompt = `You are a business analyst for ADMUNZ, a data bundle reseller platform in Ghana.

Write a concise, insightful ${type === 'daily' ? 'daily' : 'weekly'} business summary for ${label}.

DATA:
- Orders: ${stats.orders}
- Revenue: GHS ${stats.revenue.toFixed(2)}
- Net Profit: GHS ${stats.profit.toFixed(2)}
- Delivery Success Rate: ${stats.deliveredPct}%
- Failed Deliveries: ${stats.failedOrders}
- New Agents Registered: ${stats.newAgents}
- Total Active Agents: ${stats.activeAgents}
- Top Network: ${stats.topNetwork}
- Best-Selling Bundle: ${stats.topBundle}
- Withdrawal Requests: GHS ${stats.withdrawals.toFixed(2)} (GHS ${stats.pendingWd.toFixed(2)} pending)
${stats.topAgent ? `- Top Performing Agent: ${stats.topAgent} (${stats.topAgentSales} orders)` : ''}

Write 3-5 sentences in a direct, friendly business tone. Include:
1. Overall performance verdict (strong/slow/average)
2. One specific insight or pattern worth noting
3. One actionable suggestion for tomorrow/next week
4. A brief mention of any concern if delivery rate < 90% or profit < GHS 50

Keep it under 120 words. No bullet points — flowing prose only.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 200,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch (e) {
    console.error('[summary-generator] Groq error:', e);
    return '';
  }
}

// ── Send admin dashboard notification ─────────────────────────
async function saveNotification(type: SummaryType, label: string, stats: SummaryStats) {
  const supabase = createSupabaseAdminClient();
  const emoji    = type === 'daily' ? '📊' : '📈';
  const title    = type === 'daily' ? `${emoji} Daily Summary — ${label}` : `${emoji} Weekly Summary — ${label}`;
  const msg      = `${stats.orders} orders · GHS ${stats.revenue.toFixed(2)} revenue · GHS ${stats.profit.toFixed(2)} profit · ${stats.deliveredPct}% delivered`;

  await supabase.from('support_notifications').insert({
    target_type: 'admin',
    agent_id:    null,
    ticket_id:   null,
    title,
    message:     msg,
    is_read:     false,
  });
}

// ── Build and send the summary email ─────────────────────────
function fmt(n: number) { return `GHS ${n.toFixed(2)}`; }

async function sendSummaryEmail(type: SummaryType, label: string, stats: SummaryStats, narrative: string) {
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || 'https://admunz.com';
  const emoji    = type === 'daily' ? '📊' : '📈';
  const title    = type === 'daily' ? `Daily Business Summary` : `Weekly Business Summary`;

  const rows = [
    { label: 'Orders',             val: String(stats.orders) },
    { label: 'Revenue',            val: fmt(stats.revenue) },
    { label: 'Net Profit',         val: fmt(stats.profit),    highlight: true },
    { label: 'Delivery Rate',      val: `${stats.deliveredPct}%`, warn: stats.deliveredPct < 90 },
    { label: 'Failed Deliveries',  val: String(stats.failedOrders), warn: stats.failedOrders > 0 },
    { label: 'Top Network',        val: stats.topNetwork },
    { label: 'Best-Selling Bundle',val: stats.topBundle },
    ...(stats.topAgent ? [{ label: 'Top Agent', val: `${stats.topAgent} (${stats.topAgentSales} orders)` }] : []),
    { label: 'New Agents',         val: String(stats.newAgents) },
    { label: 'Active Agents',      val: String(stats.activeAgents) },
    { label: 'Withdrawals',        val: fmt(stats.withdrawals) },
    { label: 'Pending Withdrawals',val: fmt(stats.pendingWd), warn: stats.pendingWd > 0 },
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#06090e;font-family:'Helvetica Neue',Arial,sans-serif;color:#f1f5f9}
  .wrap{max-width:520px;margin:32px auto;padding:0 16px}
  .card{background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden}
  .top{height:4px;background:linear-gradient(90deg,#00d4aa,#0ea5e9)}
  .header{padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
  .title{font-size:20px;font-weight:800;color:#f1f5f9;margin-bottom:4px}
  .sub{font-size:13px;color:#64748b}
  .body{padding:24px 28px}
  .narrative{background:#131920;border:1px solid rgba(0,212,170,0.2);border-radius:12px;padding:16px 18px;font-size:13px;color:#e2e8f0;line-height:1.7;margin-bottom:20px;font-style:italic}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
  .row:last-child{border-bottom:none}
  .row-label{font-size:13px;color:#64748b}
  .row-val{font-size:13px;font-weight:600;color:#f1f5f9}
  .highlight{color:#00d4aa;font-size:15px;font-weight:800}
  .warn{color:#f59e0b}
  .btn{display:inline-block;background:linear-gradient(135deg,#00d4aa,#00b894);color:#06090e;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-top:18px}
  .footer{padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#334155;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="top"></div>
    <div class="header">
      <div class="title">${emoji} ${title}</div>
      <div class="sub">${label}</div>
    </div>
    <div class="body">
      ${narrative ? `<div class="narrative">${narrative}</div>` : ''}
      ${rows.map(r => `
        <div class="row">
          <span class="row-label">${r.label}</span>
          <span class="row-val ${(r as { highlight?: boolean }).highlight ? 'highlight' : (r as { warn?: boolean }).warn ? 'warn' : ''}">${r.val}</span>
        </div>`).join('')}
      <a href="${siteUrl}/xena-173424" class="btn">→ Open Admin Panel</a>
    </div>
    <div class="footer">ADMUNZ automated summary · <a href="${siteUrl}/xena-173424" style="color:#00d4aa">admunz.com</a></div>
  </div>
</div>
</body>
</html>`;

  return sendEmail({
    to:      process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'kwameadom607@gmail.com',
    subject: `${emoji} ADMUNZ ${title} — ${label}`,
    html,
  });
}

// ── Main export: generate + deliver a summary ─────────────────
export async function generateAndSendSummary(type: SummaryType) {
  const now  = new Date();
  let from: Date, to: Date, label: string;

  if (type === 'daily') {
    // Yesterday's full day (Ghana = UTC, so this is correct)
    from  = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    to    = new Date(now); to.setDate(to.getDate() - 1);     to.setHours(23, 59, 59, 999);
    const d = from.toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' });
    label = d;
  } else {
    // Last 7 days
    from  = new Date(now); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    to    = new Date(now); to.setHours(23, 59, 59, 999);
    const f = from.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
    const t = to.toLocaleDateString('en-GH',   { day: 'numeric', month: 'short', year: 'numeric' });
    label = `${f} – ${t}`;
  }

  console.log(`[${type}-summary] Generating for ${label}`);

  const [stats, ] = await Promise.all([fetchStats(from, to)]);
  const narrative = await generateNarrative(type, stats, label);

  await Promise.all([
    saveNotification(type, label, stats),
    sendSummaryEmail(type, label, stats, narrative),
  ]);

  console.log(`[${type}-summary] Done — ${stats.orders} orders, GHS ${stats.revenue.toFixed(2)} revenue`);
  return { stats, narrative, label };
}
