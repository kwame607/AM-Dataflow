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

// ── Temporary testing override for brand-new numbers ────────────────────
// Default behavior for a number with no order history anywhere is Hubnet
// (see routing priority above). To temporarily send new numbers to
// XpresPortal instead — e.g. to capture the raw "not verified" rejection
// JSON for a genuinely new number — set NEW_NUMBER_TEST_PROVIDER=xpresportal
// in Vercel's environment variables. Remove the var (or set it back to
// "hubnet") to return to normal behavior. No code change needed either way.
const NEW_NUMBER_TEST_PROVIDER = (process.env.NEW_NUMBER_TEST_PROVIDER || 'hubnet').toLowerCase();

// ── XpresPortal "not verified" rejection signature ───────────────────────
// Confirmed live response shape (2026-07-24), HTTP 422:
//   { success:false, code:"RECIPIENT_NOT_VERIFIED_FOR_RESTRICTED_MTN_PROVIDER",
//     type:"RECIPIENT_NOT_ELIGIBLE_FOR_RESTRICTED_MTN_UP2U", billable:false,
//     retryAllowed:false }
// Matched on the stable `code`/`type` identifiers, not the human-readable
// `error` sentence, since wording can change but these identifiers are the
// actual machine-readable signal. billable:false confirms no charge was
// made, so falling back to another provider is safe.
const XPRES_NOT_VERIFIED_CODES = new Set(['RECIPIENT_NOT_VERIFIED_FOR_RESTRICTED_MTN_PROVIDER']);
const XPRES_NOT_VERIFIED_TYPES = new Set(['RECIPIENT_NOT_ELIGIBLE_FOR_RESTRICTED_MTN_UP2U']);

function isXpresNotVerifiedRejection(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === 'string' ? r.code : '';
  const type = typeof r.type === 'string' ? r.type : '';
  return XPRES_NOT_VERIFIED_CODES.has(code) || XPRES_NOT_VERIFIED_TYPES.has(type);
}

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
  /** true if XpresPortal rejected this number as unverified and it was automatically retried via Hubnet instead */
  xpresRejectedUnverified?: boolean;
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
  allowHubnetFallback: boolean = true,
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

  // ── Auto-fallback: XpresPortal rejected this number as unverified ───────
  // (their own equivalent of the MTN/AT/Telecel restriction this whole
  // number-history feature exists to work around). billable:false on their
  // side confirms no charge was made, so it's safe to immediately retry via
  // Hubnet instead of leaving this order sitting as failed.
  // Disabled when allowHubnetFallback=false — used for manual/forced admin
  // retries where the point is to actually see XpresPortal's raw response,
  // not have it silently swapped for a Hubnet delivery.
  if (allowHubnetFallback && !result.success && isXpresNotVerifiedRejection(result.raw)) {
    console.log(`[delivery] XpresPortal rejected ${phone} as unverified — auto-falling back to Hubnet for ${reference}`);
    const hubnetResult = await deliverViaHubnet(bundle, network, phone, reference);
    return { ...hubnetResult, xpresRejectedUnverified: true };
  }

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
  bundle:         Bundle & { network?: string };
  network:        string;
  phone:          string;
  reference:      string;
  /** Bypasses ALL auto-routing/history logic entirely and delivers via this
   *  specific provider. Used for manual admin retries — e.g. testing
   *  whether XpresPortal accepts a number regardless of what your own
   *  order history says about it, since your history is only a proxy for
   *  each provider's own separate verification database, not the actual
   *  ground truth. */
  forceProvider?: 'hubnet' | 'xpresportal' | 'myztadata';
}): Promise<DeliveryResult> {
  const { bundle, network, phone, reference, forceProvider } = params;

  if (forceProvider) {
    if (forceProvider === 'hubnet')    return deliverViaHubnet(bundle, network, phone, reference);
    if (forceProvider === 'myztadata') return deliverViaMyZtaData(bundle, network, phone, reference);
    return deliverViaXpresPortal(bundle, network, phone, reference, false); // false = no auto-fallback; we want to see XpresPortal's actual result
  }

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
    // Brand new number — normally always Hubnet, ignoring the toggle,
    // since XpresPortal reliability for unproven numbers isn't trusted yet.
    // Can be temporarily overridden to XpresPortal via the
    // NEW_NUMBER_TEST_PROVIDER env var — see note near the top of this file.
    result = NEW_NUMBER_TEST_PROVIDER === 'xpresportal'
      ? await deliverViaXpresPortal(bundle, network, phone, reference)
      : await deliverViaHubnet(bundle, network, phone, reference);
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
