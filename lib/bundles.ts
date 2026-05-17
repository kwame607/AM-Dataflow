import type { Bundle } from '@/types';

export const BUNDLES: Record<string, Bundle[]> = {
  mtn: [
    { key: 'mtn_1gb',   size: '1GB',   volume: '1000',   cost: 4.60,  validity: '90 days' },
    { key: 'mtn_2gb',   size: '2GB',   volume: '2000',   cost: 8.80,  validity: '90 days' },
    { key: 'mtn_3gb',   size: '3GB',   volume: '3000',   cost: 12.80, validity: '90 days' },
    { key: 'mtn_4gb',   size: '4GB',   volume: '4000',   cost: 16.80, validity: '90 days' },
    { key: 'mtn_5gb',   size: '5GB',   volume: '5000',   cost: 21.60, validity: '90 days' },
    { key: 'mtn_6gb',   size: '6GB',   volume: '6000',   cost: 26.00, validity: '90 days' },
    { key: 'mtn_8gb',   size: '8GB',   volume: '8000',   cost: 35.80, validity: '90 days' },
    { key: 'mtn_10gb',  size: '10GB',  volume: '10000',  cost: 41.50, validity: '90 days' },
    { key: 'mtn_15gb',  size: '15GB',  volume: '15000',  cost: 60.80, validity: '90 days' },
    { key: 'mtn_20gb',  size: '20GB',  volume: '20000',  cost: 80.80, validity: '90 days' },
    { key: 'mtn_25gb',  size: '25GB',  volume: '25000',  cost: 103.80,validity: '90 days' },
    { key: 'mtn_30gb',  size: '30GB',  volume: '30000',  cost: 121.00,validity: '90 days' },
    { key: 'mtn_40gb',  size: '40GB',  volume: '40000',  cost: 163.00,validity: '90 days' },
    { key: 'mtn_50gb',  size: '50GB',  volume: '50000',  cost: 198.00,validity: '90 days' },
    { key: 'mtn_100gb', size: '100GB', volume: '100000', cost: 397.00,validity: '90 days' },
  ],
  at: [
    { key: 'at_1gb',   size: '1GB',   volume: '1000',   cost: 4.20,  validity: '90 days' },
    { key: 'at_2gb',   size: '2GB',   volume: '2000',   cost: 8.00,  validity: '90 days' },
    { key: 'at_3gb',   size: '3GB',   volume: '3000',   cost: 12.00, validity: '90 days' },
    { key: 'at_4gb',   size: '4GB',   volume: '4000',   cost: 15.50, validity: '90 days' },
    { key: 'at_5gb',   size: '5GB',   volume: '5000',   cost: 18.50, validity: '90 days' },
    { key: 'at_6gb',   size: '6GB',   volume: '6000',   cost: 23.00, validity: '90 days' },
    { key: 'at_7gb',   size: '7GB',   volume: '7000',   cost: 27.00, validity: '90 days' },
    { key: 'at_8gb',   size: '8GB',   volume: '8000',   cost: 31.00, validity: '90 days' },
    { key: 'at_9gb',   size: '9GB',   volume: '9000',   cost: 34.00, validity: '90 days' },
    { key: 'at_10gb',  size: '10GB',  volume: '10000',  cost: 38.00, validity: '90 days' },
    { key: 'at_12gb',  size: '12GB',  volume: '12000',  cost: 46.00, validity: '90 days' },
    { key: 'at_15gb',  size: '15GB',  volume: '15000',  cost: 57.00, validity: '90 days' },
    { key: 'at_20gb',  size: '20GB',  volume: '20000',  cost: 76.00, validity: '90 days' },
    { key: 'at_25gb',  size: '25GB',  volume: '25000',  cost: 95.00, validity: '90 days' },
    { key: 'at_30gb',  size: '30GB',  volume: '30000',  cost: 113.00,validity: '90 days' },
    { key: 'at_40gb',  size: '40GB',  volume: '40000',  cost: 150.00,validity: '90 days' },
    { key: 'at_50gb',  size: '50GB',  volume: '50000',  cost: 188.00,validity: '90 days' },
    { key: 'at_100gb', size: '100GB', volume: '100000', cost: 375.00,validity: '90 days' },
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
