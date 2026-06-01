// app/api/cron/wallet-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { xpresCheckBalance } from '@/lib/xpresportal';
import { sendLowWalletEmail } from '@/lib/email';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

const CRITICAL_THRESHOLD = 50;
const WARNING_THRESHOLD  = 100;

// In-memory cooldown — prevents repeat emails within 1 hour
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000;

function canSendAlert(key: string): boolean {
  const last = alertCooldown.get(key) || 0;
  if (Date.now() - last > COOLDOWN_MS) {
    alertCooldown.set(key, Date.now());
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  // ── Auth: accept Vercel cron secret OR admin session ──────
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';

  const isCron  = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAdmin = !isCron && (await requireAdmin(req)).ok;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Fetch XpresPortal balance ─────────────────────────────
  const result = await xpresCheckBalance();

  if (!result) {
    return NextResponse.json({
      checked: false,
      error:   'Could not fetch XpresPortal balance — check your API key',
    }, { status: 500 });
  }

  const { balance } = result;
  let emailSent  = false;
  let alertLevel = 'none';

  // ── Count pending orders at risk ──────────────────────────
  let pendingOrders = 0;
  try {
    const supabase = createSupabaseAdminClient();
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('delivery_status', ['pending', 'processing']);
    pendingOrders = count || 0;
  } catch (e) {
    console.warn('[wallet-check] Could not count pending orders:', e);
  }

  // ── Send alert email if balance is low ────────────────────
  if (balance < CRITICAL_THRESHOLD && canSendAlert('critical')) {
    alertLevel = 'critical';
    const r = await sendLowWalletEmail({
      balance,
      threshold:    CRITICAL_THRESHOLD,
      pendingOrders,
    });
    emailSent = r.ok;
    if (!r.ok) console.error('[wallet-check] Critical alert email failed:', r.error);

  } else if (balance >= CRITICAL_THRESHOLD && balance < WARNING_THRESHOLD && canSendAlert('warning')) {
    alertLevel = 'warning';
    const r = await sendLowWalletEmail({
      balance,
      threshold:    WARNING_THRESHOLD,
      pendingOrders,
    });
    emailSent = r.ok;
    if (!r.ok) console.error('[wallet-check] Warning alert email failed:', r.error);
  }

  console.log(`[wallet-check] balance=GHS${balance} alert=${alertLevel} emailSent=${emailSent} pendingOrders=${pendingOrders}`);

  return NextResponse.json({
    checked:       true,
    balance,
    alertLevel,
    emailSent,
    pendingOrders,
    thresholds: {
      warning:  WARNING_THRESHOLD,
      critical: CRITICAL_THRESHOLD,
    },
    checkedAt: new Date().toISOString(),
    triggeredBy: isCron ? 'vercel-cron' : 'admin-panel',
  });
}
