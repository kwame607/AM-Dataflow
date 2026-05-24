import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[hubnet webhook] Received:', JSON.stringify(body));

    const reference: string = body.reference || body.ref || body.clientReference || '';
    const transactionId: string =
      body.transactionId ||
      body.transaction_id ||
      body.data?.transactionId ||
      body.data?.transaction_id ||
      '';

    if (!reference) {
      console.warn('[hubnet webhook] No reference in payload');
      return NextResponse.json({ received: true });
    }

    const statusBool = body.status === true;
    const messageCode = String(body.message || body.code || '').toLowerCase();
    const statusStr = String(body.status || '').toLowerCase();

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

    // Never speculatively mark as failed — default to processing
    // Only mark failed if Hubnet sends an explicit failure signal
    let deliveryStatus: string;
    if (isDelivered) deliveryStatus = 'delivered';
    else if (isFailed) deliveryStatus = 'failed';
    else if (isProcessing) deliveryStatus = 'processing';
    else deliveryStatus = 'processing'; // safe default

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
