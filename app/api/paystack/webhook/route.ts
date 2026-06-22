import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey, getDefaultAdminPrice } from '@/lib/bundles';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-paystack-signature') || '';
    const secret = process.env.PAYSTACK_SECRET_KEY || '';

    // Verify webhook signature
    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');
    if (hash !== signature) {
      console.warn('[paystack webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    console.log('[paystack webhook] Event:', event.event, 'Reference:', event.data?.reference);

    if (event.event !== 'charge.success') {
      return NextResponse.json({ received: true });
    }

    const reference: string = event.data?.reference;
    if (!reference) return NextResponse.json({ received: true });

    const supabase = createSupabaseAdminClient();

    // Check if verify route already handled this (it should have)
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status, delivery_status')
      .eq('reference', reference)
      .maybeSingle();

    if (existing) {
      console.log('[paystack webhook] Order already exists for', reference, '— skipping duplicate');
      return NextResponse.json({ received: true });
    }

    // The verify route should always create the order first.
    // This webhook is a FALLBACK for cases where the verify route was not called
    // (e.g. user closed the browser immediately after payment).
    console.log('[paystack webhook] Order not found — creating as fallback for', reference);

    const meta = event.data?.metadata || {};
    const customFields: Array<{ variable_name: string; value: string }> =
      meta?.custom_fields || [];

    const phone =
      customFields.find((f: { variable_name: string }) => f.variable_name === 'phone')?.value ||
      meta?.phone ||
      event.data?.customer?.email?.split('@')[0] ||
      '';

    const network: string =
      customFields.find((f: { variable_name: string }) => f.variable_name === 'network')?.value ||
      meta?.network ||
      '';

    const volume: string =
      customFields.find((f: { variable_name: string }) => f.variable_name === 'volume')?.value ||
      meta?.volume ||
      '';

    const bundleKey: string = meta?.bundle_key || '';
    const agentSlug: string = meta?.agent_slug || '';
    const source: string = meta?.source || 'main';
    const agentPrice: number = Number(meta?.agent_price) || 0;

    let bundle = getBundleByKey(bundleKey);
    if (!bundle && network && volume) {
      const { ALL_BUNDLES } = await import('@/lib/bundles');
      bundle = ALL_BUNDLES.find(b => b.network === network && b.volume === volume);
    }
    if (!bundle) {
      console.warn('[paystack webhook] Could not find bundle. key:', bundleKey);
      return NextResponse.json({ received: true });
    }

    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price')
      .eq('bundle_key', bundle.key)
      .single();

    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const finalAgentPrice = agentPrice || adminPrice;

    let agentId: string | null = null;
    if (source === 'agent' && agentSlug) {
      const { data: agent } = await supabase
        .from('agents').select('id').eq('slug', agentSlug).single();
      if (agent) agentId = agent.id;
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone,
        network,
        bundle_key: bundle.key,
        size: bundle.size,
        volume: bundle.volume,
        hubnet_cost: bundle.cost,
        admin_price: adminPrice,
        admin_profit: adminPrice - bundle.cost,
        agent_price: finalAgentPrice,
        agent_profit: finalAgentPrice - adminPrice,
        agent_id: agentId,
        agent_slug: agentSlug || null,
        source,
        status: 'success',
        delivery_status: 'pending',
        paystack_ref: reference,
      })
      .select()
      .single();

    if (orderErr) {
      console.error('[paystack webhook] Order insert error:', orderErr);
      return NextResponse.json({ received: true });
    }

    console.log('[paystack webhook] Fallback order created:', order.id);

    // Attempt delivery — dispatcher picks XpresPortal or Hubnet based on
    // the active provider toggle (Telecel always forced to XpresPortal).
    try {
      const result = await deliverBundle({ bundle, network, phone, reference });
      console.log('[paystack webhook] Delivery result:', JSON.stringify(result));

      if (result.success) {
        await supabase.from('orders').update({
          delivery_status: 'processing',
          delivery_provider: result.provider,
          hubnet_transaction_id: result.orderId || null,
        }).eq('id', order.id);
      } else {
        await supabase.from('orders').update({
          delivery_status: 'failed',
          delivery_provider: result.provider,
        }).eq('id', order.id);
      }
    } catch (e) {
      console.error('[paystack webhook] Delivery error:', e);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[paystack webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
