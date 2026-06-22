// app/api/orders/sync-hubnet-status/route.ts
//
// Polls Hubnet's status check endpoint for a specific order and updates
// delivery_status in the DB. Use this to recover orders that Hubnet accepted
// but we incorrectly marked as failed due to response parsing issues.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { hubnetOrderStatus, mapHubnetStatus } from '@/lib/hubnet';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, reference, delivery_status, delivery_provider')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Poll Hubnet for current status using the order reference
    const status = await hubnetOrderStatus(order.reference);

    if (!status || !status.found) {
      return NextResponse.json({
        success: false,
        message: 'Order not found on Hubnet — it may not have been submitted successfully',
        hubnetStatus: null,
      });
    }

    const deliveryStatus = mapHubnetStatus(status.status);

    console.log(`[sync-hubnet-status] order=${order.reference} hubnet=${status.status} → ${deliveryStatus}`);

    // Update the order with what Hubnet actually says
    await supabase.from('orders').update({
      delivery_status:   deliveryStatus,
      delivery_provider: 'hubnet',
      updated_at:        new Date().toISOString(),
      ...(deliveryStatus === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', order.id);

    return NextResponse.json({
      success:        true,
      hubnetStatus:   status.status,
      deliveryStatus,
      message:        `Updated to "${deliveryStatus}" based on Hubnet status check`,
    });
  } catch (e) {
    console.error('[sync-hubnet-status]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
