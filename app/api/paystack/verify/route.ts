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
    return NextResponse.json({ error: 'Too many requests. Please wait before trying again.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter) },
    });
  }

  try {
    const body = await req.json();
    const parsed = VerifyPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
    }
    const { reference, orderData } = parsed.data;

    const paystack = await verifyPaystackPayment(reference);
    if (!paystack.success) {
      const detail = paystack as { txStatus?: string };
      const isAbandoned = detail?.txStatus === 'abandoned';
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
      .from('orders')
      .select('id, status, delivery_status')
      .eq('reference', reference)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, reference, status: existing.status });
    }

    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price, admin_profit')
      .eq('bundle_key', orderData.bundleKey)
      .single();

    const adminPrice  = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const adminProfit = adminPriceRow?.admin_profit  ?? (adminPrice - bundle.cost);

    let agentId: string | null = null;
    let referrerAgentId: string | null = null;
    let grossAgentProfit = 0;
    const agentPrice = orderData.agentPrice ?? adminPrice;

    if (orderData.source === 'agent' && orderData.agentSlug) {
      const { data: agent } = await supabase
        .from('agents').select('id, referred_by').eq('slug', orderData.agentSlug).single();
      if (agent) {
        agentId          = agent.id;
        grossAgentProfit = agentPrice - adminPrice;

        // Resolve referrer's agent ID for the audit trail column (if any)
        if (agent.referred_by) {
          const { data: referrer } = await supabase
            .from('agents').select('id').eq('slug', agent.referred_by).single();
          referrerAgentId = referrer?.id || null;
        }
      }
    }

    // Insert order with gross profit first — may be adjusted below
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone:              orderData.phone,
        network:            orderData.network,
        bundle_key:         orderData.bundleKey,
        size:               bundle.size,
        volume:             bundle.volume,
        hubnet_cost:        bundle.cost,
        admin_price:        adminPrice,
        admin_profit:       adminProfit,
        agent_price:        agentPrice,
        agent_profit:       grossAgentProfit,
        agent_id:           agentId,
        agent_slug:         orderData.agentSlug || null,
        referrer_agent_id:  referrerAgentId,
        source:             orderData.source || 'main',
        status:             'success',
        delivery_status:    'pending',
        paystack_ref:       reference,
      })
      .select('id')
      .single();

    if (orderErr) {
      return NextResponse.json({ error: 'Failed to save order', detail: orderErr.message }, { status: 500 });
    }

    // Credit referral bonus — deducts from sub-agent's profit, credits referrer's wallet.
    // Returns the NET profit the sub-agent keeps (may equal gross if no referrer applies).
    if (agentId && grossAgentProfit > 0) {
      try {
        const netProfit = await creditReferralBonus(supabase, order.id, agentId, grossAgentProfit);
        if (netProfit !== grossAgentProfit) {
          const bonusPaid = parseFloat((grossAgentProfit - netProfit).toFixed(2));
          await supabase.from('orders').update({
            agent_profit:   netProfit,
            referral_bonus: bonusPaid,
          }).eq('id', order.id);
        }
      } catch (e) {
        console.error('[verify] referral credit error:', e);
        // Non-fatal — order keeps gross profit if referral crediting fails
      }
    }

    // Attempt delivery
    try {
      const result = await deliverBundle({
        bundle, network: orderData.network, phone: orderData.phone, reference,
      });

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
      }
    } catch (deliveryErr) {
      console.error('[verify] Delivery error:', deliveryErr);
      await supabase.from('orders').update({ delivery_status: 'pending' }).eq('id', order.id);
    }

    return NextResponse.json({ success: true, reference, status: 'success' });

  } catch (e) {
    console.error('[verify] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
