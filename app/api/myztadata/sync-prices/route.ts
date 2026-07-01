// app/api/myztadata/sync-prices/route.ts
// Fetches live prices from MyZtaData and compares against stored values.
// Admin can see mismatches and update myztadata-prices.ts accordingly.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { myZtaFetchPackages } from '@/lib/myztadata';
import { MYZTADATA_COSTS } from '@/lib/myztadata-prices';
import { BUNDLES } from '@/lib/bundles';

// Maps MyZtaData network name → internal slug
const NETWORK_SLUG: Record<string, string> = {
  MTN:     'mtn',
  TELECEL: 'telecel',
};

// Maps volumeGB → internal bundle key per network
function findBundleKey(network: string, volumeGB: number): string | null {
  const slug    = NETWORK_SLUG[network.toUpperCase()];
  if (!slug) return null;
  const bundles = BUNDLES[slug] || [];
  const prefix  = slug === 'telecel' ? 'tel' : slug;
  const match   = bundles.find(b => Math.round(parseInt(b.volume, 10) / 1000) === volumeGB);
  return match?.key || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const packages = await myZtaFetchPackages();
  if (!packages.length) {
    return NextResponse.json({ error: 'Could not fetch MyZtaData packages — check API key' }, { status: 500 });
  }

  const mismatches: Array<{
    bundleKey:   string;
    network:     string;
    volumeGB:    number;
    storedCost:  number;
    liveCost:    number;
    difference:  number;
  }> = [];

  const matched: Array<{
    bundleKey:  string;
    network:    string;
    volumeGB:   number;
    cost:       number;
    status:     string;
  }> = [];

  const unmapped: Array<{
    network:  string;
    volumeGB: number;
    cost:     number;
    status:   string;
  }> = [];

  for (const pkg of packages) {
    const volumeGB  = pkg.volume;
    const liveCost  = parseFloat(String(pkg.console_price));
    const bundleKey = findBundleKey(pkg.network, volumeGB);

    if (!bundleKey) {
      unmapped.push({ network: pkg.network, volumeGB, cost: liveCost, status: pkg.status });
      continue;
    }

    const storedCost = MYZTADATA_COSTS[bundleKey];

    if (storedCost === undefined || Math.abs(storedCost - liveCost) > 0.01) {
      mismatches.push({
        bundleKey,
        network:    pkg.network,
        volumeGB,
        storedCost: storedCost ?? 0,
        liveCost,
        difference: parseFloat((liveCost - (storedCost ?? 0)).toFixed(2)),
      });
    } else {
      matched.push({ bundleKey, network: pkg.network, volumeGB, cost: liveCost, status: pkg.status });
    }
  }

  return NextResponse.json({
    checkedAt:       new Date().toISOString(),
    totalPackages:   packages.length,
    matched:         matched.length,
    mismatches:      mismatches.length,
    mismatchDetails: mismatches,
    unmapped,
    allGood:         mismatches.length === 0,
  });
}
