// app/api/referral/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();

    const { data: agent } = await supabase
      .from('agents')
      .select('slug, can_set_subagent_prices')
      .eq('id', agentId)
      .single();

    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const { data: settings } = await supabase
      .from('app_settings')
      .select('referral_pct, referral_enabled')
      .eq('id', 1)
      .single();

    const referralPct = parseFloat(String(settings?.referral_pct ?? 10));
    const referralEnabled = settings?.referral_enabled !== false;

    // All agents this agent has referred
    const { data: referredAgents } = await supabase
      .from('agents')
      .select('id, name, slug, created_at, status')
      .eq('referred_by', agent.slug)
      .order('created_at', { ascending: false });

    // All earnings from referring these agents
    const { data: earnings } = await supabase
      .from('referral_earnings')
      .select('id, created_at, referred_id, referred_profit, pct, bonus_amount, status')
      .eq('referrer_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50);

    const credited = (earnings || []).filter(e => e.status === 'credited');
    const totalBonusEarned = credited.reduce((s, e) => s + (e.bonus_amount || 0), 0);

    // Build per-referred-agent summary
    const referredIds = (referredAgents || []).map(a => a.id);
    const orderCountByAgent: Record<string, number> = {};
    const profitByAgent: Record<string, number> = {};
    const bonusByAgent: Record<string, number> = {};
    const lastSaleByAgent: Record<string, string> = {};

    if (referredIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('agent_id, agent_profit, created_at')
        .in('agent_id', referredIds)
        .eq('status', 'success');

      (orders || []).forEach(o => {
        if (!o.agent_id) return;
        orderCountByAgent[o.agent_id] = (orderCountByAgent[o.agent_id] || 0) + 1;
        profitByAgent[o.agent_id] = (profitByAgent[o.agent_id] || 0) + (o.agent_profit || 0);
        if (!lastSaleByAgent[o.agent_id] || o.created_at > lastSaleByAgent[o.agent_id]) {
          lastSaleByAgent[o.agent_id] = o.created_at;
        }
      });

      credited.forEach(e => {
        bonusByAgent[e.referred_id] = (bonusByAgent[e.referred_id] || 0) + (e.bonus_amount || 0);
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const referralLink = `${siteUrl}/register?ref=${agent.slug}`;

    const referrals = (referredAgents || []).map(a => ({
      agentName:   a.name,
      agentSlug:   a.slug,
      joinedAt:    a.created_at,
      totalOrders: orderCountByAgent[a.id] || 0,
      totalProfit: parseFloat((profitByAgent[a.id] || 0).toFixed(2)),
      bonusEarned: parseFloat((bonusByAgent[a.id] || 0).toFixed(2)),
      lastSaleAt:  lastSaleByAgent[a.id] || null,
      isActive:    a.status === 'active',
    }));

    return NextResponse.json({
      referralLink,
      referralPct,
      referralEnabled,
      usesSubagentPricing: !!agent.can_set_subagent_prices,
      totalReferrals:  (referredAgents || []).length,
      activeReferrals: (referredAgents || []).filter(a => a.status === 'active').length,
      totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
      referrals,
      recentEarnings: credited.slice(0, 10),
    });
  } catch (e) {
    console.error('[referral/stats]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
