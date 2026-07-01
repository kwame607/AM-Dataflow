/**
 * lib/myztadata.ts
 * MyZtaData Console API — Provider 3
 *
 * Key differences from XpresPortal/Hubnet:
 *  - Auth: x-api-key header (not Bearer)
 *  - Purchase: needs their package `id` + shared_bundle (volume * 1000 MB)
 *  - No webhook push — status must be polled via /fetch-other-network-transaction
 *  - Networks: MTN (id=3), TELECEL (id=2). AT not available.
 */

const BASE = 'https://myztadata.com/api/v1';

// Internal network slug → MyZtaData network_id
const NETWORK_ID_MAP: Record<string, number> = {
  mtn:     3,
  telecel: 2,
};

function getHeaders() {
  const key = process.env.MYZTADATA_API_KEY;
  if (!key) console.error('[myztadata] ⚠️  MYZTADATA_API_KEY is not set!');
  return {
    'x-api-key':    key || '',
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  };
}

// ── Types ─────────────────────────────────────────────────────

export interface MyZtaPackage {
  id:            number;
  network_id:    number;
  volume:        number;   // GB integer, e.g. 5
  volumeGB:      string;   // "5GB"
  console_price: string;   // string in API response, e.g. "20"
  status:        string;   // "In Stock" | "Out of Stock"
  network:       string;   // "MTN" | "TELECEL"
}

export interface MyZtaPurchaseResult {
  success:          boolean;
  transaction_code: string | null;
  message:          string;
  raw?:             unknown;
}

export interface MyZtaTransactionStatus {
  found:    boolean;
  status:   'Delivered' | 'Pending' | 'Failed' | 'Unknown';
  raw?:     unknown;
}

// ── Fetch packages ────────────────────────────────────────────

export async function myZtaFetchPackages(): Promise<MyZtaPackage[]> {
  try {
    const res  = await fetch(`${BASE}/fetch-data-packages`, {
      method:  'GET',
      headers: getHeaders(),
      cache:   'no-store',
    });
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.error('[myztadata] fetchPackages unexpected response:', data);
      return [];
    }
    return data as MyZtaPackage[];
  } catch (e) {
    console.error('[myztadata] fetchPackages error:', e);
    return [];
  }
}

// ── Find the right package for our internal bundle ────────────
// Matches by network + volume (GB) from the live package list.
// Returns null if not found or Out of Stock.

export async function myZtaFindPackage(
  network: string,   // internal slug: 'mtn' | 'telecel'
  volumeGB: number,  // integer GB, e.g. 5
  allowOutOfStock = false,
): Promise<MyZtaPackage | null> {
  const networkId = NETWORK_ID_MAP[network.toLowerCase()];
  if (!networkId) {
    console.warn(`[myztadata] Network '${network}' not supported by MyZtaData (only MTN, TELECEL)`);
    return null;
  }

  const packages = await myZtaFetchPackages();
  const match = packages.find(p =>
    p.network_id === networkId &&
    p.volume     === volumeGB &&
    (allowOutOfStock || p.status === 'In Stock')
  );

  if (!match) {
    console.warn(`[myztadata] No ${allowOutOfStock ? '' : 'in-stock '}package for ${network} ${volumeGB}GB`);
  }

  return match || null;
}

// ── Purchase ──────────────────────────────────────────────────

export async function myZtaOrder(params: {
  network:    string;   // internal slug: 'mtn' | 'telecel'
  phone:      string;   // e.g. '0240000000' or '233240000000'
  volumeGB:   number;   // integer GB
  reference:  string;   // your internal order reference
}): Promise<MyZtaPurchaseResult> {
  const { network, phone, volumeGB, reference } = params;

  if (!process.env.MYZTADATA_API_KEY) {
    return { success: false, transaction_code: null, message: 'MYZTADATA_API_KEY not set' };
  }

  // Find the package — fail fast if not in stock or not found
  const pkg = await myZtaFindPackage(network, volumeGB);
  if (!pkg) {
    return {
      success:          false,
      transaction_code: null,
      message:          `No in-stock MyZtaData package for ${network.toUpperCase()} ${volumeGB}GB`,
    };
  }

  // Phone: MyZtaData accepts local format (0XXXXXXXXX)
  const localPhone = phone.startsWith('233')
    ? '0' + phone.slice(3)
    : phone;

  // shared_bundle = volume (GB) * 1000 → MB
  const sharedBundle = volumeGB * 1000;

  const body = {
    recipient_msisdn: localPhone,
    network_id:       pkg.network_id,
    shared_bundle:    sharedBundle,
    external_api_ref: reference,
  };

  console.log(`[myztadata] POST /buy-other-package`, JSON.stringify({
    ...body,
    package_id: pkg.id,
  }));

  try {
    const res  = await fetch(`${BASE}/buy-other-package`, {
      method:  'POST',
      headers: getHeaders(),
      body:    JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[myztadata] HTTP ${res.status}:`, text);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* non-JSON */ }

    if (res.status === 422) {
      return { success: false, transaction_code: null, message: String(data?.message || 'Validation error'), raw: data };
    }

    if (!res.ok) {
      const errMsg = String(data?.error || data?.message || `HTTP ${res.status}`);
      return { success: false, transaction_code: null, message: errMsg, raw: data };
    }

    const success = data?.success === true;
    const txCode  = String(data?.transaction_code || '');

    return {
      success,
      transaction_code: txCode || null,
      message:          String(data?.message || (success ? 'OK' : 'Unknown error')),
      raw:              data,
    };
  } catch (e) {
    console.error('[myztadata] order error:', e);
    return { success: false, transaction_code: null, message: `Network error: ${(e as Error).message}` };
  }
}

// ── Poll transaction status ───────────────────────────────────
// Call this from your cron or admin retry flow since MyZtaData
// has no webhook push.

export async function myZtaCheckTransaction(
  transactionCode: string,
): Promise<MyZtaTransactionStatus> {
  try {
    const res  = await fetch(`${BASE}/fetch-other-network-transaction`, {
      method:  'POST',
      headers: getHeaders(),
      body:    JSON.stringify({ transaction_id: transactionCode }),
    });

    const data = await res.json();
    console.log('[myztadata] checkTransaction:', JSON.stringify(data));

    if (!res.ok || !data) {
      return { found: false, status: 'Unknown', raw: data };
    }

    const items:  Array<{ status: string }> = data?.order_items || [];
    const rawStatus = (items[0]?.status || '').toLowerCase();

    let status: MyZtaTransactionStatus['status'] = 'Pending';
    if (rawStatus === 'delivered')              status = 'Delivered';
    else if (rawStatus === 'failed' || rawStatus === 'cancelled') status = 'Failed';
    else                                        status = 'Pending';

    return { found: true, status, raw: data };
  } catch (e) {
    console.error('[myztadata] checkTransaction error:', e);
    return { found: false, status: 'Unknown' };
  }
}

// ── Console wallet balance ────────────────────────────────────

export async function myZtaCheckBalance(): Promise<{ balance: number } | null> {
  try {
    const res  = await fetch(`${BASE}/fetch-networks`, {
      method:  'GET',
      headers: getHeaders(),
      cache:   'no-store',
    });
    // MyZtaData doesn't have a dedicated balance endpoint yet;
    // a 200 on fetch-networks confirms the key is valid and active.
    // Balance must be checked in their Console dashboard directly.
    if (res.ok) return { balance: -1 }; // -1 = unknown but key is valid
    return null;
  } catch {
    return null;
  }
}
