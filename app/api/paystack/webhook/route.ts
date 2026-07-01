// app/api/paystack/webhook/route.ts
// Fallback for orders where verify route was never called (browser closed).
// Updated to store accurate hubnet_cost for whichever provider handles delivery.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey, getDefaultAdminPrice, getXpresParams } from '@/lib/bundles';

export async function POST(req: NextRequest) {
  try {
    const body      = await req.text();
    const signature = req.headers.get('x-paystack-signature') || '';
    const secret    = process.env.PAYSTACK_SECRET_KEY || '';

    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');
    if (hash !== signature) {
      console.warn('[paystack webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    if (event.event !== 'charge.success') return NextResponse.json({ received: true });

    const reference: string = event.data?.reference;
    if (!reference) return NextResponse.json({ received: true });

    const supabase = createSupabaseAdminClient();

    const { data: existing } = await supabase
      .from('orders').select('id, status').eq('reference', reference).maybeSingle();
    if (existing) return NextResponse.json({ received: true });

    const meta         = event.data?.metadata || {};
    const customFields: Array<{ variable_name: string; value: string }> = meta?.custom_fields || [];

    const phone      = customFields.find(f => f.variable_name === 'phone')?.value    || meta?.phone    || '';
    const network    = customFields.find(f => f.variable_name === 'network')?.value  || meta?.network  || '';
    const bundleKey  = meta?.bundle_key  || '';
    const agentSlug  = meta?.agent_slug  || '';
    const source     = meta?.source      || 'main';
    const agentPrice = Number(meta?.agent_price) || 0;

    const bundle = getBundleByKey(bundleKey);
    if (!bundle) {
      console.warn('[paystack webhook] Could not find bundle:', bundleKey);
      return NextResponse.json({ received: true });
    }

    const { data: adminPriceRow } = await supabase
      .from('admin_prices').select('selling_price').eq('bundle_key', bundle.key).single();

    const adminPrice     = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const finalAgentPrice = agentPrice || adminPrice;

    let agentId: string | null = null;
    let referrerAgentId: string | null = null;
    if (source === 'agent' && agentSlug) {
      const { data: agent } = await supabase
        .from('agents').select('id, referred_by_id').eq('slug', agentSlug).single();
      if (agent) {
        agentId         = agent.id;
        referrerAgentId = agent.referred_by_id || null;
      }
    }

    // Deliver first — get actual provider cost
    const deliveryResult = await deliverBundle({ bundle, network, phone, reference });
    const actualCost     = deliveryResult.actual_cost;
    const adminProfit    = adminPrice - actualCost;
    const grossAgentProfit = source === 'agent' ? finalAgentPrice - adminPrice : 0;

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone,
        network,
        bundle_key:            bundle.key,
        size:                  bundle.size,
        volume:                bundle.volume,
        hubnet_cost:           actualCost,
        admin_price:           adminPrice,
        admin_profit:          adminProfit,
        agent_price:           finalAgentPrice,
        agent_profit:          grossAgentProfit,
        agent_id:              agentId,
        agent_slug:            agentSlug || null,
        referrer_agent_id:     referrerAgentId,
        source,
        status:                'success',
        delivery_status:       deliveryResult.success ? 'processing' : 'failed',
        delivery_provider:     deliveryResult.provider,
        hubnet_transaction_id: deliveryResult.orderId || null,
        paystack_ref:          reference,
      })
      .select('id')
      .single();

    if (orderErr) {
      console.error('[paystack webhook] Order insert error:', orderErr);
      return NextResponse.json({ received: true });
    }

    console.log('[paystack webhook] Fallback order created:', order.id, 'via', deliveryResult.provider);
    return NextResponse.json({ received: true });

  } catch (e) {
    console.error('[paystack webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
