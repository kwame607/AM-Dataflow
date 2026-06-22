/**
 * Hubnet API — lib/hubnet.ts
 *
 * Mirrors the shape of lib/xpresportal.ts so order-placement code can treat
 * both providers interchangeably. See docs: console.hubnet.app
 *
 * Auth: Bearer token in a header literally named "token" (not "Authorization").
 * Rate limit: 5 requests/minute per endpoint — keep this in mind for any
 * future bulk/cron usage.
 */

const HUBNET_BASE = 'https://console.hubnet.app/live/api/context/business';

function getHeaders() {
  const key = process.env.HUBNET_API_KEY;
  if (!key) console.error('[hubnet] ⚠️ HUBNET_API_KEY is not set!');
  return {
    token: `Bearer ${key || ''}`,
    'Content-Type': 'application/json',
  };
}

// Hubnet only accepts these network tokens on the transaction endpoint.
// Telecel is NOT included — confirmed unsupported for actual transactions
// even though it's listed in their network reference table.
export type HubnetNetwork = 'mtn' | 'at' | 'big-time';

export function isHubnetSupportedNetwork(network: string): network is HubnetNetwork {
  return network === 'mtn' || network === 'at' || network === 'big-time';
}

// ── Balance ───────────────────────────────────────────────────
export async function hubnetCheckBalance(): Promise<{ balance: number } | null> {
  try {
    const res = await fetch(`${HUBNET_BASE}/transaction/check_balance`, {
      method: 'GET',
      headers: getHeaders(),
      cache: 'no-store',
    });
    const data = await res.json();
    console.log('[hubnet balance]', JSON.stringify(data));

    if (data?.status && data?.balance !== undefined) {
      return { balance: parseFloat(data.balance) };
    }
    return null;
  } catch (e) {
    console.error('[hubnet balance error]', e);
    return null;
  }
}

// ── Order ─────────────────────────────────────────────────────
interface HubnetOrderParams {
  network:    HubnetNetwork;
  phone:      string;   // national format e.g. '0241234567' — 10 digits
  volumeMB:   number;   // volume IN MEGABYTES (not GB) — Hubnet's unit
  reference:  string;   // YOUR internal reference (6-25 chars)
  referrer?:  string;   // optional buyer phone for SMS confirmation
  webhookUrl?: string;  // optional override
}

interface HubnetOrderResult {
  success:    boolean;
  orderId?:   string;   // maps to transaction_id
  reference?: string;
  message?:   string;
  raw?:       unknown;
}

export async function hubnetOrder(params: HubnetOrderParams): Promise<HubnetOrderResult> {
  const { network, phone, volumeMB, reference, referrer, webhookUrl } = params;

  if (!process.env.HUBNET_API_KEY) {
    console.error('[hubnet] HUBNET_API_KEY missing');
    return { success: false, message: 'API key not configured' };
  }

  // Hubnet wants national format (0XXXXXXXXX), not international —
  // opposite convention from XpresPortal. Normalize defensively.
  const nationalPhone = phone.startsWith('233')
    ? '0' + phone.slice(3)
    : phone;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const finalWebhookUrl = webhookUrl || (siteUrl ? `${siteUrl}/api/hubnet/webhook` : undefined);

  const body: Record<string, string> = {
    phone:     nationalPhone,
    volume:    String(Math.round(volumeMB)),
    reference,
  };
  if (referrer) body.referrer = referrer;
  if (finalWebhookUrl) body.webhook = finalWebhookUrl;

  const endpoint = `${HUBNET_BASE}/transaction/${network}-new-transaction`;
  console.log(`[hubnet] POST ${endpoint}`, JSON.stringify(body));

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: getHeaders(),
      body:    JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[hubnet] HTTP ${res.status} response:`, text);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }

    // Per docs: status:true AND message:"0000" together mean accepted.
    // status:true alone only means "API call succeeded", not delivery.
    const success = data?.status === true && data?.message === '0000';

    return {
      success,
      orderId:   String(data?.transaction_id ?? ''),
      reference: String(data?.reference ?? reference),
      message:   success
        ? 'Order submitted'
        : String((data?.data as { message?: string })?.message ?? data?.reason ?? 'Unknown error'),
      raw: data,
    };
  } catch (e) {
    console.error('[hubnet] order error', e);
    return { success: false, message: `Network error: ${(e as Error).message}` };
  }
}

// ── Transaction Status Check ────────────────────────────────────
// Universal GET endpoint — no network prefix needed, just the reference.
export async function hubnetOrderStatus(reference: string): Promise<{
  status: string;
  found:  boolean;
} | null> {
  try {
    const url = `${HUBNET_BASE}/transaction/check-transaction-status?reference=${encodeURIComponent(reference)}`;
    const res = await fetch(url, { method: 'GET', headers: getHeaders(), cache: 'no-store' });
    const data = await res.json();
    console.log('[hubnet status]', JSON.stringify(data));

    if (data?.status === true && data?.data?.status) {
      return { status: String(data.data.status).toLowerCase(), found: true };
    }
    return { status: 'unknown', found: false };
  } catch (e) {
    console.error('[hubnet] status check error', e);
    return null;
  }
}

/** Maps Hubnet's various status strings to our internal delivery_status. */
export function mapHubnetStatus(raw: string): 'delivered' | 'processing' | 'failed' {
  const s = raw.toLowerCase();
  if (['delivered', 'success', 'successful', 'completed'].includes(s)) return 'delivered';
  if (['failed', 'cancelled', 'canceled'].includes(s)) return 'failed';
  return 'processing'; // pending / processing / anything unrecognized
}
