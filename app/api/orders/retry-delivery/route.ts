import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { deliverBundle } from '@/lib/delivery';
import { getBundleByKey } from '@/lib/bundles';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { RetryDeliverySchema } from '@/lib/validate';
import { reverseReferralBonus } from '@/lib/referral';

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

    await supabase.from('orders').update({ delivery_status: 'processing' }).eq('id', order.id);

    const result = await deliverBundle({
      bundle,
      network:   order.network,
      phone:     order.phone,
      reference: order.reference,
    });

    if (result.success) {
      await supabase.from('orders').update({
        delivery_status:   'processing',
        delivery_provider: result.provider,
        hubnet_transaction_id: result.orderId || result.reference || null,
      }).eq('id', order.id);
      return NextResponse.json({
        success: true,
        message: `Delivery sent via ${result.provider === 'hubnet' ? 'Hubnet' : 'XpresPortal'} — awaiting confirmation`,
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
        return NextResponse.json({
          success: true,
          message: `Order is already with ${result.provider === 'hubnet' ? 'Hubnet' : 'XpresPortal'} and being processed — please wait for delivery confirmation`,
        });
      }

      await supabase.from('orders').update({
        delivery_status:   'failed',
        delivery_provider: result.provider,
      }).eq('id', order.id);

      if (order.payment_method === 'wallet') {
        await refundWalletForOrder(supabase, order);
        await reverseReferralBonus(supabase, order.id);
      }

      return NextResponse.json({
        success: false,
        message: result.message || `${result.provider === 'hubnet' ? 'Hubnet' : 'XpresPortal'} rejected the request`,
      }, { status: 502 });
    }
  } catch (e) {
    console.error('[retry-delivery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function refundWalletForOrder(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  order: { id: string; agent_id: string | null; agent_price: number; reference: string },
) {
  if (!order.agent_id) return;

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('agent_id', order.agent_id)
    .single();

  if (!wallet) return;

  const newBalance = wallet.balance + order.agent_price;
  await supabase.from('wallets').update({
    balance:     newBalance,
    total_spent: Math.max(0, wallet.total_spent - order.agent_price),
    updated_at:  new Date().toISOString(),
  }).eq('id', wallet.id);

  await supabase.from('wallet_transactions').insert({
    wallet_id:      wallet.id,
    agent_id:       order.agent_id,
    type:           'refund',
    amount:         order.agent_price,
    balance_before: wallet.balance,
    balance_after:  newBalance,
    reference:      `RFD-${order.reference}`,
    status:         'success',
    description:    `Refund: delivery failed after retry for ${order.reference}`,
  });
}
