// app/api/orders/retry-delivery/route.ts — REPLACE existing file
//
// Adds wallet-aware refund handling: if a wallet-paid order's retry
// ultimately fails, the agent's wallet is automatically refunded (matching
// the "Refund System" requirement). Paystack-paid orders behave EXACTLY as
// before — this only adds a new branch that triggers when
// order.payment_method === 'wallet', which never existed before this
// migration, so all historical/Paystack orders take the original code path
// unchanged.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { xpresOrder } from '@/lib/xpresportal';
import { getBundleByKey, getXpresParams } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { RetryDeliverySchema } from '@/lib/validate';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`retry:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = RetryDeliverySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
    const { orderId } = parsed.data;

    const supabase = createSupabaseAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.delivery_status === 'delivered') {
      return NextResponse.json({ error: 'Order already delivered' }, { status: 400 });
    }

    const bundle = getBundleByKey(order.bundle_key);
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 400 });

    const { network: xpresNetwork, offerSlug, volumeGB } = getXpresParams({ ...bundle, network: order.network });

    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const siteUrl = rawUrl && !rawUrl.includes('localhost')
      ? rawUrl
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

    // Mark as processing while we attempt
    await supabase.from('orders').update({ delivery_status: 'processing' }).eq('id', order.id);

    const webhookUrl = siteUrl
      ? `${siteUrl}/api/xpresportal/webhook?internalRef=${encodeURIComponent(order.reference)}`
      : undefined;

    const result = await xpresOrder({
      network: xpresNetwork,
      phone: order.phone,
      volume: volumeGB,
      offerSlug,
      reference: order.reference,
      webhookUrl,
    });

    if (result.success) {
      await supabase.from('orders').update({
        delivery_status: 'processing',
        hubnet_transaction_id: result.orderId || result.reference || null,
      }).eq('id', order.id);
      return NextResponse.json({ success: true, message: 'Delivery sent to XpresPortal — awaiting confirmation' });
    } else {
      // Check if XpresPortal is saying it already has this order
      const alreadySubmitted =
        result.message?.toLowerCase().includes('already') ||
        result.message?.toLowerCase().includes('duplicate') ||
        result.message?.toLowerCase().includes('exist');

      if (alreadySubmitted) {
        // Already with XpresPortal, just mark as processing and wait
        await supabase.from('orders').update({
          delivery_status: 'processing',
        }).eq('id', order.id);
        return NextResponse.json({
          success: true,
          message: 'Order is already with XpresPortal and being processed — please wait for delivery confirmation',
        });
      }

      await supabase.from('orders').update({ delivery_status: 'failed' }).eq('id', order.id);

      // ── NEW: wallet refund branch ────────────────────────────
      // Only fires for orders paid from wallet (payment_method === 'wallet').
      // Paystack orders are untouched — admin handles those manually as before.
      let refundMessage = '';
      if (order.payment_method === 'wallet' && order.agent_id) {
        const refunded = await refundWalletForFailedOrder(supabase, order);
        if (refunded) {
          refundMessage = ' Wallet has been automatically refunded.';
        }
      }

      return NextResponse.json({
        success: false,
        message: (result.message || 'XpresPortal rejected the request') + refundMessage,
      }, { status: 502 });
    }
  } catch (e) {
    console.error('[retry-delivery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Wallet refund helper ──────────────────────────────────────
async function refundWalletForFailedOrder(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  order: { id: string; agent_id: string; agent_price: number; reference: string }
): Promise<boolean> {
  try {
    // Idempotency: don't double-refund if this order already has a refund transaction
    const { data: existingRefund } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('reference', `RFD-${order.reference}`)
      .maybeSingle();
    if (existingRefund) return false;

    const { data: wallet } = await supabase.from('wallets').select('*').eq('agent_id', order.agent_id).single();
    if (!wallet) return false;

    const amount = order.agent_price || 0;
    if (amount <= 0) return false;

    const newBalance = wallet.balance + amount;
    await supabase.from('wallets').update({
      balance: newBalance,
      total_spent: Math.max(0, wallet.total_spent - amount),
      updated_at: new Date().toISOString(),
    }).eq('id', wallet.id);

    await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      agent_id: order.agent_id,
      type: 'refund',
      amount,
      balance_before: wallet.balance,
      balance_after: newBalance,
      reference: `RFD-${order.reference}`,
      status: 'success',
      description: `Refund: delivery retry failed for ${order.reference}`,
    });

    return true;
  } catch (e) {
    console.error('[retry-delivery] refund helper error:', e);
    return false;
  }
}
