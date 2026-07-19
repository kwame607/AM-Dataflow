import type { Bundle } from '@/types';

export const BUNDLES: Record<string, Bundle[]> = {
  mtn: [
    { key: 'mtn_1gb',   size: '1GB',   volume: '1000',   cost: 4.20,  validity: '90 days' },
    { key: 'mtn_2gb',   size: '2GB',   volume: '2000',   cost: 8.10,  validity: '90 days' },
    { key: 'mtn_3gb',   size: '3GB',   volume: '3000',   cost: 12.10, validity: '90 days' },
    { key: 'mtn_4gb',   size: '4GB',   volume: '4000',   cost: 16.00, validity: '90 days' },
    { key: 'mtn_5gb',   size: '5GB',   volume: '5000',   cost: 20.00, validity: '90 days' },
    { key: 'mtn_6gb',   size: '6GB',   volume: '6000',   cost: 24.00, validity: '90 days' },
    { key: 'mtn_8gb',   size: '8GB',   volume: '8000',   cost: 32.00, validity: '90 days' },
    { key: 'mtn_10gb',  size: '10GB',  volume: '10000',  cost: 38.50, validity: '90 days' },
    { key: 'mtn_15gb',  size: '15GB',  volume: '15000',  cost: 57.00, validity: '90 days' },
    { key: 'mtn_20gb',  size: '20GB',  volume: '20000',  cost: 76.80, validity: '90 days' },
    { key: 'mtn_25gb',  size: '25GB',  volume: '25000',  cost: 96.10, validity: '90 days' },
    { key: 'mtn_30gb',  size: '30GB',  volume: '30000',  cost: 115.20,validity: '90 days' },
    { key: 'mtn_40gb',  size: '40GB',  volume: '40000',  cost: 152.50,validity: '90 days' },
    { key: 'mtn_50gb',  size: '50GB',  volume: '50000',  cost: 191.50,validity: '90 days' },
    { key: 'mtn_100gb', size: '100GB', volume: '100000', cost: 383.00,validity: '90 days' },
  ],
  at: [
    { key: 'at_1gb',   size: '1GB',   volume: '1000',   cost: 3.80,  validity: '90 days' },
    { key: 'at_2gb',   size: '2GB',   volume: '2000',   cost: 7.50,  validity: '90 days' },
    { key: 'at_3gb',   size: '3GB',   volume: '3000',   cost: 11.20, validity: '90 days' },
    { key: 'at_4gb',   size: '4GB',   volume: '4000',   cost: 15.00, validity: '90 days' },
    { key: 'at_5gb',   size: '5GB',   volume: '5000',   cost: 18.70, validity: '90 days' },
    { key: 'at_6gb',   size: '6GB',   volume: '6000',   cost: 22.30, validity: '90 days' },
    { key: 'at_7gb',   size: '7GB',   volume: '7000',   cost: 26.00, validity: '90 days' },
    { key: 'at_8gb',   size: '8GB',   volume: '8000',   cost: 29.80, validity: '90 days' },
    { key: 'at_9gb',   size: '9GB',   volume: '9000',   cost: 33.50, validity: '90 days' },
    { key: 'at_10gb',  size: '10GB',  volume: '10000',  cost: 37.30, validity: '90 days' },
    { key: 'at_12gb',  size: '12GB',  volume: '12000',  cost: 44.60, validity: '90 days' },
    { key: 'at_15gb',  size: '15GB',  volume: '15000',  cost: 55.70, validity: '90 days' },
    { key: 'at_20gb',  size: '20GB',  volume: '20000',  cost: 74.30, validity: '90 days' },
    { key: 'at_25gb',  size: '25GB',  volume: '25000',  cost: 92.70, validity: '90 days' },
    // 30GB+ → airteltigo_bigtime_portal on XpresPortal
    { key: 'at_30gb',  size: '30GB',  volume: '30000',  cost: 111.30,validity: '90 days' },
    { key: 'at_40gb',  size: '40GB',  volume: '40000',  cost: 150.00,validity: '90 days' },
    { key: 'at_50gb',  size: '50GB',  volume: '50000',  cost: 185.20,validity: '90 days' },
    { key: 'at_100gb', size: '100GB', volume: '100000', cost: 370.20,validity: '90 days' },
  ],
  telecel: [
    { key: 'tel_5gb',   size: '5GB',   volume: '5000',   cost: 18.00, validity: '90 days' },
    { key: 'tel_10gb',  size: '10GB',  volume: '10000',  cost: 35.00, validity: '90 days' },
    { key: 'tel_15gb',  size: '15GB',  volume: '15000',  cost: 50.00, validity: '90 days' },
    { key: 'tel_20gb',  size: '20GB',  volume: '20000',  cost: 65.00, validity: '90 days' },
    { key: 'tel_25gb',  size: '25GB',  volume: '25000',  cost: 80.00, validity: '90 days' },
    { key: 'tel_30gb',  size: '30GB',  volume: '30000',  cost: 95.00, validity: '90 days' },
    { key: 'tel_40gb',  size: '40GB',  volume: '40000',  cost: 125.00,validity: '90 days' },
    { key: 'tel_50gb',  size: '50GB',  volume: '50000',  cost: 155.00,validity: '90 days' },
    { key: 'tel_100gb', size: '100GB', volume: '100000', cost: 300.00,validity: '90 days' },
  ],
};

