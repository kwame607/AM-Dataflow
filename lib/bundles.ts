import type { Bundle } from '@/types';

export const BUNDLES: Record<string, Bundle[]> = {
  mtn: [
    { key: 'mtn_1gb',   size: '1GB',   volume: '1000',   cost: 4.30,  validity: '90 days' },
    { key: 'mtn_2gb',   size: '2GB',   volume: '2000',   cost: 8.10,  validity: '90 days' },
    { key: 'mtn_3gb',   size: '3GB',   volume: '3000',   cost: 12.10, validity: '90 days' },
    { key: 'mtn_4gb',   size: '4GB',   volume: '4000',   cost: 16.10, validity: '90 days' },
    { key: 'mtn_5gb',   size: '5GB',   volume: '5000',   cost: 20.10, validity: '90 days' },
    { key: 'mtn_6gb',   size: '6GB',   volume: '6000',   cost: 24.10, validity: '90 days' },
    { key: 'mtn_8gb',   size: '8GB',   volume: '8000',   cost: 32.20, validity: '90 days' },
    { key: 'mtn_10gb',  size: '10GB',  volume: '10000',  cost: 39.00, validity: '90 days' },
    { key: 'mtn_15gb',  size: '15GB',  volume: '15000',  cost: 57.20, validity: '90 days' },
    { key: 'mtn_20gb',  size: '20GB',  volume: '20000',  cost: 80.80, validity: '90 days' },
    { key: 'mtn_25gb',  size: '25GB',  volume: '25000',  cost: 96.20, validity: '90 days' },
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
    { key: 'at_30gb',  size: '30GB',  volume: '30000',  cost: 111.30,validity: '90 days' },
    { key: 'at_40gb',  size: '40GB',  volume: '40000',  cost: 150.00,validity: '90 days' },
    { key: 'at_50gb',  size: '50GB',  volume: '50000',  cost: 185.20,validity: '90 days' },
    { key: 'at_100gb', size: '100GB', volume: '100000', cost: 370.20,validity: '90 days' },
  ],
};

export const ALL_BUNDLES: Bundle[] = [
  ...BUNDLES.mtn.map(b => ({ ...b, network: 'mtn' })),
  ...BUNDLES.at.map(b => ({ ...b, network: 'at' })),
];

export const NET_NAMES: Record<string, string> = {
  mtn: 'MTN',
  at: 'AirtelTigo',
};

export function getDefaultAdminPrice(cost: number): number {
  return parseFloat((cost + 0.10).toFixed(2));
}

export function getBundleByKey(key: string): Bundle | undefined {
  return ALL_BUNDLES.find(b => b.key === key);
}

export function getHubnetNetwork(bundle: Bundle): string {
  if (bundle.network === 'at' && parseInt(bundle.volume) >= 30000) return 'big-time';
  return bundle.network || 'mtn';
}
