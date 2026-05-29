import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET() {
  return NextResponse.json({ status: 'XpresPortal webhook endpoint is live' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[xpresportal webhook] Received:', JSON.stringify(body));

    // XpresPortal webhook format:
    // {
    //   "event": "order.status.updated",
    //   "orderId": "ORD-000067",
    //   "reference": "ORD-IB22OQws",
    //   "status": "delivered" | "failed" | "pending" | "processing" | ...,
    //   "recipient": "233241234567",
    //   "volume": 2,
    //   "timestamp": "..."
    // }

    if (body.event !== 'order.status.updated') {
      console.log('[xpresportal webhook] Ignoring event:', body.event);
      return NextResponse.json({ received: true });
    }

    // Our internal reference is passed as a query param when we register the webhook URL
    const url = req.nextUrl;
    const internalRef = url.searchParams.get('internalRef') || '';

    const xpresReference: string = body.reference || body.orderId || '';
    const xpresOrderId: string = body.orderId || '';
    const statusRaw: string = String(body.status || '').toLowerCase();

    if (!internalRef && !xpresReference) {
      console.warn('[xpresportal webhook] No reference in payload');
      return NextResponse.json({ received: true });
    }

    // Map XpresPortal status → our delivery_status
    const DELIVERED_STATUSES = ['delivered'];
    const FAILED_STATUSES    = ['failed', 'cancelled', 'refunded', 'reversed'];
    const PROCESSING_STATUSES = ['processing'];

    let deliveryStatus: string;
    if (DELIVERED_STATUSES.includes(statusRaw))  deliveryStatus = 'delivered';
    else if (FAILED_STATUSES.includes(statusRaw)) deliveryStatus = 'failed';
    else if (PROCESSING_STATUSES.includes(statusRaw)) deliveryStatus = 'processing';
    else deliveryStatus = 'processing'; // pending, resolved, etc.

    console.log(`[xpresportal webhook] internalRef=${internalRef} xpresRef=${xpresReference} status=${statusRaw} → ${deliveryStatus}`);

    const supabase = createSupabaseAdminClient();

    // Try to match by our internal reference first, then by xpres reference stored in hubnet_transaction_id
    let updateQuery = supabase.from('orders').update({
      delivery_status:        deliveryStatus,
      hubnet_transaction_id:  xpresOrderId || xpresReference || null,
      delivered_at:           deliveryStatus === 'delivered' ? new Date().toISOString() : null,
      updated_at:             new Date().toISOString(),
    });

    if (internalRef) {
      const { error } = await updateQuery.eq('reference', internalRef);
      if (error) console.error('[xpresportal webhook] Supabase update error (by internalRef):', error);
    } else {
      // Fallback: try matching by the xpres reference stored as hubnet_transaction_id
      const { error } = await updateQuery.eq('hubnet_transaction_id', xpresReference);
      if (error) console.error('[xpresportal webhook] Supabase update error (by xpresRef):', error);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[xpresportal webhook] Error:', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
