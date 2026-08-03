// app/api/admin/reconcile-paystack/route.ts — NEW FILE
// Finds Paystack transactions that succeeded but never became an order in
// our system — the symptom of the missing-webhook gap. Read-only GET to
// list orphans; POST to resolve one, either by recording it as already
// manually delivered (no re-delivery) or by actually creating+delivering it.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getBundleByKey, getDefaultAdminPrice } from '@/lib/bundles';
import { deliverBundle } from '@/lib/delivery';
import { creditReferralBonus } from '@/lib/referral';

interface PaystackTxn {
  reference: string;
  amount: number; // pesewas
  paid_at: string;
  metadata: Record<string, unknown> | string | null;
  customer?: { email?: string };
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function extractOrderFields(txn: PaystackTxn) {
  const meta = parseMetadata(txn.metadata);
  const network   = String(meta.network ?? '');
  const bundleKey = String(meta.bundle_key ?? '');
  const source    = String(meta.source ?? 'main');
  const agentSlug = meta.agent_slug ? String(meta.agent_slug) : null;
  const agentPrice = typeof meta.agent_price === 'number' ? meta.agent_price : undefined;

  const customFields = Array.isArray(meta.custom_fields)
    ? (meta.custom_fields as Array<{ variable_name: string; value: string }>)
    : [];
  const phone = customFields.find(f => f.variable_name === 'phone')?.value || '';

  return { network, bundleKey, source, agentSlug, agentPrice, phone };
}

async function fetchPaystackTransactions(fromISO: string, toISO: string): Promise<PaystackTxn[]> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY not configured');

  const all: PaystackTxn[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.paystack.co/transaction?status=success&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}&perPage=${perPage}&page=${page}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
    const json = await res.json();
    if (!json.status) throw new Error(json.message || 'Paystack list transactions failed');

    const rows: PaystackTxn[] = json.data || [];
    all.push(...rows);

    const pageCount = json.meta?.pageCount || 1;
    if (page >= pageCount || rows.length === 0 || page > 50) break; // 50-page (5000 txn) safety cap
    page++;
  }

  return all;
}

// ── GET — list orphaned transactions ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hours         = parseInt(req.nextUrl.searchParams.get('hours') || '24', 10);
  const networkFilter = (req.nextUrl.searchParams.get('network') || 'mtn').toLowerCase();

  const to   = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  try {
    const txns     = await fetchPaystackTransactions(from.toISOString(), to.toISOString());
    const supabase = createSupabaseAdminClient();

    const orphans: Array<{
      reference: string; amount: number; phone: string; network: string;
      bundleKey: string; source: string; agentSlug: string | null;
      agentPrice?: number; paidAt: string; customerEmail?: string;
    }> = [];

    for (const txn of txns) {
      const fields = extractOrderFields(txn);
      if (networkFilter !== 'all' && fields.network.toLowerCase() !== networkFilter) continue;

      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('reference', txn.reference)
        .maybeSingle();

      if (existing) continue; // already has an order — not orphaned

      orphans.push({
        reference:     txn.reference,
        amount:        (txn.amount || 0) / 100,
        phone:         fields.phone,
        network:       fields.network,
        bundleKey:     fields.bundleKey,
        source:        fields.source,
        agentSlug:     fields.agentSlug,
        agentPrice:    fields.agentPrice,
        paidAt:        txn.paid_at,
        customerEmail: txn.customer?.email,
      });
    }

    return NextResponse.json({
      checkedFrom:  from.toISOString(),
      checkedTo:    to.toISOString(),
      totalChecked: txns.length,
      orphanCount:  orphans.length,
      orphans,
    });
  } catch (e) {
    console.error('[reconcile-paystack GET]', e);
    return NextResponse.json({ error: 'Failed to reconcile: ' + (e as Error).message }, { status: 500 });
  }
}

