import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { hubnetTransact } from '@/lib/hubnet';
import { getBundleByKey, getDefaultAdminPrice, getHubnetNetwork } from '@/lib/bundles';

const WEBHOOK = 'https://www.admunz.com/api/hubnet/webhook';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-paystack-signature') || '';
    const secret = process.env.PAYSTACK_SECRET_KEY || '';

    // Verify webhook signature
    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');
    if (hash !== signature) {
      console.warn('[webhook] Invalid Paystack signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    console.log('[webhook] Event:', event.event, 'Reference:', event.data?.reference);
    console.log('[webhook] Full metadata:', JSON.stringify(event.data?.metadata));

    if (event.event !== 'charge.success') {
      return NextResponse.json({ received: true });
    }

    const reference: string = event.data?.reference;
    if (!reference) return NextResponse.json({ received: true });

    const supabase = createSupabaseAdminClient();

    // Check if order already exists (verify route may have already created it)
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status')
      .eq('reference', reference)
      .maybeSingle();

    if (existing) {
      console.log('[webhook] Order already exists for', reference, '— skipping');
      return NextResponse.json({ received: true });
    }

    // Parse metadata — Paystack can nest it differently depending on flow
    const meta = event.data?.metadata || {};
    const customFields: Array<{ variable_name: string; value: string }> =
      meta?.custom_fields || [];

    // Try to get fields from custom_fields first, then top-level metadata
    const phone =
      customFields.find(f => f.variable_name === 'phone')?.value ||
      meta?.phone ||
      event.data?.customer?.email?.split('@')[0] ||
      '';

    const network: string =
      customFields.find(f => f.variable_name === 'network')?.value ||
      meta?.network ||
      '';

    const volume: string =
      customFields.find(f => f.variable_name === 'volume')?.value ||
      meta?.volume ||
      '';

    const bundleKey: string = meta?.bundle_key || '';
    const agentSlug: string = meta?.agent_slug || '';
    const source: string = meta?.source || 'main';
    const agentPrice: number = Number(meta?.agent_price) || 0;

    console.log('[webhook] Parsed fields:', { phone, network, bundleKey, volume, agentSlug, source });

    // If bundle_key is missing, try to find bundle by network + volume
    let bundle = getBundleByKey(bundleKey);

    if (!bundle && network && volume) {
      console.log('[webhook] bundle_key missing, searching by network+volume:', network, volume);
      const { ALL_BUNDLES } = await import('@/lib/bundles');
      bundle = ALL_BUNDLES.find(b =>
        b.network === network && b.volume === volume
      );
    }

    if (!bundle) {
      console.warn('[webhook] Could not find bundle. key:', bundleKey, 'network:', network, 'volume:', volume);
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
        .from('agents')
        .select('id')
        .eq('slug', agentSlug)
        .single();
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
      console.error('[webhook] Order insert error:', orderErr);
      return NextResponse.json({ received: true });
    }

    console.log('[webhook] Order created:', order.id);

    // Attempt Hubnet delivery
    const hubnetNetwork = getHubnetNetwork({ ...bundle, network });

    try {
      const hubnetResult = await hubnetTransact({
        network: hubnetNetwork,
        phone,
        volume: bundle.volume,
        reference,
        webhook: WEBHOOK,
      });

      console.log('[webhook] Hubnet result:', JSON.stringify(hubnetResult));

      if (hubnetResult.success) {
        await supabase.from('orders').update({
          delivery_status: 'processing',
          hubnet_transaction_id: hubnetResult.transactionId || null,
        }).eq('id', order.id);
      } else {
        await supabase.from('orders').update({
          delivery_status: 'failed',
        }).eq('id', order.id);
      }
    } catch (hubnetErr) {
      console.error('[webhook] Hubnet error:', hubnetErr);
      await supabase.from('orders').update({
        delivery_status: 'pending',
      }).eq('id', order.id);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
