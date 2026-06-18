// app/api/wallet/purchase/route.ts — NEW FILE
//
// Handles placing an order paid for from wallet balance.
// Mirrors the logic in /api/paystack/verify but skips Paystack entirely:
// funds are deducted from the wallet atomically, then delivery is attempted
// via XpresPortal exactly like the Paystack flow.
//
// SAFETY: The deduction below is a single conditional UPDATE — it only
// affects a row if the balance at write-time still matches what was read
// AND still covers the purchase amount. This is a compare-and-swap pattern
// that prevents double-spending from two concurrent requests without
// needing a database transaction or separate RPC function.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { xpresOrder } from '@/lib/xpresportal';
import { getBundleByKey, getDefaultAdminPrice, getXpresParams } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { genRef } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`wallet-purchase:${ip}`, 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { agentId, phone, network, bundleKey, source, agentSlug, agentPrice } = body;

    if (!agentId || !phone || !network || !bundleKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const bundle = getBundleByKey(bundleKey);
    if (!bundle) return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // ── Ownership check — the authenticated user must own this agent/wallet ──
    const { data: agentRow } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Resolve pricing exactly like the Paystack verify route ──
    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price, admin_profit')
      .eq('bundle_key', bundleKey)
      .single();

    const adminPrice  = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const adminProfit = adminPriceRow?.admin_profit ?? (adminPrice - bundle.cost);
    const finalAgentPrice = agentPrice ?? adminPrice;
    const agentProfit = source === 'agent' ? finalAgentPrice - adminPrice : 0;

    const reference = genRef('WAL');

    // ── Fetch wallet ─────────────────────────────────────────
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    if (wallet.is_frozen) {
      return NextResponse.json({ error: 'Your wallet is frozen. Contact support.' }, { status: 403 });
    }
    if (wallet.balance < finalAgentPrice) {
      return NextResponse.json({
        error: `Insufficient wallet balance. Available: GHS ${wallet.balance.toFixed(2)}, Required: GHS ${finalAgentPrice.toFixed(2)}`,
      }, { status: 400 });
    }

    // ── ATOMIC DEDUCTION ────────────────────────────────────
    // Conditional update: only succeeds if balance is still >= amount
    // at the time of the write. This prevents a race where two
    // concurrent requests both pass the balance check above but
    // only one should actually succeed.
    const newBalance = wallet.balance - finalAgentPrice;
    const { data: deducted, error: deductErr } = await supabase
      .from('wallets')
      .update({
        balance: newBalance,
        total_spent: wallet.total_spent + finalAgentPrice,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id)
      .eq('balance', wallet.balance) // optimistic lock — fails if balance changed since we read it
      .gte('balance', finalAgentPrice)
      .select()
      .single();

    if (deductErr || !deducted) {
      return NextResponse.json({
        error: 'Could not lock wallet funds — your balance may have just changed. Please try again.',
      }, { status: 409 });
    }

    // ── Record the deduction transaction ────────────────────
    const { data: walletTxn, error: txnErr } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id:      wallet.id,
        agent_id:       agentId,
        type:           'purchase',
        amount:         finalAgentPrice,
        balance_before: wallet.balance,
        balance_after:  newBalance,
        reference,
        status:         'success',
        description:    `${bundle.size} ${network.toUpperCase()} data bundle`,
        metadata:       { bundle_key: bundleKey, phone, network },
      })
      .select()
      .single();

    if (txnErr) {
      // Roll back the deduction since we couldn't record the ledger entry
      await supabase.from('wallets').update({
        balance: wallet.balance,
        total_spent: wallet.total_spent,
      }).eq('id', wallet.id);
      console.error('[wallet purchase] txn insert failed, rolled back:', txnErr);
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    // ── Create the order (mirrors paystack/verify) ──────────
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone,
        network,
        bundle_key: bundleKey,
        size: bundle.size,
        volume: bundle.volume,
        hubnet_cost: bundle.cost,
        admin_price: adminPrice,
        admin_profit: adminProfit,
        agent_price: finalAgentPrice,
        agent_profit: agentProfit,
        // Wallet purchases are always self-service: the agent is spending
        // their own preloaded wallet balance, so agent_id is always the
        // wallet owner — no slug lookup needed (that pattern is only for
        // customer-facing storefront orders going through Paystack).
        agent_id: agentId,
        agent_slug: agentSlug || null,
        source: source || 'agent',
        status: 'success',
        delivery_status: 'pending',
        payment_method: 'wallet',
        wallet_transaction_id: walletTxn.id,
        paystack_ref: reference,
      })
      .select('id')
      .single();

    if (orderErr) {
      // Refund the wallet since the order failed to save
      await refundWallet(supabase, wallet.id, agentId, finalAgentPrice, reference, 'Order save failed — auto refund');
      console.error('[wallet purchase] order insert error, refunded:', orderErr);
      return NextResponse.json({ error: 'Failed to save order — wallet refunded' }, { status: 500 });
    }

    // ── Attempt delivery ─────────────────────────────────────
    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const siteUrl = rawUrl && !rawUrl.includes('localhost')
      ? rawUrl
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

    const { network: xpresNetwork, offerSlug, volumeGB } = getXpresParams({ ...bundle, network });
    const webhookUrl = siteUrl
      ? `${siteUrl}/api/xpresportal/webhook?internalRef=${encodeURIComponent(reference)}`
      : undefined;

    try {
      const xpresResult = await xpresOrder({ network: xpresNetwork, phone, volume: volumeGB, offerSlug, reference, webhookUrl });

      if (xpresResult.success) {
        await supabase.from('orders').update({
          delivery_status: 'processing',
          hubnet_transaction_id: xpresResult.orderId || xpresResult.reference || null,
        }).eq('id', order.id);
      } else {
        // Delivery failed — auto refund the wallet (per refund system requirement)
        await supabase.from('orders').update({ delivery_status: 'failed' }).eq('id', order.id);
        await refundWallet(supabase, wallet.id, agentId, finalAgentPrice, reference, `Refund: delivery failed for ${reference}`);
      }
    } catch (xpresErr) {
      console.error('[wallet purchase] xpresOrder threw:', xpresErr);
      await supabase.from('orders').update({ delivery_status: 'pending' }).eq('id', order.id);
      // Leave funds deducted; admin can retry delivery. If retry ultimately
      // fails, the retry-delivery route should also trigger a refund (see below).
    }

    return NextResponse.json({
      success: true,
      reference,
      newBalance,
    });
  } catch (e) {
    console.error('[wallet purchase] Unexpected error:', e);
    return NextResponse.json({ error: 'Server error processing wallet purchase' }, { status: 500 });
  }
}

// ── Shared refund helper ────────────────────────────────────
async function refundWallet(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  walletId: string,
  agentId: string,
  amount: number,
  orderRef: string,
  description: string
) {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', walletId).single();
  if (!wallet) return;

  const newBalance = wallet.balance + amount;
  await supabase.from('wallets').update({
    balance: newBalance,
    total_spent: Math.max(0, wallet.total_spent - amount),
    updated_at: new Date().toISOString(),
  }).eq('id', walletId);

  await supabase.from('wallet_transactions').insert({
    wallet_id: walletId,
    agent_id: agentId,
    type: 'refund',
    amount,
    balance_before: wallet.balance,
    balance_after: newBalance,
    reference: `RFD-${orderRef}`,
    status: 'success',
    description,
  });
}
