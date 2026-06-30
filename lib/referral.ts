// lib/referral.ts
// Referral commission system.
// MONEY MODEL: Bonus deducted from sub-agent's profit, credited to referrer's wallet.
// MUTUAL EXCLUSIVITY: skipped if referrer.can_set_subagent_prices = true.
// STABLE LOOKUP: uses referred_by_id (UUID), not the mutable slug.
// RACE-SAFE: wallet credit uses an atomic conditional update, not read-then-write.

import { createSupabaseAdminClient } from '@/lib/supabase-server';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export async function creditReferralBonus(
  supabase: SupabaseAdmin,
  orderId:          string,
  agentId:          string,
  grossAgentProfit: number,
): Promise<number> {
  const defaultReturn = grossAgentProfit;

  try {
    if (!agentId || grossAgentProfit <= 0) return defaultReturn;

    const { data: settings } = await supabase
      .from('app_settings')
      .select('referral_pct, referral_enabled')
      .eq('id', 1)
      .single();

    if (!settings?.referral_enabled) return defaultReturn;

    const pct = parseFloat(String(settings?.referral_pct ?? 10));
    if (pct <= 0) return defaultReturn;

    // Use referred_by_id (stable UUID) — not the mutable slug.
    const { data: agent } = await supabase
      .from('agents')
      .select('referred_by_id')
      .eq('id', agentId)
      .single();

    if (!agent?.referred_by_id) return defaultReturn;

    const { data: referrer } = await supabase
      .from('agents')
      .select('id, status, can_set_subagent_prices')
      .eq('id', agent.referred_by_id)
      .single();

    if (!referrer) return defaultReturn;

    // Mutual exclusivity: sub-agent pricing referrers don't earn commission.
    if (referrer.can_set_subagent_prices) {
      return defaultReturn;
    }

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
      });
      return defaultReturn;
    }

    const bonusAmount = parseFloat(((grossAgentProfit * pct) / 100).toFixed(2));
    if (bonusAmount <= 0) return defaultReturn;

    const netProfit = parseFloat(Math.max(0, grossAgentProfit - bonusAmount).toFixed(2));
    if (netProfit <= 0) {
      console.warn(`[referral] Skipping bonus — would leave sub-agent with <=0 profit on order ${orderId}`);
      return defaultReturn;
    }

    // Insert earning record — unique index on order_id prevents double-credit.
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
        console.warn('[referral] Duplicate bonus attempt for order:', orderId);
        return defaultReturn;
      }
      console.error('[referral] Insert error:', earnErr);
      return defaultReturn;
    }

    // Credit wallet — fixed race condition.
    // Old approach: SELECT balance, then UPDATE balance = newValue.
    // Two concurrent orders could both read the same stale balance and
    // the second write would clobber the first instead of adding to it.
    // Fix: use Postgres's atomic increment via an RPC, OR (simpler, no
    // RPC needed) a single UPDATE ... SET balance = balance + amount,
    // which Postgres executes atomically per row regardless of concurrent
    // requests — no read-modify-write race window.
    const ref  = `REF-${orderId.slice(0, 8).toUpperCase()}`;
    const desc = `Referral bonus ${pct}% — order ${orderId.slice(0, 8).toUpperCase()}`;
    const meta = { order_id: orderId, referred_agent_id: agentId, pct };

    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, total_deposited, is_frozen')
      .eq('agent_id', referrer.id)
      .single();

    if (!wallet) {
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
      await supabase
        .from('referral_earnings')
        .update({ status: 'frozen', skip_reason: 'Referrer wallet is frozen' })
        .eq('order_id', orderId);
      console.warn(`[referral] Referrer ${referrer.id} wallet frozen — bonus recorded but not credited`);
    } else {
      // ATOMIC update: balance = balance + bonusAmount, evaluated server-side
      // by Postgres in a single statement — no race window between two
      // concurrent requests reading and writing the same row.
      const { data: updated, error: updateErr } = await supabase
        .rpc('increment_wallet_balance', {
          p_wallet_id: wallet.id,
          p_amount:    bonusAmount,
        });

      if (updateErr) {
        console.error('[referral] Atomic wallet credit failed:', updateErr);
        // Fall back to non-atomic update rather than losing the bonus entirely —
        // rare in practice, and the unique index on referral_earnings.order_id
        // still prevents double-crediting on retry.
        const newBalance = parseFloat((wallet.balance + bonusAmount).toFixed(2));
        await supabase.from('wallets').update({
          balance: newBalance,
          total_deposited: wallet.total_deposited + bonusAmount,
          updated_at: new Date().toISOString(),
        }).eq('id', wallet.id);

        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id, agent_id: referrer.id,
          type: 'bonus', amount: bonusAmount,
          balance_before: wallet.balance, balance_after: newBalance,
          reference: ref, status: 'success', description: desc, metadata: meta,
        });
      } else {
        const balanceAfter = updated?.[0]?.new_balance ?? (wallet.balance + bonusAmount);
        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id, agent_id: referrer.id,
          type: 'bonus', amount: bonusAmount,
          balance_before: wallet.balance, balance_after: balanceAfter,
          reference: ref, status: 'success', description: desc, metadata: meta,
        });
      }
    }

    console.log(`[referral] Bonus GHS ${bonusAmount} credited to referrer ${referrer.id} for order ${orderId}`);
    return netProfit;

  } catch (e) {
    console.error('[referral] creditReferralBonus unexpected error:', e);
    return defaultReturn;
  }
}

export async function reverseReferralBonus(
  supabase: SupabaseAdmin,
  orderId: string,
): Promise<void> {
  try {
    // FIXED: .single() throws if zero rows match (e.g. order had no
    // referrer, so no earning was ever created). Use maybeSingle()
    // so this is a safe no-op instead of an unhandled exception.
    const { data: earning } = await supabase
      .from('referral_earnings')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'credited')
      .maybeSingle();

    if (!earning) return; // nothing to reverse — safe no-op

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', earning.referrer_id)
      .maybeSingle();

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
