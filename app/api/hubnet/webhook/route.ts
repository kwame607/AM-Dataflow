import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET() {
  return NextResponse.json({ status: 'Hubnet webhook endpoint is live' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[hubnet webhook] Received:', JSON.stringify(body));

    // Detect if this is a Paystack event hitting the wrong endpoint
    if (body.event && body.event.startsWith('charge.')) {
      console.warn('[hubnet webhook] Received a Paystack event — wrong endpoint. Fix webhook URL in Paystack dashboard.');
      return NextResponse.json({ received: true });
    }

    // Try all possible reference field locations from Hubnet
    const reference: string =
      body.reference ||
      body.ref ||
      body.clientReference ||
      body.data?.reference ||
      body.data?.clientReference ||
      '';

    const transactionId: string =
      body.transactionId ||
      body.transaction_id ||
      body.data?.transactionId ||
      body.data?.transaction_id ||
      '';

    if (!reference) {
      console.warn('[hubnet webhook] No reference in payload:', JSON.stringify(body));
      return NextResponse.json({ received: true });
    }

    const statusBool = body.status === true || body.data?.status === true;
    const messageCode = String(body.message || body.code || body.data?.code || '').toLowerCase();
    const statusStr = String(body.status || body.data?.status || '').toLowerCase();

    const isDelivered =
      statusBool ||
      messageCode === '0000' ||
      statusStr === 'success' ||
      statusStr === 'delivered' ||
      statusStr === 'successful' ||
      statusStr === 'complete';

    const isFailed =
      messageCode === 'failed' ||
      messageCode === 'error' ||
      messageCode === 'reversed' ||
      statusStr === 'failed' ||
      statusStr === 'error' ||
      statusStr === 'reversed';

    const isProcessing =
      messageCode === 'processing' ||
      messageCode === 'submitted' ||
      messageCode === 'pending' ||
      statusStr === 'processing' ||
      statusStr === 'submitted' ||
      statusStr === 'pending';

    let deliveryStatus: string;
    if (isDelivered) deliveryStatus = 'delivered';
    else if (isFailed) deliveryStatus = 'failed';
    else if (isProcessing) deliveryStatus = 'processing';
    else deliveryStatus = 'processing';

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('orders')
      .update({
        delivery_status: deliveryStatus,
        hubnet_transaction_id: transactionId || null,
        delivered_at: isDelivered ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('reference', reference);

    if (error) {
      console.error('[hubnet webhook] Supabase update error:', error);
    }

    console.log(`[hubnet webhook] Order ${reference} → delivery_status: ${deliveryStatus}`);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[hubnet webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
// Add this at the bottom of the file
export async function GET() {
  return NextResponse.json({ status: 'Hubnet webhook endpoint is live' });
}
