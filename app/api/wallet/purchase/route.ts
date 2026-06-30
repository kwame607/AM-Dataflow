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
    const { agentId, phone, network, bundleKey, source, agentSlug, agentPrice } = body;

    if (!agentId || !phone || !network || !bundleKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const bundle = getBundleByKey(bundleKey);
    if (!bundle) return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price, admin_profit')
      .eq('bundle_key', bundleKey)
      .single();

    const adminPrice  = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const adminProfit = adminPriceRow?.admin_profit ?? (adminPrice - bundle.cost);
    const finalAgentPrice = agentPrice ?? adminPrice;
    const grossAgentProfit = source === 'agent' ? finalAgentPrice - adminPrice : 0;

    const reference = genRef('WAL');

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

    const newBalance = wallet.balance - finalAgentPrice;
    const { data: deducted, error: deductErr } = await supabase
      .from('wallets')
      .update({
        balance: newBalance,
        total_spent: wallet.total_spent + finalAgentPrice,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id)
      .eq('balance', wallet.balance)
      .gte('balance', finalAgentPrice)
      .select()
      .single();

    if (deductErr || !deducted) {
      return NextResponse.json({
        error: 'Could not lock wallet funds — your balance may have just changed. Please try again.',
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
      await supabase.from('wallets').update({
        balance: wallet.balance,
        total_spent: wallet.total_spent,
      }).eq('id', wallet.id);
      console.error('[wallet purchase] txn insert failed, rolled back:', txnErr);
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    let agentRowId: string | null = null;
    let referrerAgentId: string | null = null;
    if (source === 'agent' && agentSlug) {
      const { data: agentRow } = await supabase.from('agents').select('id, referred_by').eq('slug', agentSlug).single();
      if (agentRow) {
        agentRowId = agentRow.id;
        if (agentRow.referred_by) {
          const { data: referrer } = await supabase.from('agents').select('id').eq('slug', agentRow.referred_by).single();
          referrerAgentId = referrer?.id || null;
        }
      }
    }

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
        agent_profit: grossAgentProfit,
        agent_id: agentRowId || (source !== 'agent' ? null : agentId),
        agent_slug: agentSlug || null,
        referrer_agent_id: referrerAgentId,
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
      await refundWallet(supabase, wallet.id, agentId, finalAgentPrice, reference, 'Order save failed — auto refund');
      console.error('[wallet purchase] order insert error, refunded:', orderErr);
      return NextResponse.json({ error: 'Failed to save order — wallet refunded' }, { status: 500 });
    }

    if (agentRowId && grossAgentProfit > 0) {
      try {
        const netProfit = await creditReferralBonus(supabase, order.id, agentRowId, grossAgentProfit);
        if (netProfit !== grossAgentProfit) {
          const bonusPaid = parseFloat((grossAgentProfit - netProfit).toFixed(2));
          await supabase.from('orders').update({
            agent_profit:   netProfit,
            referral_bonus: bonusPaid,
          }).eq('id', order.id);
        }
      } catch (e) {
        console.error('[wallet purchase] referral credit error:', e);
      }
    }

    try {
      const result = await deliverBundle({ bundle, network, phone, reference });

      if (result.success) {
        await supabase.from('orders').update({
          delivery_status:   'processing',
          delivery_provider: result.provider,
          hubnet_transaction_id: result.orderId || result.reference || null,
        }).eq('id', order.id);
      } else {
        await supabase.from('orders').update({
          delivery_status:   'failed',
          delivery_provider: result.provider,
        }).eq('id', order.id);
        await refundWallet(supabase, wallet.id, agentId, finalAgentPrice, reference, `Refund: delivery failed for ${reference}`);
        await reverseReferralBonus(supabase, order.id);
      }
    } catch (deliveryErr) {
      console.error('[wallet purchase] delivery threw:', deliveryErr);
      await supabase.from('orders').update({ delivery_status: 'pending' }).eq('id', order.id);
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
