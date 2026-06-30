// lib/referral.ts
// Referral commission system.
// MONEY MODEL: Bonus is deducted from sub-agent's profit.
// Sub-agent keeps grossProfit × (1 - pct/100).
// Referrer's wallet is credited immediately.
// MUTUAL EXCLUSIVITY: If referrer has can_set_subagent_prices=true,
// commission is skipped — they earn through price control instead.

import { createSupabaseAdminClient } from '@/lib/supabase-server';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Credits a referral bonus to the referring agent's wallet whenever
 * a referred sub-agent completes a successful order.
 *
 * @param supabase          Admin client (pass in to avoid creating multiple)
 * @param orderId           The completed order's ID
 * @param agentId           The sub-agent (seller) ID
 * @param grossAgentProfit  agent_price - admin_price (before referral deduction)
 * @returns netAgentProfit  What the sub-agent actually keeps after bonus deduction
 */
export async function creditReferralBonus(
  supabase: SupabaseAdmin,
  orderId:          string,
  agentId:          string,
  grossAgentProfit: number,
): Promise<number> {
  // Default: sub-agent keeps everything if anything goes wrong
  const defaultReturn = grossAgentProfit;

  try {
    if (!agentId || grossAgentProfit <= 0) return defaultReturn;

    // 1. Check if referral programme is globally enabled
    const { data: settings } = await supabase
      .from('app_settings')
      .select('referral_pct, referral_enabled')
      .eq('id', 1)
      .single();

    if (!settings?.referral_enabled) return defaultReturn;

    const pct = parseFloat(String(settings?.referral_pct ?? 10));
    if (pct <= 0) return defaultReturn;

    // 2. Does this agent have a referrer?
    const { data: agent } = await supabase
      .from('agents')
      .select('referred_by')
      .eq('id', agentId)
      .single();

    if (!agent?.referred_by) return defaultReturn;

    // 3. Look up the referrer
    const { data: referrer } = await supabase
      .from('agents')
      .select('id, status, can_set_subagent_prices')
      .eq('slug', agent.referred_by)
      .single();

    if (!referrer) return defaultReturn;

    // 4. MUTUAL EXCLUSIVITY: if referrer uses sub-agent pricing, skip commission
    if (referrer.can_set_subagent_prices) {
      console.log(`[referral] Skipping commission — referrer ${agent.referred_by} uses sub-agent pricing`);
      return defaultReturn;
    }

    // 5. Referrer must be active
    if (referrer.status !== 'active') {
      await supabase.from('referral_earnings').insert({
        referrer_id:     referrer.id,
        referred_id:     agentId,
        order_id:        orderId,
        referred_profit: grossAgentProfit,
        pct,
        bonus_amount:    0,
        status:          'skipped',
        skip_reason:     `Referrer account is ${referrer.status}`,
      }).then(() => {});
      return defaultReturn;
    }

    // 6. Calculate bonus
    const bonusAmount = parseFloat(((grossAgentProfit * pct) / 100).toFixed(2));
    if (bonusAmount <= 0) return defaultReturn;

    // 7. Net profit for sub-agent (never go below 0)
    const netProfit = parseFloat(Math.max(0, grossAgentProfit - bonusAmount).toFixed(2));

    // Guard: if net profit would be 0 or negative, skip bonus
    if (netProfit <= 0) {
      console.warn(`[referral] Skipping bonus — would leave sub-agent with ≤0 profit on order ${orderId}`);
      return defaultReturn;
    }

    // 8. Record the referral earning (unique index prevents double-credit)
    const { error: earnErr } = await supabase
      .from('referral_earnings')
      .insert({
        referrer_id:     referrer.id,
        referred_id:     agentId,
        order_id:        orderId,
        referred_profit: grossAgentProfit,
        pct,
        bonus_amount:    bonusAmount,
        status:          'credited',
      });

    if (earnErr) {
      if (earnErr.code === '23505') {
        // Already credited for this order — return original profit, no deduction
        console.warn('[referral] Duplicate bonus attempt for order:', orderId);
        return defaultReturn;
      }
      console.error('[referral] Insert error:', earnErr);
      return defaultReturn; // on error, don't deduct from sub-agent
    }

    // 9. Credit referrer's wallet
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', referrer.id)
      .single();

    const ref = `REF-${orderId.slice(0, 8).toUpperCase()}`;
    const desc = `Referral bonus ${pct}% — order ${orderId.slice(0, 8).toUpperCase()}`;
    const meta = { order_id: orderId, referred_agent_id: agentId, pct };

    if (!wallet) {
      // Create wallet for referrer if it doesn't exist yet
      const { data: newWallet } = await supabase
        .from('wallets')
        .insert({ agent_id: referrer.id, balance: bonusAmount, total_deposited: bonusAmount })
        .select()
        .single();

      if (newWallet) {
        await supabase.from('wallet_transactions').insert({
          wallet_id: newWallet.id, agent_id: referrer.id,
          type: 'bonus', amount: bonusAmount,
          balance_before: 0, balance_after: bonusAmount,
          reference: ref, status: 'success', description: desc, metadata: meta,
        });
      }
    } else if (wallet.is_frozen) {
      // Record earning but don't credit frozen wallet
      await supabase
        .from('referral_earnings')
        .update({ status: 'frozen', skip_reason: 'Referrer wallet is frozen' })
        .eq('order_id', orderId);
      console.warn(`[referral] Referrer ${referrer.id} wallet frozen — bonus recorded but not credited`);
    } else {
      const newBalance = parseFloat((wallet.balance + bonusAmount).toFixed(2));
      await supabase.from('wallets').update({
        balance:         newBalance,
        total_deposited: wallet.total_deposited + bonusAmount,
        updated_at:      new Date().toISOString(),
      }).eq('id', wallet.id);

      await supabase.from('wallet_transactions').insert({
        wallet_id: wallet.id, agent_id: referrer.id,
        type: 'bonus', amount: bonusAmount,
        balance_before: wallet.balance, balance_after: newBalance,
        reference: ref, status: 'success', description: desc, metadata: meta,
      });
    }

    console.log(`[referral] ✅ Bonus GHS ${bonusAmount} credited to ${agent.referred_by} for order ${orderId}`);
    return netProfit;

  } catch (e) {
    console.error('[referral] creditReferralBonus unexpected error:', e);
    return defaultReturn; // never break the main order flow
  }
}

