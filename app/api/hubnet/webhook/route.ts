import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET() {
  return NextResponse.json({ status: 'Hubnet webhook endpoint is live' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[hubnet webhook] Received:', JSON.stringify(body));

    // Ignore Paystack events hitting the wrong endpoint
    if (body.event && body.event.startsWith('charge.')) {
      console.warn('[hubnet webhook] Received a Paystack event — wrong endpoint.');
      return NextResponse.json({ received: true });
    }

    // Extract reference
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

    // Extract the actual delivery status from the webhook payload
    // Hubnet sends a separate webhook for delivery updates — different from the
    // transaction initiation response.
    //
    // Delivery webhook status indicators:
    //   - body.delivery_status === 'delivered'
    //   - body.event === 'transaction.delivered' (or similar)
    //   - body.data?.delivery_status === 'delivered'
    //   - body.status === 'delivered' (string, not boolean)
    //
    // DO NOT treat status:true as delivered — that just means API call succeeded.

    const statusStr = String(
      body.delivery_status ||
      body.data?.delivery_status ||
      body.event ||
      ''
    ).toLowerCase();

    const messageCode = String(
      body.data?.code ||
      body.code ||
      ''
    ).toLowerCase();

    const topLevelStatus = String(body.status || '').toLowerCase();

    // Only mark delivered if we get an explicit delivery confirmation
    // NOT just because status === true (that's just API acknowledgement)
    const isDelivered =
      statusStr === 'delivered' ||
      statusStr === 'transaction.delivered' ||
      statusStr === 'success' ||
      statusStr === 'successful' ||
      statusStr === 'complete' ||
      // Hubnet sometimes sends status as a string "delivered"
      topLevelStatus === 'delivered' ||
      topLevelStatus === 'successful' ||
      topLevelStatus === 'success' ||
      // data.code = "0000" in a WEBHOOK (not the init response) means delivered
      (messageCode === '0000' && body.event !== undefined);

    const isFailed =
      statusStr === 'failed' ||
      statusStr === 'error' ||
      statusStr === 'reversed' ||
      statusStr === 'transaction.failed' ||
      topLevelStatus === 'failed' ||
      topLevelStatus === 'reversed' ||
      messageCode === 'failed' ||
      messageCode === 'error' ||
      messageCode === 'reversed';

    let deliveryStatus: string;
    if (isDelivered)    deliveryStatus = 'delivered';
    else if (isFailed)  deliveryStatus = 'failed';
    else                deliveryStatus = 'processing';

    console.log(`[hubnet webhook] reference=${reference} statusStr=${statusStr} topLevel=${topLevelStatus} code=${messageCode} → ${deliveryStatus}`);

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('orders')
      .update({
        delivery_status:        deliveryStatus,
        hubnet_transaction_id:  transactionId || null,
        delivered_at:           isDelivered ? new Date().toISOString() : null,
        updated_at:             new Date().toISOString(),
      })
      .eq('reference', reference);

    if (error) {
      console.error('[hubnet webhook] Supabase update error:', error);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[hubnet webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
