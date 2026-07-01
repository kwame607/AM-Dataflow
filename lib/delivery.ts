/**
 * lib/delivery.ts
 * Provider dispatcher — routes orders to the active provider.
 * Returns actual_cost so callers can store accurate hubnet_cost.
 */

import { xpresOrder } from '@/lib/xpresportal';
import { hubnetOrder } from '@/lib/hubnet';
import { myZtaOrder } from '@/lib/myztadata';
import { getXpresParams } from '@/lib/bundles';
import { resolveProviderForOrder } from '@/lib/settings';
import { getMyZtaCost } from '@/lib/myztadata-prices';
import type { Bundle, HubnetNetwork } from '@/types';

export interface DeliveryResult {
  success:      boolean;
  provider:     'xpresportal' | 'hubnet' | 'myztadata';
  orderId?:     string;
  reference?:   string;
  message?:     string;
  actual_cost:  number; // real provider cost — store as hubnet_cost in orders
}

export async function deliverBundle(params: {
  bundle:      Bundle & { network?: string };
  network:     string;
  phone:       string;
  reference:   string;
}): Promise<DeliveryResult> {
  const { bundle, network, phone, reference } = params;

  // resolveProviderForOrder handles AT fallback when MyZtaData is active
  const provider = await resolveProviderForOrder(network);

  if (provider === 'hubnet') {
    const volumeGB = Math.round(parseInt(bundle.volume || '0', 10) / 1000);
    const result   = await hubnetOrder({ network: network as HubnetNetwork, phone, volumeGB, reference });
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
