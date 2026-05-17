import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { hubnetTransact } from '@/lib/hubnet';
import { getBundleByKey, getDefaultAdminPrice, getHubnetNetwork } from '@/lib/bundles';

const WEBHOOK = 'https://hubnet.app/v.1/webhook';

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

    if (event.event !== 'charge.success') {
      return NextResponse.json({ received: true });
    }

    const reference: string = event.data?.reference;
    if (!reference) return NextResponse.json({ received: true });

    const supabase = createSupabaseAdminClient();

    // Check if order already exists (inline verify may have already created it)
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status')
      .eq('reference', reference)
      .maybeSingle();

    if (existing) {
      console.log('[webhook] Order already exists for', reference, '— skipping');
      return NextResponse.json({ received: true });
    }

    // Parse metadata to reconstruct orderData
    const meta = event.data?.metadata;
    const customFields: Array<{ variable_name: string; value: string }> = meta?.custom_fields || [];
    const phone = customFields.find(f => f.variable_name === 'phone')?.value || event.data?.customer?.email?.split('@')[0] || '';
    const network: string = meta?.network || '';
    const bundleKey: string = meta?.bundle_key || '';
    const agentSlug: string = meta?.agent_slug || '';
    const source: string = meta?.source || 'main';
    const agentPrice: number = Number(meta?.agent_price) || 0;

    console.log('[webhook] Reconstructing order:', { phone, network, bundleKey, agentSlug, source });

    const bundle = getBundleByKey(bundleKey);
    if (!bundle) {
      console.warn('[webhook] Unknown bundle key:', bundleKey);
      return NextResponse.json({ received: true });
    }

    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price')
      .eq('bundle_key', bundleKey)
      .single();

    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const finalAgentPrice = agentPrice || adminPrice;

    let agentId: string | null = null;
    if (source === 'agent' && agentSlug) {
      const { data: agent } = await supabase.from('agents').select('id').eq('slug', agentSlug).single();
      if (agent) agentId = agent.id;
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
        admin_profit: adminPrice - bundle.cost,
        agent_price: finalAgentPrice,
        agent_profit: finalAgentPrice - adminPrice,
        agent_id: agentId,
        agent_slug: agentSlug || null,
        source,
        status: 'processing',
        paystack_ref: reference,
      })
      .select()
      .single();

    if (orderErr) {
      console.error('[webhook] Order insert error:', orderErr);
      return NextResponse.json({ received: true });
    }

    const hubnetNetwork = getHubnetNetwork({ ...bundle, network });
    const hubnetResult = await hubnetTransact({
      network: hubnetNetwork,
      phone,
      volume: bundle.volume,
      reference,
      webhook: WEBHOOK,
    });

    console.log('[webhook] Hubnet result:', JSON.stringify(hubnetResult));

    await supabase
      .from('orders')
      .update({
        status: hubnetResult.success ? 'success' : 'failed',
        hubnet_transaction_id: hubnetResult.transactionId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
