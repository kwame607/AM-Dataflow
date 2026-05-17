import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[hubnet webhook] Received:', JSON.stringify(body));

    const reference: string = body.reference || body.ref || body.clientReference || '';
    const status: string = (body.status || body.code || '').toLowerCase();
    const transactionId: string = body.transactionId || body.transaction_id || body.data?.transactionId || '';

    if (!reference) {
      console.warn('[hubnet webhook] No reference in payload');
      return NextResponse.json({ received: true });
    }

    const supabase = createSupabaseAdminClient();

    const isDelivered = status === 'success' || status === '0000' || status === 'delivered' || status === 'successful' || status === 'complete';
    const isProcessing = status === 'processing' || status === 'pending' || status === 'initiated';
    const isFailed = status === 'failed' || status === 'error' || status === 'reversed';

    let deliveryStatus: string;
    if (isDelivered) deliveryStatus = 'delivered';
    else if (isProcessing) deliveryStatus = 'processing';
    else if (isFailed) deliveryStatus = 'failed';
    else deliveryStatus = 'processing'; // unknown status — assume still processing

    await supabase
      .from('orders')
      .update({
        delivery_status: deliveryStatus,
        hubnet_transaction_id: transactionId || null,
        delivered_at: isDelivered ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('reference', reference);

    console.log(`[hubnet webhook] Order ${reference} delivery_status → ${deliveryStatus}`);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[hubnet webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
