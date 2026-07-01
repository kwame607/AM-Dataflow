/**
 * lib/delivery.ts
 * Provider dispatcher — routes orders to the active provider.
 * Providers: 'xpresportal' | 'hubnet' | 'myztadata'
 * No fallback between providers — prevents double-delivery.
 */

import { xpresOrder } from '@/lib/xpresportal';
import { hubnetOrder } from '@/lib/hubnet';
import { myZtaOrder } from '@/lib/myztadata';
import { getXpresParams } from '@/lib/bundles';
import { getActiveProvider } from '@/lib/settings';
import type { Bundle } from '@/types';

export interface DeliveryResult {
  success:   boolean;
  provider:  'xpresportal' | 'hubnet' | 'myztadata';
  orderId?:  string;
  reference?: string;
  message?:  string;
}

export async function deliverBundle(params: {
  bundle:    Bundle & { network?: string };
  network:   string;
  phone:     string;
  reference: string;
}): Promise<DeliveryResult> {
  const { bundle, network, phone, reference } = params;
  const provider = await getActiveProvider();

  if (provider === 'hubnet') {
    const volumeGB = Math.round(parseInt(bundle.volume || '0', 10) / 1000);
    const result   = await hubnetOrder({ network, phone, volumeGB, reference });
    return {
      success:   result.success,
      provider:  'hubnet',
      orderId:   result.orderId,
      reference: result.reference,
      message:   result.message,
    };
  }

  if (provider === 'myztadata') {
    const volumeGB = Math.round(parseInt(bundle.volume || '0', 10) / 1000);
    // MyZtaData only covers MTN and TELECEL — block AT orders
    if (network.toLowerCase() === 'at') {
      return {
        success:  false,
        provider: 'myztadata',
        message:  'MyZtaData does not support AirtelTigo. Switch provider or change network.',
      };
    }
    const result = await myZtaOrder({ network, phone, volumeGB, reference });
    return {
      success:   result.success,
      provider:  'myztadata',
      orderId:   result.transaction_code || undefined,
      message:   result.message,
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
    success:   result.success,
    provider:  'xpresportal',
    orderId:   result.orderId,
    reference: result.reference,
    message:   result.message,
  };
}