/**
 * Reverses a referral bonus when an order is refunded.
 * Deducts from referrer's wallet and marks earning as reversed.
 */
export async function reverseReferralBonus(
  supabase: SupabaseAdmin,
  orderId: string,
): Promise<void> {
  try {
    const { data: earning } = await supabase
      .from('referral_earnings')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'credited')
      .single();

    if (!earning) return; // no bonus to reverse

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', earning.referrer_id)
      .single();

    if (wallet) {
      const newBalance = parseFloat(Math.max(0, wallet.balance - earning.bonus_amount).toFixed(2));
      await supabase.from('wallets').update({
        balance:    newBalance,
        updated_at: new Date().toISOString(),
      }).eq('id', wallet.id);

      await supabase.from('wallet_transactions').insert({
        wallet_id:      wallet.id,
        agent_id:       earning.referrer_id,
        type:           'reversal',
        amount:         -earning.bonus_amount,
        balance_before: wallet.balance,
        balance_after:  newBalance,
        reference:      `REV-${orderId.slice(0, 8).toUpperCase()}`,
        status:         'success',
        description:    `Referral bonus reversal — order ${orderId.slice(0, 8).toUpperCase()}`,
        metadata:       { order_id: orderId },
      });
    }

    await supabase
      .from('referral_earnings')
      .update({ status: 'reversed', reversed_at: new Date().toISOString() })
      .eq('order_id', orderId);

    console.log(`[referral] Reversed bonus for order ${orderId}`);
  } catch (e) {
    console.error('[referral] reverseReferralBonus error:', e);
  }
}
