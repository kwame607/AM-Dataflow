import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { xpresOrder } from '@/lib/xpresportal';
import { getBundleByKey, getXpresParams } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { RetryDeliverySchema } from '@/lib/validate';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`retry:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = RetryDeliverySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
    const { orderId } = parsed.data;

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

    const { network: xpresNetwork, offerSlug, volumeGB } = getXpresParams({ ...bundle, network: order.network });

    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const siteUrl = rawUrl && !rawUrl.includes('localhost')
      ? rawUrl
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

    // Mark as processing while we attempt
    await supabase.from('orders').update({ delivery_status: 'processing' }).eq('id', order.id);

    const webhookUrl = siteUrl
      ? `${siteUrl}/api/xpresportal/webhook?internalRef=${encodeURIComponent(order.reference)}`
      : undefined;

    const result = await xpresOrder({
      network: xpresNetwork,
      phone: order.phone,
      volume: volumeGB,
      offerSlug,
      reference: order.reference,
      webhookUrl,
    });

    if (result.success) {
      await supabase.from('orders').update({
        delivery_status: 'processing',
        hubnet_transaction_id: result.orderId || result.reference || null,
      }).eq('id', order.id);
      return NextResponse.json({ success: true, message: 'Delivery sent to XpresPortal — awaiting confirmation' });
    } else {
      await supabase.from('orders').update({ delivery_status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ success: false, message: result.message || 'XpresPortal rejected the request' }, { status: 502 });
    }
  } catch (e) {
    console.error('[retry-delivery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
