import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { hubnetTransact } from '@/lib/hubnet';
import { getBundleByKey, getHubnetNetwork } from '@/lib/bundles';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.delivery_status === 'delivered') {
      return NextResponse.json({ error: 'Order already delivered' }, { status: 400 });
    }

    const bundle = getBundleByKey(order.bundle_key);
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 400 });

    const hubnetNetwork = getHubnetNetwork({ ...bundle, network: order.network });
    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const siteUrl = rawUrl && !rawUrl.includes('localhost')
      ? rawUrl
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

    // Mark as processing while we attempt
    await supabase.from('orders').update({ delivery_status: 'processing' }).eq('id', order.id);

    const result = await hubnetTransact({
      network: hubnetNetwork,
      phone: order.phone,
      volume: order.volume,
      reference: order.reference,
      webhook: siteUrl ? `${siteUrl}/api/hubnet/webhook` : undefined,
    });

    if (result.success) {
      await supabase.from('orders').update({
        delivery_status: 'processing',
        hubnet_transaction_id: result.transactionId || null,
      }).eq('id', order.id);
      return NextResponse.json({ success: true, message: 'Delivery sent to Hubnet — awaiting confirmation' });
    } else {
      await supabase.from('orders').update({ delivery_status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ success: false, message: result.message || 'Hubnet rejected the request' }, { status: 502 });
    }
  } catch (e) {
    console.error('[retry-delivery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
