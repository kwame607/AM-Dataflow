// app/api/cron/myztadata-poll/route.ts
// Polls MyZtaData for status updates on orders that used MyZtaData as provider.
// Called by Vercel cron — add to vercel.json:
//   { "path": "/api/cron/myztadata-poll", "schedule": "*/15 * * * *" }
// (every 15 min on Pro; once/day on Hobby — on Hobby, call manually from admin)

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { myZtaCheckTransaction } from '@/lib/myztadata';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  // Accept Vercel cron secret OR admin session
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const isCron     = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAdmin    = !isCron && (await requireAdmin(req)).ok;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  // Find all MyZtaData orders still in pending/processing
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, reference, hubnet_transaction_id, delivery_status')
    .eq('delivery_provider', 'myztadata')
    .in('delivery_status', ['pending', 'processing'])
    .not('hubnet_transaction_id', 'is', null) // hubnet_transaction_id stores transaction_code
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ checked: 0, updated: 0, message: 'No pending MyZtaData orders' });
  }

  let updated = 0;
  const results: Array<{ reference: string; status: string; updated: boolean }> = [];

  for (const order of orders) {
    const txCode = order.hubnet_transaction_id;
    if (!txCode) continue;

    const status = await myZtaCheckTransaction(txCode);

    let newDeliveryStatus: string | null = null;
    if (status.status === 'Delivered') newDeliveryStatus = 'delivered';
    else if (status.status === 'Failed') newDeliveryStatus = 'failed';

    if (newDeliveryStatus && newDeliveryStatus !== order.delivery_status) {
      await supabase.from('orders').update({
        delivery_status: newDeliveryStatus,
        delivered_at: newDeliveryStatus === 'delivered' ? new Date().toISOString() : null,
        updated_at:   new Date().toISOString(),
      }).eq('id', order.id);
      updated++;
    }

    results.push({
      reference: order.reference,
      status:    status.status,
      updated:   !!newDeliveryStatus && newDeliveryStatus !== order.delivery_status,
    });
  }

  return NextResponse.json({
    checked: orders.length,
    updated,
    results,
    checkedAt: new Date().toISOString(),
  });
}
