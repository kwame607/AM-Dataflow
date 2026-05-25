import { NextRequest, NextResponse } from 'next/server';
import { verifyPaystackPayment } from '@/lib/paystack';
import { hubnetTransact } from '@/lib/hubnet';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getBundleByKey, getDefaultAdminPrice, getHubnetNetwork } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { VerifyPaymentSchema } from '@/lib/validate';

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
    console.log('[verify] Raw body:', JSON.stringify(body));

    const parsed = VerifyPaymentSchema.safeParse(body);
    if (!parsed.success) {
      console.error('[verify] Validation failed:', JSON.stringify(parsed.error.flatten()));
      return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
    }
    const { reference, orderData } = parsed.data;

    // 1. Verify Paystack payment
    console.log('[verify] Checking reference:', reference);
    const paystack = await verifyPaystackPayment(reference);
    console.log('[verify] Paystack result:', JSON.stringify(paystack));
    if (!paystack.success) {
  	const detail = paystack as { txStatus?: string };
  	const isAbandoned = detail?.txStatus === 'abandoned';
  	return NextResponse.json({ 
    		error: isAbandoned 
      			? 'Payment was not completed. Please try again.' 
      			: 'Payment verification failed. Contact support if you were charged.',
  }, { status: 400 });
}

    // 2. Get bundle info
    const bundle = getBundleByKey(orderData.bundleKey);
    if (!bundle) {
      return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // 3. Check for duplicate order
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status, delivery_status')
      .eq('reference', reference)
      .maybeSingle();

    if (existing) {
      console.log('[verify] Duplicate order found for', reference);
      return NextResponse.json({ success: true, reference, status: existing.status });
    }

    // 4. Get admin price from DB
    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price, admin_profit')
      .eq('bundle_key', orderData.bundleKey)
      .single();

    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const adminProfit = adminPriceRow?.admin_profit ?? (adminPrice - bundle.cost);

    // 5. Get agent info if applicable
    let agentId: string | null = null;
    let agentProfit = 0;
    const agentPrice = orderData.agentPrice ?? adminPrice;

    if (orderData.source === 'agent' && orderData.agentSlug) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', orderData.agentSlug)
        .single();
      if (agent) {
        agentId = agent.id;
        agentProfit = agentPrice - adminPrice;
      }
    }

    // 6. Save order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference,
        phone: orderData.phone,
        network: orderData.network,
        bundle_key: orderData.bundleKey,
        size: bundle.size,
        volume: bundle.volume,
        hubnet_cost: bundle.cost,
        admin_price: adminPrice,
        admin_profit: adminProfit,
        agent_price: agentPrice,
        agent_profit: agentProfit,
        agent_id: agentId,
        agent_slug: orderData.agentSlug || null,
        source: orderData.source || 'main',
        status: 'success',
        delivery_status: 'pending',
        paystack_ref: reference,
      })
      .select('id')
      .single();

    if (orderErr) {
      console.error('[verify] Order insert error:', orderErr);
      return NextResponse.json({ error: 'Failed to save order', detail: orderErr.message }, { status: 500 });
    }

    console.log('[verify] Order saved:', order.id);

    // 7. Attempt Hubnet delivery — awaited so Vercel does not kill it
    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const siteUrl = rawUrl && !rawUrl.includes('localhost')
      ? rawUrl
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const hubnetNetwork = getHubnetNetwork({ ...bundle, network: orderData.network });

    try {
      const hubnetResult = await hubnetTransact({
        network: hubnetNetwork,
        phone: orderData.phone,
        volume: bundle.volume,
        reference,
        webhook: siteUrl ? `${siteUrl}/api/hubnet/webhook` : undefined,
      });

      console.log('[verify] Hubnet result:', JSON.stringify(hubnetResult));

      if (hubnetResult.success) {
        // Hubnet accepted — waiting for webhook to confirm delivery
        await supabase.from('orders').update({
          delivery_status: 'processing',
          hubnet_transaction_id: hubnetResult.transactionId || null,
        }).eq('id', order.id);
      } else {
        // Hubnet explicitly rejected — mark failed so you know to retry
        console.warn('[verify] Hubnet rejected:', hubnetResult.message);
        await supabase.from('orders').update({
          delivery_status: 'failed',
        }).eq('id', order.id);
      }
    } catch (hubnetErr) {
      // Network/timeout — unknown if Hubnet got it, leave as pending
      console.error('[verify] Hubnet call threw error:', hubnetErr);
      await supabase.from('orders').update({
        delivery_status: 'pending',
      }).eq('id', order.id);
    }

    return NextResponse.json({ success: true, reference, status: 'success' });

  } catch (e) {
    console.error('[verify] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
