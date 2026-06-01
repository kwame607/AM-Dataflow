// app/api/xpresportal/webhook/route.ts  ← REPLACE existing file
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendLowWalletEmail } from '@/lib/email';

// In-memory cooldown for balance.low webhook (same as cron)
const balanceCooldown = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
function canAlert(key: string): boolean {
  const last = balanceCooldown.get(key) || 0;
  if (Date.now() - last > COOLDOWN_MS) {
    balanceCooldown.set(key, Date.now());
    return true;
  }
  return false;
}

export async function GET() {
  return NextResponse.json({ status: 'XpresPortal webhook endpoint is live' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[xpresportal webhook] Received:', JSON.stringify(body));

    // ── Handle low balance webhook from XpresPortal ───────────
    // XpresPortal fires this when balance drops below your configured threshold
    if (body.event === 'balance.low') {
      console.log(`[xpresportal webhook] Low balance alert: GHS ${body.balance}`);
      if (canAlert('xpres_balance_low')) {
        sendLowWalletEmail({
          balance:   parseFloat(body.balance) || 0,
          threshold: parseFloat(body.threshold) || 50,
        }).catch(e => console.error('[xpresportal webhook] balance email error:', e));
      }
      return NextResponse.json({ received: true });
    }

    // ── Handle order status updates ───────────────────────────
    if (body.event !== 'order.status.updated') {
      console.log('[xpresportal webhook] Ignoring unknown event:', body.event);
      return NextResponse.json({ received: true });
    }

    // Our internal reference is passed as ?internalRef= in the webhook URL
    const url          = req.nextUrl;
    // WITH — strip anything after a second ? if it got doubled somehow:
    const rawRef = url.searchParams.get('internalRef') || '';
    const internalRef = rawRef.split('?')[0]; // clean up any doubling
    const xpresOrderId = String(body.orderId  || '');
    const xpresRef     = String(body.reference || '');
    const statusRaw    = String(body.status   || '').toLowerCase();

    if (!internalRef && !xpresOrderId && !xpresRef) {
      console.warn('[xpresportal webhook] No identifiers found in payload');
      return NextResponse.json({ received: true });
    }

    // Map XpresPortal status → your delivery_status
    const DELIVERED  = ['delivered', 'resolved'];
    const FAILED     = ['failed', 'cancelled', 'refunded'];
    const PROCESSING = ['processing'];

    let deliveryStatus: string;
    if (DELIVERED.includes(statusRaw))   deliveryStatus = 'delivered';
    else if (FAILED.includes(statusRaw)) deliveryStatus = 'failed';
    else if (PROCESSING.includes(statusRaw)) deliveryStatus = 'processing';
    else deliveryStatus = 'processing'; // 'pending' etc.

    console.log(
      `[xpresportal webhook] internalRef=${internalRef} ` +
      `xpresOrderId=${xpresOrderId} xpresRef=${xpresRef} ` +
      `status=${statusRaw} → ${deliveryStatus}`
    );

    const supabase = createSupabaseAdminClient();

    const updatePayload = {
      delivery_status:       deliveryStatus,
      hubnet_transaction_id: xpresOrderId || xpresRef || null,
      delivered_at:          deliveryStatus === 'delivered' ? new Date().toISOString() : null,
      updated_at:            new Date().toISOString(),
    };

    // ── Match by YOUR internal reference first (most reliable) ─
    if (internalRef) {
      const { error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('reference', internalRef);

      if (error) {
        console.error('[xpresportal webhook] Update by internalRef failed:', error);
      } else {
        console.log(`[xpresportal webhook] ✅ Updated order ${internalRef} → ${deliveryStatus}`);
        return NextResponse.json({ received: true });
      }
    }

    // ── Fallback: match by XpresPortal orderId stored in DB ────
    if (xpresOrderId || xpresRef) {
      const identifier = xpresOrderId || xpresRef;
      const { error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('hubnet_transaction_id', identifier);

      if (error) {
        console.error('[xpresportal webhook] Update by xpresOrderId failed:', error);
      } else {
        console.log(`[xpresportal webhook] ✅ Updated order by xpresId ${identifier} → ${deliveryStatus}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[xpresportal webhook] Error:', e);
    // Always return 200 so XpresPortal doesn't keep retrying on our errors
    return NextResponse.json({ received: true });
  }
}
