/**
 * lib/delivery.ts
 * Provider dispatcher — routes orders to the active provider.
 * Returns actual_cost so callers can store accurate hubnet_cost.
 *
 * AUTO-ROUTE RULE: if a phone number already has known (processing or
 * delivered) order history through Hubnet specifically, this order is
 * force-routed to Hubnet regardless of the globally configured active
 * provider — Hubnet's submitted verification database already contains
 * this number, so routing here avoids the new-number verification delay
 * MTN/AT/Telecel now impose (2-3 days for numbers not yet in a submitted
 * database).
 *
 * XpresPortal history is NEVER auto-routed to. If a number has known
 * history on XpresPortal, we just fire an admin notification about it and
 * otherwise proceed with normal routing.
 */

import { xpresOrder } from '@/lib/xpresportal';
import { hubnetOrder } from '@/lib/hubnet';
import { myZtaOrder } from '@/lib/myztadata';
import { getXpresParams } from '@/lib/bundles';
import { resolveProviderForOrder } from '@/lib/settings';
import { getMyZtaCost } from '@/lib/myztadata-prices';
import { getNumberOrderHistory } from '@/lib/number-history';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import type { Bundle } from '@/types';
import type { HubnetNetwork } from '@/lib/hubnet';

export interface DeliveryResult {
  success:      boolean;
  provider:     'xpresportal' | 'hubnet' | 'myztadata';
  orderId?:     string;
  reference?:   string;
  message?:     string;
  actual_cost:  number; // real provider cost — store as hubnet_cost in orders
  /** true if this order bypassed the configured active provider because the number is already known to Hubnet */
  autoRoutedToHubnet?: boolean;
}

// ── XpresPortal-known notification cooldown ─────────────────────────────
// Same pattern as the wallet-balance alert cooldowns elsewhere in the app —
// prevents spamming the admin bell every time a repeat customer (already
// known on XpresPortal) places another order.
const xpresNotifyCooldown = new Map<string, number>();
const XPRES_NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h per phone number

function canNotifyXpresKnown(phone: string): boolean {
  const last = xpresNotifyCooldown.get(phone) || 0;
  if (Date.now() - last > XPRES_NOTIFY_COOLDOWN_MS) {
    xpresNotifyCooldown.set(phone, Date.now());
    return true;
  }
  return false;
}

async function notifyKnownOnXpresPortal(
  phone: string,
  reference: string,
  routedProviderLabel: string,
  history: { totalOrders: number; lastOrderAt: string | null },
) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from('support_notifications').insert({
      target_type: 'admin',
      title:       '📡 Number already known on XpresPortal',
      message:     `${phone} has prior order history on XpresPortal (${history.totalOrders} order${history.totalOrders !== 1 ? 's' : ''}, last ${history.lastOrderAt ? new Date(history.lastOrderAt).toLocaleDateString('en-GH') : 'unknown'}). Order ${reference} was routed via ${routedProviderLabel} — not auto-switched to XpresPortal.`,
      is_read:     false,
    });
  } catch (e) {
    console.error('[delivery] Failed to send XpresPortal-known notification:', e);
  }
}

export async function deliverBundle(params: {
  bundle:      Bundle & { network?: string };
  network:     string;
  phone:       string;
  reference:   string;
}): Promise<DeliveryResult> {
  const { bundle, network, phone, reference } = params;

  // ── Check this number's history across our own providers ────────────────
  // Wrapped defensively — if this lookup fails for any reason, delivery
  // still proceeds normally rather than being blocked by it.
  let knownProviders: string[] = [];
  let historyMeta: { totalOrders: number; lastOrderAt: string | null } = { totalOrders: 0, lastOrderAt: null };
  try {
    const history = await getNumberOrderHistory(phone);
    knownProviders = history.knownProviders;
    historyMeta = { totalOrders: history.totalOrders, lastOrderAt: history.lastOrderAt };
  } catch (e) {
    console.error('[delivery] number history lookup failed:', e);
  }

  const knownOnHubnet     = knownProviders.includes('hubnet');
  const knownOnXpres      = knownProviders.includes('xpresportal');
  const hubnetSupportsNet = network === 'mtn' || network === 'at'; // Hubnet doesn't support Telecel

  const autoRouteToHubnet = knownOnHubnet && hubnetSupportsNet;

  // Fire the XpresPortal-known notification regardless of final routing —
  // purely informational, never blocks or slows delivery.
  if (knownOnXpres && canNotifyXpresKnown(phone)) {
    const routedProviderLabel = autoRouteToHubnet ? 'Hubnet (auto-routed)' : 'the currently configured provider';
    notifyKnownOnXpresPortal(phone, reference, routedProviderLabel, historyMeta).catch(() => {});
  }

  // ── AUTO-ROUTE: force Hubnet if this number is already known there ──────
  // Skips the configured active provider entirely — a number that has
  // already succeeded through Hubnet is in Hubnet's submitted verification
  // database, so routing here avoids the new-number verification delay.
  // XpresPortal history is intentionally never auto-routed to.
  if (autoRouteToHubnet) {
    const volumeMB = parseInt(bundle.volume || '0', 10);
    const result   = await hubnetOrder({ network: network as HubnetNetwork, phone, volumeMB, reference });
    return {
      success:            result.success,
      provider:           'hubnet',
      orderId:            result.orderId,
      reference:          result.reference,
      message:            result.message,
      actual_cost:        bundle.cost,
      autoRoutedToHubnet: true,
    };
  }

  // resolveProviderForOrder handles AT fallback when MyZtaData is active
  const provider = await resolveProviderForOrder(network);

  if (provider === 'hubnet') {
    const volumeMB = parseInt(bundle.volume || '0', 10);
    const result   = await hubnetOrder({ network: network as HubnetNetwork, phone, volumeMB, reference });
    return {
      success:     result.success,
      provider:    'hubnet',
      orderId:     result.orderId,
      reference:   result.reference,
      message:     result.message,
      actual_cost: bundle.cost, // Hubnet cost = same as bundle default cost
    };
  }

  if (provider === 'myztadata') {
    const volumeGB  = Math.round(parseInt(bundle.volume || '0', 10) / 1000);
    const result    = await myZtaOrder({ network, phone, volumeGB, reference });
    const mzCost    = getMyZtaCost(bundle.key, bundle.cost);
    return {
      success:     result.success,
      provider:    'myztadata',
      orderId:     result.transaction_code || undefined,
      message:     result.message,
      actual_cost: mzCost, // MyZtaData cost — different from bundle default
    };
  }

  // Default: XpresPortal
  const rawUrl  = process.env.NEXT_PUBLIC_SITE_URL || '';
  const siteUrl = rawUrl && !rawUrl.includes('localhost')
    ? rawUrl
    : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

  const { network: xpresNetwork, offerSlug, volumeGB } = getXpresParams({ ...bundle, network });
  const webhookUrl = siteUrl
    ? `${siteUrl}/api/xpresportal/webhook?internalRef=${encodeURIComponent(reference)}`
    : undefined;

  const result = await xpresOrder({ network: xpresNetwork, phone, volume: volumeGB, offerSlug, reference, webhookUrl });
  return {
    success:     result.success,
    provider:    'xpresportal',
    orderId:     result.orderId,
    reference:   result.reference,
    message:     result.message,
    actual_cost: bundle.cost, // XpresPortal cost = same as bundle default cost
  };
}
