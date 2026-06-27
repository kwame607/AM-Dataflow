// lib/referral.ts
// Credits the referral bonus to the referrer whenever a referred agent
// completes a successful order. Called from verify/route.ts and the
// Paystack webhook fallback after the order is saved.

import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getReferralPct } from '@/lib/settings';

/**
 * If the agent who placed this order was referred by someone, credit
 * 10% (or current rate) of their profit to the referrer.
 * Idempotent — the unique index on order_id prevents double-crediting.
 */
export async function creditReferralBonus(params: {
  orderId:     string;
  agentId:     string;
  agentProfit: number;
}): Promise<void> {
  const { orderId, agentId, agentProfit } = params;

  // Nothing to credit if there's no real profit
  if (!agentId || agentProfit <= 0) return;

  try {
    const supabase = createSupabaseAdminClient();

    // 1. Find who referred this agent
    const { data: agent } = await supabase
      .from('agents')
      .select('referred_by')
      .eq('id', agentId)
      .single();

    if (!agent?.referred_by) return; // not referred by anyone

    // 2. Find the referrer's id from their slug
    const { data: referrer } = await supabase
      .from('agents')
      .select('id')
      .eq('slug', agent.referred_by)
      .single();

    if (!referrer) return;

    // 3. Get current referral percentage
    const pct = await getReferralPct();
    const bonusAmount = parseFloat((agentProfit * pct / 100).toFixed(2));

    if (bonusAmount <= 0) return;

    // 4. Insert referral earning — unique index prevents duplicates
    const { error } = await supabase
      .from('referral_earnings')
      .insert({
        referrer_id:     referrer.id,
        referred_id:     agentId,
        order_id:        orderId,
        referred_profit: agentProfit,
        pct,
        bonus_amount:    bonusAmount,
      });

    if (error) {
      // Unique violation = already credited, that's fine
      if (error.code === '23505') return;
      console.error('[referral] Insert error:', error);
    } else {
      console.log(`[referral] Credited GHS ${bonusAmount} to referrer ${agent.referred_by} for order ${orderId}`);
    }
  } catch (e) {
    // Non-fatal — don't break order flow if referral crediting fails
    console.error('[referral] creditReferralBonus error:', e);
  }
}

/**
 * Get total referral earnings for an agent, minus what's been
 * committed to withdrawals already.
 */
export async function getReferralBalance(agentId: string): Promise<{
  totalEarned:  number;
  committed:    number;
  available:    number;
  earnings:     { bonus_amount: number; created_at: string; referred_id: string }[];
}> {
  const supabase = createSupabaseAdminClient();

  const [earningsRes, withdrawalsRes] = await Promise.all([
    supabase
      .from('referral_earnings')
      .select('bonus_amount, created_at, referred_id')
      .eq('referrer_id', agentId)
      .order('created_at', { ascending: false }),

    supabase
      .from('withdrawals')
      .select('amount')
      .eq('agent_id', agentId)
      .eq('type', 'referral')
      .in('status', ['pending', 'approved', 'paid']),
  ]);

  const earnings   = earningsRes.data  || [];
  const committed  = (withdrawalsRes.data || []).reduce((s, w) => s + (w.amount || 0), 0);
  const totalEarned = earnings.reduce((s, e) => s + (e.bonus_amount || 0), 0);
  const available  = Math.max(0, totalEarned - committed);

  return { totalEarned, committed, available, earnings };
}