// ── POST — resolve one orphan ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { reference, action, phone, network, bundleKey, source, agentSlug, agentPrice } = body;

    if (!reference || !action || !phone || !network || !bundleKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['mark-delivered', 'deliver'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const bundle = getBundleByKey(bundleKey);
    if (!bundle) return NextResponse.json({ error: 'Unknown bundle' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // Guard against double-processing if two admins act on the same list.
    const { data: existing } = await supabase.from('orders').select('id').eq('reference', reference).maybeSingle();
    if (existing) return NextResponse.json({ error: 'An order for this reference already exists' }, { status: 409 });

    const { data: adminPriceRow } = await supabase
      .from('admin_prices').select('selling_price').eq('bundle_key', bundleKey).single();
    const adminPrice = adminPriceRow?.selling_price ?? getDefaultAdminPrice(bundle.cost);

    let agentId: string | null = null;
    let referrerAgentId: string | null = null;
    let grossAgentProfit = 0;
    const finalAgentPrice = agentPrice ?? adminPrice;

    if (source === 'agent' && agentSlug) {
      const { data: agent } = await supabase.from('agents').select('id, referred_by_id').eq('slug', agentSlug).single();
      if (agent) {
        agentId = agent.id;
        referrerAgentId = agent.referred_by_id || null;
        grossAgentProfit = finalAgentPrice - adminPrice;
      }
    }

    if (action === 'mark-delivered') {
      // Already manually delivered via the provider's own portal directly —
      // just record the order for accounting purposes. No delivery call,
      // to avoid double-sending data to a customer who already got it.
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          reference, phone, network,
          bundle_key: bundleKey, size: bundle.size, volume: bundle.volume,
          hubnet_cost: bundle.cost,
          admin_price: adminPrice, admin_profit: adminPrice - bundle.cost,
          agent_price: finalAgentPrice, agent_profit: grossAgentProfit,
          agent_id: agentId, agent_slug: agentSlug || null,
          referrer_agent_id: referrerAgentId,
          source: source || 'main',
          status: 'success',
          delivery_status: 'delivered',
          delivery_provider: 'hubnet', // manual delivery was via Hubnet's own portal per your note
          delivered_at: new Date().toISOString(),
          paystack_ref: reference,
        })
        .select('id')
        .single();

      if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

      if (agentId && grossAgentProfit > 0) {
        try {
          const netProfit = await creditReferralBonus(supabase, order.id, agentId, grossAgentProfit);
          if (netProfit !== grossAgentProfit) {
            await supabase.from('orders').update({
              agent_profit: netProfit,
              referral_bonus: parseFloat((grossAgentProfit - netProfit).toFixed(2)),
            }).eq('id', order.id);
          }
        } catch (e) {
          console.error('[reconcile resolve] referral credit error:', e);
        }
      }

      return NextResponse.json({ success: true, action: 'mark-delivered' });
    }

    // action === 'deliver' — create the order and actually attempt delivery now
    const deliveryResult = await deliverBundle({ bundle, network, phone, reference });
    const actualCost  = deliveryResult.actual_cost;
    const adminProfit = adminPrice - actualCost;

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        reference, phone, network,
        bundle_key: bundleKey, size: bundle.size, volume: bundle.volume,
        hubnet_cost: actualCost,
        admin_price: adminPrice, admin_profit: adminProfit,
        agent_price: finalAgentPrice, agent_profit: grossAgentProfit,
        agent_id: agentId, agent_slug: agentSlug || null,
        referrer_agent_id: referrerAgentId,
        source: source || 'main',
        status: 'success',
        delivery_status: deliveryResult.success ? 'processing' : 'failed',
        delivery_provider: deliveryResult.provider,
        hubnet_transaction_id: deliveryResult.orderId || null,
        paystack_ref: reference,
      })
      .select('id')
      .single();

    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

    if (deliveryResult.success && agentId && grossAgentProfit > 0) {
      try {
        const netProfit = await creditReferralBonus(supabase, order.id, agentId, grossAgentProfit);
        if (netProfit !== grossAgentProfit) {
          await supabase.from('orders').update({
            agent_profit: netProfit,
            referral_bonus: parseFloat((grossAgentProfit - netProfit).toFixed(2)),
          }).eq('id', order.id);
        }
      } catch (e) {
        console.error('[reconcile resolve] referral credit error:', e);
      }
    }

    return NextResponse.json({
      success: deliveryResult.success,
      action:  'deliver',
      message: deliveryResult.success
        ? `Delivered via ${deliveryResult.provider}`
        : (deliveryResult.message || 'Delivery failed'),
    });
  } catch (e) {
    console.error('[reconcile-paystack POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
