/**
 * lib/delivery.ts
 * Provider dispatcher — routes orders to the active provider.
 * Returns actual_cost so callers can store accurate hubnet_cost.
 *
 * AUTO-ROUTE PRIORITY (numbers with known order history):
 *   1. Brand new number (no history anywhere)      → always Hubnet, ignoring
 *      the globally toggled active provider — XpresPortal isn't trusted yet
 *      for unproven numbers.
 *   2. Known on BOTH Hubnet and XpresPortal          → defer to whatever the
 *      globally toggled active provider currently is.
 *   3. Known on XpresPortal ONLY                     → route to XpresPortal.
 *   4. Known on Hubnet ONLY                          → route to Hubnet.
 *
 * The rationale: whichever provider's submitted database already contains
 * this number is safe from the 2-3 day new-number verification delay
 * MTN/AT/Telecel now impose — but for numbers with no track record at all,
 * default to the provider that's actually trusted (Hubnet).
 *
 * NOTE: Hubnet's Telecel support used to be excluded here based on an
 * earlier assumption (see lib/bundles.ts comments) that Hubnet didn't
 * support Telecel at all. That's since changed operationally, so Hubnet
 * routing below applies to all networks, not just mtn/at.
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
  /** true if this order was force-routed to Hubnet because the number is known there but NOT on XpresPortal */
  autoRoutedToHubnet?: boolean;
  /** true if this order was force-routed to XpresPortal because the number is known there but NOT on Hubnet */
  autoRoutedToXpres?: boolean;
  /** true if this number has no order history on file — routed to Hubnet by default */
  isNewNumber?: boolean;
}

// ── Known-on-XpresPortal notification cooldown ──────────────────────────
// Same pattern as the wallet-balance alert cooldowns elsewhere in the app —
// prevents spamming the admin bell every time a repeat customer places
// another order. Fires whenever an order actually ends up delivered via
// XpresPortal for a number with prior XpresPortal history — useful for
// keeping an eye on spend against the balance while trust in the provider
// is still being established.
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
  history: { totalOrders: number; lastOrderAt: string | null },
) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from('support_notifications').insert({
      target_type: 'admin',
      title:       '📡 Order delivered via XpresPortal',
      message:     `${phone} has prior order history on XpresPortal (${history.totalOrders} order${history.totalOrders !== 1 ? 's' : ''}, last ${history.lastOrderAt ? new Date(history.lastOrderAt).toLocaleDateString('en-GH') : 'unknown'}). Order ${reference} was delivered there.`,
      is_read:     false,
    });
  } catch (e) {
    console.error('[delivery] Failed to send XpresPortal-known notification:', e);
  }
}

// ── Per-provider delivery helpers ────────────────────────────────────────

async function deliverViaHubnet(
  bundle: Bundle & { network?: string },
  network: string,
  phone: string,
  reference: string,
): Promise<DeliveryResult> {
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

async function deliverViaXpresPortal(
  bundle: Bundle & { network?: string },
  network: string,
  phone: string,
  reference: string,
): Promise<DeliveryResult> {
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

async function deliverViaMyZtaData(
  bundle: Bundle & { network?: string },
  network: string,
  phone: string,
  reference: string,
): Promise<DeliveryResult> {
  const volumeGB = Math.round(parseInt(bundle.volume || '0', 10) / 1000);
  const result   = await myZtaOrder({ network, phone, volumeGB, reference });
  const mzCost   = getMyZtaCost(bundle.key, bundle.cost);
  return {
    success:     result.success,
    provider:    'myztadata',
    orderId:     result.transaction_code || undefined,
    message:     result.message,
    actual_cost: mzCost, // MyZtaData cost — different from bundle default
  };
}

/** Delivers via whichever provider is currently toggled active in settings. */
async function deliverViaConfiguredProvider(
  bundle: Bundle & { network?: string },
  network: string,
  phone: string,
  reference: string,
): Promise<DeliveryResult> {
  const provider = await resolveProviderForOrder(network); // handles AT fallback when MyZtaData is active
  if (provider === 'hubnet')    return deliverViaHubnet(bundle, network, phone, reference);
  if (provider === 'myztadata') return deliverViaMyZtaData(bundle, network, phone, reference);
  return deliverViaXpresPortal(bundle, network, phone, reference); // default: XpresPortal
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
  // falls back to treating the number as brand new (routes to Hubnet)
  // rather than being blocked entirely.
  let knownProviders: string[] = [];
  let historyMeta: { totalOrders: number; lastOrderAt: string | null } = { totalOrders: 0, lastOrderAt: null };
  try {
    const history = await getNumberOrderHistory(phone);
    knownProviders = history.knownProviders;
    historyMeta = { totalOrders: history.totalOrders, lastOrderAt: history.lastOrderAt };
  } catch (e) {
    console.error('[delivery] number history lookup failed:', e);
  }

  const knownOnHubnet = knownProviders.includes('hubnet');
  const knownOnXpres  = knownProviders.includes('xpresportal');

  let result: DeliveryResult;
  let autoRoutedToHubnet = false;
  let autoRoutedToXpres  = false;
  let isNewNumber        = false;

  if (knownOnHubnet && knownOnXpres) {
    // Known on both — defer to whatever the toggle currently says.
    result = await deliverViaConfiguredProvider(bundle, network, phone, reference);
  } else if (knownOnXpres) {
    // Known on XpresPortal only — force-route there.
    result = await deliverViaXpresPortal(bundle, network, phone, reference);
    autoRoutedToXpres = true;
  } else if (knownOnHubnet) {
    // Known on Hubnet only — force-route there.
    result = await deliverViaHubnet(bundle, network, phone, reference);
    autoRoutedToHubnet = true;
  } else {
    // Brand new number — always Hubnet, ignoring the toggle, since
    // XpresPortal reliability for unproven numbers isn't trusted yet.
    result = await deliverViaHubnet(bundle, network, phone, reference);
    isNewNumber = true;
  }

  // Notify whenever an order actually lands on XpresPortal for a number
  // with prior XpresPortal history — covers both the "XpresPortal only"
  // and "both, toggle currently set to XpresPortal" cases.
  if (result.provider === 'xpresportal' && knownOnXpres && canNotifyXpresKnown(phone)) {
    notifyKnownOnXpresPortal(phone, reference, historyMeta).catch(() => {});
  }

  return { ...result, autoRoutedToHubnet, autoRoutedToXpres, isNewNumber };
}
