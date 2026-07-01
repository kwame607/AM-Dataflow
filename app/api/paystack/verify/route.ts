import { NextRequest, NextResponse } from 'next/server';
import { verifyPaystackPayment } from '@/lib/paystack';
import { deliverBundle } from '@/lib/delivery';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getBundleByKey, getDefaultAdminPrice } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { VerifyPaymentSchema } from '@/lib/validate';
import { creditReferralBonus } from '@/lib/referral';

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const rl = rateLimit(`verify:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, {
      status: 429, headers: { 'Retry-After': String(rl.retryAfter) },
    });
  }

  try {
    const body   = await req.json();
    const parsed = VerifyPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
    }
    const { reference, orderData } = parsed.data;

    const paystack = await verifyPaystackPayment(reference);
    if (!paystack.success) {
      const isAbandoned = (paystack as { txStatus?: string }).txStatus === 'abandoned';
      return NextResponse.json({
        error: isAbandoned
          ? 'Payment was not completed. Please try again.'
          : 'Payment verification failed. Contact support if you were charged.',
      }, { status: 400 });
    }

    const bundle = getBundleByKey(orderData.bundleKey);
    if (!bundle) return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const { data: existing } = await supabase
      .from('orders').select('id, status, delivery_status').eq('reference', reference).maybeSingle();
    if (existing) return NextResponse.json({ success: true, reference, status: existing.status });

    const { data: adminPriceRow } = await supabase
      .from('admin_prices').select('selling_price').eq('bundle_key', orderData.bundleKey).single();

    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);

    let agentId: string | null = null;
    let referrerAgentId: string | null = null;
    let grossAgentProfit = 0;
    const agentPrice = orderData.agentPrice ?? adminPrice;

    if (orderData.source === 'agent' && orderData.agentSlug) {
      const { data: agent } = await supabase
        .from('agents').select('id, referred_by_id').eq('slug', orderData.agentSlug).single();
      if (agent) {
        agentId          = agent.id;
        referrerAgentId  = agent.referred_by_id || null;
        grossAgentProfit = agentPrice - adminPrice;
      }
    }

    // Attempt delivery FIRST so we know the actual provider cost
    // before writing the order row — keeps hubnet_cost accurate.
    const deliveryResult = await deliverBundle({
      bundle, network: orderData.network, phone: orderData.phone, reference,
    });

    // actual_cost: what the provider charged us for this specific delivery
    const actualCost   = deliveryResult.actual_cost;
    const adminProfit  = adminPrice - actualCost;

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone:              orderData.phone,
        network:            orderData.network,
        bundle_key:         orderData.bundleKey,
        size:               bundle.size,
        volume:             bundle.volume,
        hubnet_cost:        actualCost,        // real cost for this provider
        admin_price:        adminPrice,
        admin_profit:       adminProfit,       // recalculated with real cost
        agent_price:        agentPrice,
        agent_profit:       grossAgentProfit,
        agent_id:           agentId,
        agent_slug:         orderData.agentSlug || null,
        referrer_agent_id:  referrerAgentId,
        source:             orderData.source || 'main',
        status:             'success',
        delivery_status:    deliveryResult.success ? 'processing' : 'failed',
        delivery_provider:  deliveryResult.provider,
        hubnet_transaction_id: deliveryResult.orderId || deliveryResult.reference || null,
        paystack_ref:       reference,
      })
      .select('id')
      .single();

    if (orderErr) {
      return NextResponse.json({ error: 'Failed to save order', detail: orderErr.message }, { status: 500 });
    }

    // Credit referral bonus now that order is saved
    if (agentId && grossAgentProfit > 0) {
      try {
        const netProfit = await creditReferralBonus(supabase, order.id, agentId, grossAgentProfit);
        if (netProfit !== grossAgentProfit) {
          await supabase.from('orders').update({
            agent_profit:   netProfit,
            referral_bonus: parseFloat((grossAgentProfit - netProfit).toFixed(2)),
          }).eq('id', order.id);
        }
      } catch (e) {
        console.error('[verify] referral credit error:', e);
      }
    }

    return NextResponse.json({ success: true, reference, status: 'success' });

  } catch (e) {
    console.error('[verify] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
