// lib/delivery.ts
//
// Central dispatcher for data bundle delivery. Picks between XpresPortal and
// Hubnet based on the active provider toggle (with Telecel hardcoded to
// XpresPortal since Hubnet doesn't support it), and normalizes both
// providers' results into one shape so callers don't need provider-specific
// branching anywhere else in the app.

import { xpresOrder } from '@/lib/xpresportal';
import { hubnetOrder, isHubnetSupportedNetwork } from '@/lib/hubnet';
import { getXpresParams, getHubnetParams, type Bundle } from '@/lib/bundles';
import { resolveProviderForOrder, type DeliveryProvider } from '@/lib/settings';

export interface DeliveryResult {
  success:   boolean;
  provider:  DeliveryProvider;
  orderId?:  string;
  reference?: string;
  message?:  string;
  raw?:      unknown;
}

interface DeliverParams {
  bundle:    Bundle & { network?: string };
  network:   string;
  phone:     string;
  reference: string;
}

/**
 * Delivers a bundle via whichever provider should handle this order, and
 * returns a normalized result. Includes a same-call fallback: if the chosen
 * provider is Hubnet but this specific bundle's network isn't actually
 * supported there (shouldn't normally happen since resolveProviderForOrder
 * already excludes telecel, but defensive in case Hubnet's coverage changes
 * or shrinks unexpectedly), it falls back to XpresPortal rather than failing
 * the order outright.
 */
export async function deliverBundle(params: DeliverParams): Promise<DeliveryResult> {
  const { bundle, network, phone, reference } = params;

  const provider = await resolveProviderForOrder(network);

  if (provider === 'hubnet') {
    const { network: hubnetNet, volumeMB } = getHubnetParams({ ...bundle, network });

    if (hubnetNet && isHubnetSupportedNetwork(hubnetNet)) {
      const result = await hubnetOrder({
        network: hubnetNet,
        phone,
        volumeMB,
        reference,
      });

      if (result.success) {
        return {
          success: true,
          provider: 'hubnet',
          orderId: result.orderId,
          reference: result.reference,
          message: result.message,
          raw: result.raw,
        };
      }

      // Hubnet rejected it — log and fall through to XpresPortal as a
      // same-call safety net rather than losing the order entirely.
      console.warn('[delivery] Hubnet order failed, falling back to XpresPortal:', result.message);
    } else {
      console.warn(`[delivery] Network "${network}" not supported on Hubnet — falling back to XpresPortal`);
    }
  }

  // XpresPortal path — either it was the selected provider, or we fell
  // back to it because Hubnet couldn't handle this order.
  const { network: xpresNetwork, offerSlug, volumeGB } = getXpresParams({ ...bundle, network });
  const xpresResult = await xpresOrder({
    network: xpresNetwork,
    phone,
    volume: volumeGB,
    offerSlug,
    reference,
  });

  return {
    success: xpresResult.success,
    provider: 'xpresportal',
    orderId: xpresResult.orderId,
    reference: xpresResult.reference,
    message: xpresResult.message,
    raw: xpresResult.raw,
  };
}
