// app/api/wallet/purchase/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey, getDefaultAdminPrice } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { genRef } from '@/lib/utils';
import { creditReferralBonus, reverseReferralBonus } from '@/lib/referral';

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
    // SECURITY FIX: agentPrice used to be taken directly from the request body
    // and used as-is to deduct from the wallet, with no server-side check that
    // it was >= the admin floor. That let a crafted request set an arbitrary
    // (even negative-margin) price. It's no longer read from the body at all —
    // the real price is looked up from the agent's own saved price row below.
    const { agentId, phone, network, bundleKey, source, agentSlug } = body;

    if (!agentId || !phone || !network || !bundleKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const bundle = getBundleByKey(bundleKey);
    if (!bundle) return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // SECURITY FIX: this ownership check was missing entirely. Without it,
    // any authenticated agent could pass a *different* agent's agentId in the
    // body and this route would happily deduct from that other agent's wallet.
    const { data: agentRow } = await supabase
      .from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: adminPriceRow } = await supabase
      .from('admin_prices').select('selling_price').eq('bundle_key', bundleKey).single();

    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);

    // SECURITY FIX: agentPrice is now derived server-side from the agent's own
    // saved price row (set via /api/agents/prices, which already enforces the
    // floor at save time). We clamp to adminPrice again here as a second line
    // of defense in case a saved row predates a floor change.
    let finalAgentPrice = adminPrice;
    if (source === 'agent') {
      const { data: savedPrice } = await supabase
        .from('agent_prices')
        .select('agent_price')
        .eq('agent_id', agentId)
        .eq('bundle_key', bundleKey)
        .single();
      finalAgentPrice = Math.max(savedPrice?.agent_price ?? adminPrice, adminPrice);
    }

    const grossAgentProfit = source === 'agent' ? finalAgentPrice - adminPrice : 0;

    const reference = genRef('WAL');

    const { data: wallet } = await supabase
      .from('wallets').select('*').eq('agent_id', agentId).single();

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    if (wallet.is_frozen) {
      return NextResponse.json({ error: 'Your wallet is frozen. Contact support.' }, { status: 403 });
    }
    if (wallet.balance < finalAgentPrice) {
      return NextResponse.json({
        error: `Insufficient wallet balance. Available: GHS ${wallet.balance.toFixed(2)}, Required: GHS ${finalAgentPrice.toFixed(2)}`,
      }, { status: 400 });
    }

    const newBalance = wallet.balance - finalAgentPrice;

    // Deduct from wallet atomically
    const { data: deducted, error: deductErr } = await supabase
      .from('wallets')
      .update({
        balance:     newBalance,
        total_spent: wallet.total_spent + finalAgentPrice,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', wallet.id)
      .eq('balance', wallet.balance)   // optimistic lock
      .gte('balance', finalAgentPrice)
      .select()
      .single();

    if (deductErr || !deducted) {
      return NextResponse.json({
        error: 'Could not lock wallet funds — balance may have changed. Please try again.',
      }, { status: 409 });
    }

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
      // Roll back wallet deduction
      await supabase.from('wallets').update({
        balance:     wallet.balance,
        total_spent: wallet.total_spent,
      }).eq('id', wallet.id);
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    let agentRowId: string | null = null;
    let referrerAgentId: string | null = null;
    if (source === 'agent' && agentSlug) {
      const { data: agentRow } = await supabase
        .from('agents').select('id, referred_by_id').eq('slug', agentSlug).single();
      if (agentRow) {
        agentRowId      = agentRow.id;
        referrerAgentId = agentRow.referred_by_id || null;
      }
    }

    // Deliver FIRST so we know actual_cost before inserting the order
    const deliveryResult = await deliverBundle({ bundle, network, phone, reference });
    const actualCost     = deliveryResult.actual_cost;
    const adminProfit    = adminPrice - actualCost;

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone,
        network,
        bundle_key:            bundleKey,
        size:                  bundle.size,
        volume:                bundle.volume,
        hubnet_cost:           actualCost,       // real provider cost
        admin_price:           adminPrice,
        admin_profit:          adminProfit,      // recalculated with real cost
        agent_price:           finalAgentPrice,
        agent_profit:          grossAgentProfit,
        agent_id:              agentRowId || (source !== 'agent' ? null : agentId),
        agent_slug:            agentSlug || null,
        referrer_agent_id:     referrerAgentId,
        source:                source || 'agent',
        status:                'success',
        delivery_status:       deliveryResult.success ? 'processing' : 'failed',
        delivery_provider:     deliveryResult.provider,
        hubnet_transaction_id: deliveryResult.orderId || null,
        payment_method:        'wallet',
        wallet_transaction_id: walletTxn.id,
        paystack_ref:          reference,
      })
      .select('id')
      .single();

    if (orderErr) {
      await refundWallet(supabase, wallet.id, agentId, finalAgentPrice, reference, 'Order save failed — auto refund');
      return NextResponse.json({ error: 'Failed to save order — wallet refunded' }, { status: 500 });
    }

    // If delivery failed, refund wallet immediately
    if (!deliveryResult.success) {
      await refundWallet(supabase, wallet.id, agentId, finalAgentPrice, reference, `Refund: delivery failed for ${reference}`);
      await reverseReferralBonus(supabase, order.id);
      return NextResponse.json({
        error: `Delivery failed: ${deliveryResult.message || 'Provider error'}. Your wallet has been refunded.`,
      }, { status: 502 });
    }

    // Credit referral bonus
    if (agentRowId && grossAgentProfit > 0) {
      try {
        const netProfit = await creditReferralBonus(supabase, order.id, agentRowId, grossAgentProfit);
        if (netProfit !== grossAgentProfit) {
          await supabase.from('orders').update({
            agent_profit:   netProfit,
            referral_bonus: parseFloat((grossAgentProfit - netProfit).toFixed(2)),
          }).eq('id', order.id);
        }
      } catch (e) {
        console.error('[wallet purchase] referral credit error:', e);
      }
    }

    return NextResponse.json({ success: true, reference, newBalance });

  } catch (e) {
    console.error('[wallet purchase] Unexpected error:', e);
    return NextResponse.json({ error: 'Server error processing wallet purchase' }, { status: 500 });
  }
}

async function refundWallet(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  walletId: string,
  agentId: string,
  amount: number,
  orderRef: string,
  description: string,
) {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', walletId).single();
  if (!wallet) return;
  const newBalance = wallet.balance + amount;
  await supabase.from('wallets').update({
    balance:     newBalance,
    total_spent: Math.max(0, wallet.total_spent - amount),
    updated_at:  new Date().toISOString(),
  }).eq('id', walletId);
  await supabase.from('wallet_transactions').insert({
    wallet_id:      walletId,
    agent_id:       agentId,
    type:           'refund',
    amount,
    balance_before: wallet.balance,
    balance_after:  newBalance,
    reference:      `RFD-${orderRef}`,
    status:         'success',
    description,
  });
}
