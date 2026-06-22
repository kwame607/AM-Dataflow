// app/api/hubnet/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { mapHubnetStatus } from '@/lib/hubnet';

export async function GET() {
  return NextResponse.json({ status: 'Hubnet webhook endpoint is live' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[hubnet webhook] Received:', JSON.stringify(body));

    const event = String(body?.event || '');
    const data  = body?.data || {};

    const reference: string = String(data.reference || body.reference || '');
    if (!reference) {
      console.warn('[hubnet webhook] No reference in payload:', JSON.stringify(body));
      return NextResponse.json({ received: true });
    }

    const rawStatus = String(data.status || '').toLowerCase();
    const inferredFromEvent = event.includes('delivered')
      ? 'delivered'
      : event.includes('processing')
      ? 'processing'
      : event.includes('failed') || event.includes('cancelled')
      ? 'failed'
      : '';

    const deliveryStatus = mapHubnetStatus(rawStatus || inferredFromEvent || 'processing');

    console.log(`[hubnet webhook] reference=${reference} event=${event} rawStatus=${rawStatus} → ${deliveryStatus}`);

    const supabase = createSupabaseAdminClient();

    const updatePayload: Record<string, unknown> = {
      delivery_status: deliveryStatus,
      updated_at: new Date().toISOString(),
    };
    if (deliveryStatus === 'delivered') {
      updatePayload.delivered_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('reference', reference)
      .select('id');

    if (error) {
      console.error('[hubnet webhook] Supabase update error:', error);
    } else if (!updated || updated.length === 0) {
      console.warn(`[hubnet webhook] No order found matching reference ${reference}`);
    } else {
      console.log(`[hubnet webhook] ✅ Updated order ${reference} → ${deliveryStatus}`);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[hubnet webhook] Error:', e);
    return NextResponse.json({ received: true });
  }
}
