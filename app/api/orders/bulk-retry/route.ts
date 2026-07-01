// app/api/orders/bulk-retry/route.ts
// Retries delivery for multiple orders at once.
// Processes sequentially with a small delay to avoid hammering the provider.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { reverseReferralBonus } from '@/lib/referral';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`bulk-retry:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many bulk retry requests. Wait 1 minute.' }, { status: 429 });
  }

  try {
    const { orderIds, retryAll } = await req.json();
    const supabase = createSupabaseAdminClient();

    let targetOrders: Array<Record<string, unknown>> = [];

    if (retryAll) {
      // Fetch all failed/pending orders that haven't been delivered
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'success')
        .in('delivery_status', ['failed', 'pending'])
        .order('created_at', { ascending: true })
        .limit(100); // safety cap
      targetOrders = data || [];
    } else {
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return NextResponse.json({ error: 'No order IDs provided' }, { status: 400 });
      }
      if (orderIds.length > 100) {
        return NextResponse.json({ error: 'Maximum 100 orders per bulk retry' }, { status: 400 });
      }
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('id', orderIds)
        .eq('status', 'success')
        .in('delivery_status', ['failed', 'pending']);
      targetOrders = data || [];
    }

    if (targetOrders.length === 0) {
      return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, results: [], message: 'No eligible orders found' });
    }

    const results: Array<{
      orderId:   string;
      reference: string;
      success:   boolean;
      message:   string;
      provider:  string;
    }> = [];

    let succeeded = 0;
    let failed    = 0;

    for (const order of targetOrders) {
      const bundle = getBundleByKey(order.bundle_key as string);
      if (!bundle) {
        results.push({ orderId: order.id as string, reference: order.reference as string, success: false, message: 'Bundle not found', provider: '' });
        failed++;
        continue;
      }

      // Mark as processing while we attempt
      await supabase.from('orders')
        .update({ delivery_status: 'processing' })
        .eq('id', order.id);

      try {
        const result = await deliverBundle({
          bundle,
          network:   order.network as string,
          phone:     order.phone as string,
          reference: order.reference as string,
        });

        if (result.success) {
          await supabase.from('orders').update({
            delivery_status:      'processing',
            delivery_provider:    result.provider,
            hubnet_transaction_id: result.orderId || result.reference || null,
          }).eq('id', order.id);
          succeeded++;
          results.push({
            orderId:   order.id as string,
            reference: order.reference as string,
            success:   true,
            message:   `Sent via ${result.provider}`,
            provider:  result.provider,
          });
        } else {
          const alreadySubmitted =
            result.message?.toLowerCase().includes('already') ||
            result.message?.toLowerCase().includes('duplicate') ||
            result.message?.toLowerCase().includes('exist');

          if (alreadySubmitted) {
            await supabase.from('orders').update({
              delivery_status:   'processing',
              delivery_provider: result.provider,
            }).eq('id', order.id);
            succeeded++;
            results.push({
              orderId:   order.id as string,
              reference: order.reference as string,
              success:   true,
              message:   'Already with provider — marked processing',
              provider:  result.provider,
            });
          } else {
            await supabase.from('orders').update({
              delivery_status:   'failed',
              delivery_provider: result.provider,
            }).eq('id', order.id);

            // Refund wallet + reverse referral if wallet-funded
            if (order.payment_method === 'wallet') {
              await refundWalletForOrder(supabase, order);
              await reverseReferralBonus(supabase, order.id as string);
            }

            failed++;
            results.push({
              orderId:   order.id as string,
              reference: order.reference as string,
              success:   false,
              message:   result.message || 'Provider rejected',
              provider:  result.provider,
            });
          }
        }
      } catch (e) {
        await supabase.from('orders').update({ delivery_status: 'failed' }).eq('id', order.id);
        failed++;
        results.push({
          orderId:   order.id as string,
          reference: order.reference as string,
          success:   false,
          message:   `Error: ${(e as Error).message}`,
          provider:  '',
        });
      }

      // Small delay between orders — avoids hammering provider API
      if (targetOrders.indexOf(order) < targetOrders.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return NextResponse.json({
      processed: targetOrders.length,
      succeeded,
      failed,
      results,
    });

  } catch (e) {
    console.error('[bulk-retry]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

async function refundWalletForOrder(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  order: Record<string, unknown>,
) {
  if (!order.agent_id) return;
  const { data: wallet } = await supabase
    .from('wallets').select('*').eq('agent_id', order.agent_id).single();
  if (!wallet) return;
  const amount     = order.agent_price as number;
  const newBalance = wallet.balance + amount;
  await supabase.from('wallets').update({
    balance:     newBalance,
    total_spent: Math.max(0, wallet.total_spent - amount),
    updated_at:  new Date().toISOString(),
  }).eq('id', wallet.id);
  await supabase.from('wallet_transactions').insert({
    wallet_id:      wallet.id,
    agent_id:       order.agent_id,
    type:           'refund',
    amount,
    balance_before: wallet.balance,
    balance_after:  newBalance,
    reference:      `RFD-${(order.reference as string).slice(0, 8)}`,
    status:         'success',
    description:    `Refund: bulk retry failed for ${order.reference}`,
  });
}
