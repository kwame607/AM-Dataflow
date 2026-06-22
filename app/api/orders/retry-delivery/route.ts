import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey } from '@/lib/bundles';
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

    // Mark as processing while we attempt
    await supabase.from('orders').update({ delivery_status: 'processing' }).eq('id', order.id);

    // Retry re-resolves the provider via the CURRENT toggle/network rules
    // (not whatever provider failed last time) — this is the whole point of
    // having two providers: if XpresPortal is stuck, switch to Hubnet and
    // retry pushes it through the now-active one.
    const result = await deliverBundle({
      bundle,
      network: order.network,
      phone: order.phone,
      reference: order.reference,
    });

    if (result.success) {
      await supabase.from('orders').update({
        delivery_status: 'processing',
        delivery_provider: result.provider,
        hubnet_transaction_id: result.orderId || result.reference || null,
      }).eq('id', order.id);
      return NextResponse.json({
        success: true,
        message: `Delivery sent via ${result.provider === 'hubnet' ? 'Hubnet' : 'XpresPortal'} — awaiting confirmation`,
      });
    } else {
      // Check if the provider is saying it already has this order
      const alreadySubmitted =
        result.message?.toLowerCase().includes('already') ||
        result.message?.toLowerCase().includes('duplicate') ||
        result.message?.toLowerCase().includes('exist');

      if (alreadySubmitted) {
        await supabase.from('orders').update({
          delivery_status: 'processing',
          delivery_provider: result.provider,
        }).eq('id', order.id);
        return NextResponse.json({
          success: true,
          message: `Order is already with ${result.provider === 'hubnet' ? 'Hubnet' : 'XpresPortal'} and being processed — please wait for delivery confirmation`,
        });
      }

      await supabase.from('orders').update({
        delivery_status: 'failed',
        delivery_provider: result.provider,
      }).eq('id', order.id);
      return NextResponse.json({
        success: false,
        message: result.message || `${result.provider === 'hubnet' ? 'Hubnet' : 'XpresPortal'} rejected the request`,
      }, { status: 502 });
    }
  } catch (e) {
    console.error('[retry-delivery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
