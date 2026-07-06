// app/api/cron/reconcile/route.ts
// Daily reconciliation cron — catches silent delivery failures.
//
// Checks:
//   1. Orders stuck in 'pending' for 2+ hours → auto-retry delivery
//   2. Orders stuck in 'processing' for 6+ hours → flag for admin review
//   3. Sends email summary of anything actioned
//
// Add to vercel.json:
//   { "path": "/api/cron/reconcile", "schedule": "0 6 * * *" }
// (runs at 6am UTC daily — adjust to your timezone)

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey } from '@/lib/bundles';
import { requireAdmin } from '@/lib/auth-guard';
import { sendReconciliationEmail } from '@/lib/reconciliation-email';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const isCron     = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAdmin    = !isCron && (await requireAdmin(req)).ok;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase  = createSupabaseAdminClient();
  const now       = new Date();
  const twoHrsAgo = new Date(now.getTime() - 2  * 60 * 60 * 1000).toISOString();
  const sixHrsAgo = new Date(now.getTime() - 6  * 60 * 60 * 1000).toISOString();

  const retried:  Array<{ reference: string; result: string }> = [];
  const flagged:  Array<{ reference: string; hours: number  }> = [];
  let   retriedOk = 0;
  let   retriedFail = 0;

  // ── 1. Stuck in 'pending' for 2+ hours → retry ───────────
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'success')
    .eq('delivery_status', 'pending')
    .lt('created_at', twoHrsAgo)
    .limit(50);

  for (const order of pendingOrders || []) {
    const bundle = getBundleByKey(order.bundle_key);
    if (!bundle) {
      retried.push({ reference: order.reference, result: 'skipped — bundle not found' });
      continue;
    }

    try {
      const result = await deliverBundle({
        bundle,
        network:   order.network,
        phone:     order.phone,
        reference: order.reference,
      });

      if (result.success) {
        await supabase.from('orders').update({
          delivery_status:      'processing',
          delivery_provider:    result.provider,
          hubnet_transaction_id: result.orderId || null,
          updated_at:           now.toISOString(),
        }).eq('id', order.id);
        retried.push({ reference: order.reference, result: `sent via ${result.provider}` });
        retriedOk++;
      } else {
        const alreadyWith =
          result.message?.toLowerCase().includes('already') ||
          result.message?.toLowerCase().includes('duplicate');

        if (alreadyWith) {
          await supabase.from('orders').update({
            delivery_status:   'processing',
            delivery_provider: result.provider,
            updated_at:        now.toISOString(),
          }).eq('id', order.id);
          retried.push({ reference: order.reference, result: 'already with provider — marked processing' });
          retriedOk++;
        } else {
          retried.push({ reference: order.reference, result: `retry failed: ${result.message}` });
          retriedFail++;
        }
      }
    } catch (e) {
      retried.push({ reference: order.reference, result: `error: ${(e as Error).message}` });
      retriedFail++;
    }

    // Small delay between retries
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 2. Stuck in 'processing' for 6+ hours → flag ─────────
  const { data: processingOrders } = await supabase
    .from('orders')
    .select('reference, created_at, network, size, phone, delivery_provider')
    .eq('status', 'success')
    .eq('delivery_status', 'processing')
    .lt('created_at', sixHrsAgo)
    .limit(50);

  for (const order of processingOrders || []) {
    const hours = Math.floor((now.getTime() - new Date(order.created_at).getTime()) / 3600000);
    flagged.push({ reference: order.reference, hours });
  }

  // ── 3. Create admin notification if anything was actioned ─
  const hasIssues = retried.length > 0 || flagged.length > 0;

  if (hasIssues) {
    await supabase.from('support_notifications').insert({
      target_type: 'admin',
      title:       `🔄 Reconciliation: ${retried.length} retried, ${flagged.length} flagged`,
      message:     `${retriedOk} retry succeeded, ${retriedFail} failed. ${flagged.length} orders stuck in processing 6h+.`,
      is_read:     false,
    });

    // Send email summary
    try {
      await sendReconciliationEmail({
        retried,
        flagged,
        retriedOk,
        retriedFail,
        checkedAt: now.toISOString(),
      });
    } catch (e) {
      console.error('[reconcile] email error:', e);
    }
  }

  console.log(`[reconcile] retried=${retried.length} (ok=${retriedOk} fail=${retriedFail}) flagged=${flagged.length}`);

  return NextResponse.json({
    checkedAt:   now.toISOString(),
    retried:     retried.length,
    retriedOk,
    retriedFail,
    flagged:     flagged.length,
    flaggedOrders: flagged,
    retriedOrders: retried,
    triggeredBy: isCron ? 'cron' : 'admin',
  });
}
