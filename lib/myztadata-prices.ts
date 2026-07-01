/**
 * lib/myztadata-prices.ts
 * MyZtaData actual provider costs — used to store accurate hubnet_cost
 * on orders when MyZtaData is the active provider.
 *
 * Keys match your internal bundle keys from lib/bundles.ts.
 * Prices come from /fetch-data-packages console_price field.
 * AT is not available on MyZtaData so no AT entries here.
 */

export const MYZTADATA_COSTS: Record<string, number> = {
  // MTN — from live API response
  mtn_1gb:   4.00,
  mtn_2gb:   8.00,
  mtn_3gb:   12.00,
  mtn_4gb:   16.00,
  mtn_5gb:   20.00,
  mtn_6gb:   24.00,
  mtn_7gb:   29.00,
  mtn_8gb:   32.00,
  mtn_10gb:  39.50,
  mtn_12gb:  49.00,
  mtn_15gb:  58.00,
  mtn_20gb:  77.50,
  mtn_25gb:  97.00,
  mtn_30gb:  117.00,
  mtn_40gb:  156.00,
  mtn_50gb:  195.00,
  mtn_100gb: 390.00,

  // TELECEL — from live API response
  tel_10gb:  38.00,
  tel_15gb:  58.00,  // note: same as MTN 15GB price in their system
  tel_20gb:  77.00,
  tel_25gb:  95.00,
  tel_30gb:  115.00,
  tel_40gb:  145.00,
  tel_50gb:  190.00,
  tel_100gb: 357.00,
};

/**
 * Returns the actual cost for a given bundle when MyZtaData is the provider.
 * Falls back to the default bundle cost if not found (e.g. AT bundles which
 * MyZtaData doesn't support — those fall back to XpresPortal anyway).
 */
export function getMyZtaCost(bundleKey: string, defaultCost: number): number {
  return MYZTADATA_COSTS[bundleKey] ?? defaultCost;
}
