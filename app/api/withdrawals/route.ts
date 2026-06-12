// app/api/withdrawals/route.ts — FIXED VERSION
// Fixes:
//   1. agent_profit NULL fallback: derive from (agent_price - admin_price) if null/zero
//   2. Balance check no longer skippable when type is missing
//   3. Better error messages showing the breakdown so you can debug

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendWithdrawalRequestEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  const supabase = createSupabaseAdminClient();

  const query = supabase.from('withdrawals').select('*').order('requested_at', { ascending: false });
  if (agentId) query.eq('agent_id', agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, amount, momoNumber, momoName, network, type } = await req.json();

    if (!amount || !momoNumber || !momoName || !network) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount < 20) {
      return NextResponse.json({ error: 'Minimum withdrawal is GHS 20.00' }, { status: 400 });
    }

    // ── Require agentId for agent withdrawals ─────────────────
    // BUG FIX: previously if `type` was missing/undefined the balance
    // check was skipped entirely and the withdrawal saved with no validation.
    // Now we always require agentId and always validate.
    if (!agentId) {
      return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // ── Validate agent exists ─────────────────────────────────
    let agentName = 'Unknown Agent';
    let agentSlug = '';

    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, slug')
      .eq('id', agentId)
      .single();

    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    agentName = agent.name;
    agentSlug = agent.slug;

    // ── Calculate real earnings with NULL fallback ────────────
    // BUG FIX: agent_profit is NULL on many old orders because it was never
    // written to the DB. We fall back to (agent_price - admin_price) which
    // is the actual profit the agent earned on that sale.
    const { data: orders } = await supabase
      .from('orders')
      .select('agent_profit, agent_price, admin_price')  // fetch prices too for fallback
      .eq('agent_id', agentId)
      .eq('status', 'success');

    const totalEarned = (orders || []).reduce((s, o) => {
      // Use stored agent_profit if it's a real positive number
      if (o.agent_profit !== null && o.agent_profit !== undefined && o.agent_profit > 0) {
        return s + o.agent_profit;
      }
      // Fallback: derive from price difference (handles old orders with NULL agent_profit)
      const derived = (o.agent_price ?? 0) - (o.admin_price ?? 0);
      return s + (derived > 0 ? derived : 0);
    }, 0);

    // ── Count ALL committed withdrawals ───────────────────────
    const { data: prevWds } = await supabase
      .from('withdrawals')
      .select('amount')
      .eq('agent_id', agentId)
      .in('status', ['pending', 'approved', 'paid']);

    const totalCommitted = (prevWds || []).reduce((s, w) => s + (w.amount || 0), 0);
    const available = totalEarned - totalCommitted;

    // Log for debugging — check your Vercel/server logs
    console.log(
      `[withdrawal] agent=${agentSlug} earned=${totalEarned.toFixed(2)} ` +
      `committed=${totalCommitted.toFixed(2)} available=${available.toFixed(2)} ` +
      `requested=${amount}`
    );

    if (amount > available + 0.01) {  // +0.01 for floating point tolerance
      return NextResponse.json({
        error: `Insufficient balance. Available: ₵${available.toFixed(2)} ` +
               `(Earned: ₵${totalEarned.toFixed(2)}, Already committed: ₵${totalCommitted.toFixed(2)})`,
      }, { status: 400 });
    }

    // ── Save withdrawal ───────────────────────────────────────
    const { data, error } = await supabase
      .from('withdrawals')
      .insert({
        type:         type || 'agent',
        agent_id:     agentId,
        amount,
        momo_number:  momoNumber,
        momo_name:    momoName,
        network,
        status:       'pending',
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Send admin email notification (non-blocking) ──────────
    sendWithdrawalRequestEmail({
      agentName,
      agentSlug,
      amount,
      momoNumber,
      momoName,
      network,
      withdrawalId:  data.id,
      requestedAt:   data.requested_at,
    }).catch(e => console.error('[withdrawals] email error:', e));

    return NextResponse.json({ success: true, withdrawal: data });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, note } = await req.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('withdrawals')
      .update({ status, note, resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
