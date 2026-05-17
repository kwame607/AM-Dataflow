import { NextRequest, NextResponse } from 'next/server';
import { verifyPaystackPayment } from '@/lib/paystack';
import { hubnetTransact } from '@/lib/hubnet';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getBundleByKey, getDefaultAdminPrice, getHubnetNetwork } from '@/lib/bundles';

export async function POST(req: NextRequest) {
  try {
    const { reference, orderData } = await req.json();

    if (!reference || !orderData) {
      return NextResponse.json({ error: 'Missing reference or orderData' }, { status: 400 });
    }

    // 1. Verify Paystack payment
    console.log('[verify] Checking reference:', reference);
    const paystack = await verifyPaystackPayment(reference);
    console.log('[verify] Paystack result:', JSON.stringify(paystack));
    if (!paystack.success) {
      return NextResponse.json({ error: 'Payment verification failed', detail: paystack }, { status: 400 });
    }

    // 2. Get bundle info
    const bundle = getBundleByKey(orderData.bundleKey);
    if (!bundle) {
      return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // 3. Get admin price from DB (or use default)
    const { data: adminPriceRow } = await supabase
      .from('admin_prices')
      .select('selling_price, admin_profit')
      .eq('bundle_key', orderData.bundleKey)
      .single();

    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);
    const adminProfit = adminPriceRow?.admin_profit ?? (adminPrice - bundle.cost);

    // 4. Get agent info if applicable
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

    // 5. Save order as success (payment confirmed) with delivery pending
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

    // 6. Attempt Hubnet delivery in background (non-blocking)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const hubnetNetwork = getHubnetNetwork({ ...bundle, network: orderData.network });
    hubnetTransact({
      network: hubnetNetwork,
      phone: orderData.phone,
      volume: bundle.volume,
      reference,
      webhook: siteUrl ? `${siteUrl}/api/hubnet/webhook` : undefined,
    }).then(async (result) => {
      console.log('[verify] Hubnet result:', JSON.stringify(result));
      if (result.success) {
        // Hubnet accepted the request — waiting for delivery confirmation via webhook
        await supabase.from('orders').update({
          delivery_status: 'processing',
          hubnet_transaction_id: result.transactionId || null,
        }).eq('id', order.id);
      } else {
        await supabase.from('orders').update({
          delivery_status: 'failed',
        }).eq('id', order.id);
        console.warn('[verify] Hubnet delivery failed:', result.message);
      }
    }).catch(e => console.error('[verify] Hubnet call error:', e));

    return NextResponse.json({ success: true, reference, status: 'success' });
  } catch (e) {
    console.error('Paystack verify error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
