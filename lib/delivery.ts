// lib/delivery.ts
//
// Central dispatcher for data bundle delivery. Picks between XpresPortal and
// Hubnet based on the active provider toggle (with Telecel hardcoded to
// XpresPortal since Hubnet doesn't support it), and normalizes both
// providers' results into one shape so callers don't need provider-specific
// branching anywhere else in the app.
//
// IMPORTANT: There is NO automatic fallback between providers. If Hubnet is
// active and is called, that is the final answer for this order — success or
// failure. Automatically falling back to XpresPortal would cause double
// delivery (and double charges) whenever Hubnet's response format is
// unexpected or the network hiccups after the order has already been accepted.
// Manual retries from the admin panel pick up the current active provider.

import { xpresOrder } from '@/lib/xpresportal';
import { hubnetOrder, isHubnetSupportedNetwork } from '@/lib/hubnet';
import { getXpresParams, getHubnetParams } from '@/lib/bundles';
import type { Bundle } from '@/types';
import { resolveProviderForOrder, type DeliveryProvider } from '@/lib/settings';

export interface DeliveryResult {
  success:    boolean;
  provider:   DeliveryProvider;
  orderId?:   string;
  reference?: string;
  message?:   string;
  raw?:       unknown;
}

interface DeliverParams {
  bundle:    Bundle & { network?: string };
  network:   string;
  phone:     string;
  reference: string;
}

export async function deliverBundle(params: DeliverParams): Promise<DeliveryResult> {
  const { bundle, network, phone, reference } = params;

  const provider = await resolveProviderForOrder(network);

  // ── Hubnet path ───────────────────────────────────────────────
  if (provider === 'hubnet') {
    const { network: hubnetNet, volumeMB } = getHubnetParams({ ...bundle, network });

    if (!hubnetNet || !isHubnetSupportedNetwork(hubnetNet)) {
      // Network not supported by Hubnet (e.g. telecel slipped through somehow).
      // This shouldn't happen — resolveProviderForOrder guards telecel — but
      // fail explicitly rather than silently touching XpresPortal.
      console.error(`[delivery] Network "${network}" not supported on Hubnet and telecel guard missed it`);
      return {
        success: false,
        provider: 'hubnet',
        message: `Network ${network} is not supported by Hubnet`,
      };
    }

    const result = await hubnetOrder({ network: hubnetNet, phone, volumeMB, reference });

    console.log('[delivery] Hubnet result:', JSON.stringify({ success: result.success, message: result.message, orderId: result.orderId }));

    // Return Hubnet's result directly — no fallback to XpresPortal.
    // If Hubnet failed, mark the order failed and let the admin retry manually.
    return {
      success:   result.success,
      provider:  'hubnet',
      orderId:   result.orderId,
      reference: result.reference,
      message:   result.message,
      raw:       result.raw,
    };
  }

  // ── XpresPortal path ──────────────────────────────────────────
  const { network: xpresNetwork, offerSlug, volumeGB } = getXpresParams({ ...bundle, network });
  const result = await xpresOrder({ network: xpresNetwork, phone, volume: volumeGB, offerSlug, reference });

  console.log('[delivery] XpresPortal result:', JSON.stringify({ success: result.success, message: result.message, orderId: result.orderId }));

  return {
    success:   result.success,
    provider:  'xpresportal',
    orderId:   result.orderId,
    reference: result.reference,
    message:   result.message,
    raw:       result.raw,
  };
}