export const ALL_BUNDLES: Bundle[] = [
  ...BUNDLES.mtn.map(b => ({ ...b, network: 'mtn' })),
  ...BUNDLES.at.map(b => ({ ...b, network: 'at' })),
  ...BUNDLES.telecel.map(b => ({ ...b, network: 'telecel' })),
];

export const NET_NAMES: Record<string, string> = {
  mtn:     'MTN',
  at:      'AirtelTigo',
  telecel: 'Telecel',
};

export function getDefaultAdminPrice(cost: number): number {
  return parseFloat((cost + 0.10).toFixed(2));
}

export function getBundleByKey(key: string): Bundle | undefined {
  return ALL_BUNDLES.find(b => b.key === key);
}

/**
 * Maps internal bundle key → XpresPortal offerSlug + network URL segment.
 *
 * MTN:       mtn_master_beneficiary_portal  → /order/mtn
 * AT <30GB:  airteltigo_ishare_portal       → /order/at
 * AT 30GB+:  airteltigo_bigtime_portal      → /order/at
 * Telecel:   telecel_group_share_portal     → /order/telecel
 */
export function getXpresParams(bundle: Bundle & { network?: string }): {
  network: string;
  offerSlug: string;
  volumeGB: number;
} {
  const net = bundle.network || '';
  const volumeGB = Math.round(parseInt(bundle.volume || '0', 10) / 1000);

  if (net === 'mtn') {
    return { network: 'mtn', offerSlug: 'mtn_master_beneficiary_portal', volumeGB };
  }

  if (net === 'at') {
    const isBigTime = volumeGB >= 30;
    return {
      network: 'at',
      offerSlug: isBigTime ? 'airteltigo_bigtime_portal' : 'airteltigo_ishare_portal',
      volumeGB,
    };
  }

  if (net === 'telecel') {
    return { network: 'telecel', offerSlug: 'telecel_group_share_portal', volumeGB };
  }

  return { network: net, offerSlug: '', volumeGB };
}

/**
 * Maps internal bundle key → Hubnet network token + volume in MB.
 *
 * Hubnet's supported transaction network tokens are: mtn, at, big-time.
 * Telecel is NOT supported on Hubnet's transaction endpoint — callers must
 * route telecel orders to XpresPortal instead (see lib/settings.ts,
 * resolveProviderForOrder).
 *
 * ASSUMPTION (flagged for verification): mirrors the same >=30GB AirtelTigo
 * BigTime threshold already used for XpresPortal's offerSlug split, since
 * Hubnet's docs list "big-time (AirtelTigo)" as a separate network token
 * from "at" but don't specify their exact GB cutoff anywhere in the PDF.
 * If Hubnet's real threshold differs, change the `30` below.
 */
export function getHubnetParams(bundle: Bundle & { network?: string }): {
  network: 'mtn' | 'at' | 'big-time' | null; // null = unsupported (telecel)
  volumeMB: number;
} {
  const net = bundle.network || '';
  const volumeMB = parseInt(bundle.volume || '0', 10);
  const volumeGB = Math.round(volumeMB / 1000);

  if (net === 'mtn') return { network: 'mtn', volumeMB };

  if (net === 'at') {
    const isBigTime = volumeGB >= 30;
    return { network: isBigTime ? 'big-time' : 'at', volumeMB };
  }

  // telecel and anything else unsupported on Hubnet
  return { network: null, volumeMB };
}
