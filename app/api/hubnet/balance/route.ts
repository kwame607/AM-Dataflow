// app/api/hubnet/balance/route.ts  ← REPLACE your existing file with this
// Added: low-wallet email alert when balance drops below threshold
import { NextResponse } from 'next/server';
import { xpresCheckBalance } from '@/lib/xpresportal';
import { sendLowWalletEmail } from '@/lib/email';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

// Alert thresholds (GHS)
const CRITICAL_THRESHOLD = 50;
const WARNING_THRESHOLD  = 100;

// Simple in-memory cooldown — prevents sending the same email every minute
// Resets on each serverless cold start (good enough; won't spam)
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between same-level alerts

function canSendAlert(key: string): boolean {
  const last = alertCooldown.get(key) || 0;
  if (Date.now() - last > COOLDOWN_MS) {
    alertCooldown.set(key, Date.now());
    return true;
  }
  return false;
}

export async function GET() {
  const result = await xpresCheckBalance();

  if (!result) {
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }

  const { balance } = result;

  // ── 🔔 Low wallet email alerts ───────────────────────────
  if (balance < CRITICAL_THRESHOLD && canSendAlert('critical')) {
    // Count pending orders that are at risk
    let pendingOrders = 0;
    try {
      const supabase = createSupabaseAdminClient();
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('delivery_status', ['pending', 'processing']);
      pendingOrders = count || 0;
    } catch { /* non-fatal */ }

    sendLowWalletEmail({
      balance,
      threshold:    CRITICAL_THRESHOLD,
      pendingOrders,
    }).catch(e => console.error('[balance] critical email error:', e));

  } else if (balance < WARNING_THRESHOLD && balance >= CRITICAL_THRESHOLD && canSendAlert('warning')) {
    sendLowWalletEmail({
      balance,
      threshold: WARNING_THRESHOLD,
    }).catch(e => console.error('[balance] warning email error:', e));
  }

  return NextResponse.json({ balance });
}
