/**
 * XpresPortal API — lib/xpresportal.ts
 * Replace your existing file with this.
 *
 * Key fix: webhookUrl now ALWAYS includes ?internalRef= so your
 * /api/xpresportal/webhook route can match the order by your
 * internal reference, not XpresPortal's orderId.
 */

const XPRES_BASE = 'https://www.xpresportal.app/api/v1';

function getHeaders() {
  const key = process.env.XPRESPORTAL_API_KEY;
  if (!key) console.error('[xpresportal] ⚠️ XPRESPORTAL_API_KEY is not set!');
  return {
    'x-api-key': key || '',
    'Content-Type': 'application/json',
  };
}

// ── Balance ───────────────────────────────────────────────────
export async function xpresCheckBalance(): Promise<{ balance: number } | null> {
  try {
    const res = await fetch(`${XPRES_BASE}/balance`, {
      method: 'GET',
      headers: getHeaders(),
      cache: 'no-store',
    });
    const data = await res.json();
    console.log('[xpresportal balance]', JSON.stringify(data));

    if (data?.success && data?.balance !== undefined) {
      return { balance: parseFloat(data.balance) };
    }
    return null;
  } catch (e) {
    console.error('[xpresportal balance error]', e);
    return null;
  }
}

// ── Order ─────────────────────────────────────────────────────
interface OrderParams {
  network:    string;   // 'mtn' | 'at' | 'telecel'
  phone:      string;   // international format e.g. '233241234567'
  volume:     number;   // GB as integer e.g. 2
  offerSlug:  string;   // e.g. 'mtn_master_beneficiary_portal'
  reference:  string;   // YOUR internal reference (DF-XXXX)
  webhookUrl?: string;  // optional override; if omitted, built from NEXT_PUBLIC_SITE_URL
}

interface OrderResult {
  success:    boolean;
  orderId?:   string;
  reference?: string;
  message?:   string;
  raw?:       unknown;
}

export async function xpresOrder(params: OrderParams): Promise<OrderResult> {
  const { network, phone, volume, offerSlug, reference, webhookUrl } = params;

  if (!process.env.XPRESPORTAL_API_KEY) {
    console.error('[xpresportal] XPRESPORTAL_API_KEY missing');
    return { success: false, message: 'API key not configured' };
  }

  // ── Phone: ensure international format 233XXXXXXXXX ─────────
  const intlPhone = phone.startsWith('233')
    ? phone
    : phone.startsWith('0')
    ? '233' + phone.slice(1)
    : phone;

  // ── Webhook URL: ALWAYS include ?internalRef= ────────────────
  // This is the fix — previously internalRef was only added when
  // webhookUrl was explicitly passed, leaving it missing in normal flow.

	const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
// Strip any existing internalRef from the base URL before appending
	const rawBase = webhookUrl || `${siteUrl}/api/xpresportal/webhook`;
	const cleanBase = rawBase.split('?')[0]; // remove any existing query params
	const finalWebhookUrl = `${cleanBase}?internalRef=${encodeURIComponent(reference)}`;

  const body = {
    type:       'single',
    volume,
    phone:      intlPhone,
    offerSlug,
    webhookUrl: finalWebhookUrl,
  };

  const endpoint = `${XPRES_BASE}/order/${network}`;
  console.log(`[xpresportal] POST ${endpoint}`, JSON.stringify({
    ...body,
    phone: intlPhone,
    webhookUrl: finalWebhookUrl,
  }));

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: getHeaders(),
      body:    JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[xpresportal] HTTP ${res.status} response:`, text);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }

    const success = data?.success === true;

    return {
      success,
      orderId:   String(data?.orderId   ?? ''),
      reference: String(data?.reference ?? ''),
      message:   success ? 'Order submitted' : String(data?.error ?? 'Unknown error'),
      raw:       data,
    };
  } catch (e) {
    console.error('[xpresportal] order error', e);
    return { success: false, message: `Network error: ${(e as Error).message}` };
  }
}

// ── Order Status Check (single) ───────────────────────────────
// Use this to manually poll status if webhook hasn't fired
export async function xpresOrderStatus(identifier: string): Promise<{
  status: string;
  found:  boolean;
} | null> {
  try {
    const res = await fetch(
      `${XPRES_BASE}/order/status/${encodeURIComponent(identifier)}`,
      { method: 'GET', headers: getHeaders(), cache: 'no-store' }
    );
    const data = await res.json();
    if (data?.success && data?.order) {
      return { status: data.order.status, found: true };
    }
    return { status: 'unknown', found: false };
  } catch (e) {
    console.error('[xpresportal] status check error', e);
    return null;
  }
}

// ── Bulk Order Status Check ───────────────────────────────────
// Pass up to 100 XpresPortal orderIds or references at once
export async function xpresOrderStatusBulk(identifiers: string[]): Promise<{
  found:    boolean;
  orderId:  string;
  reference: string;
  status:   string;
  recipient: string;
  volume:   number;
  timestamp: string;
}[]> {
  try {
    const res = await fetch(`${XPRES_BASE}/order/status/bulk`, {
      method:  'POST',
      headers: getHeaders(),
      body:    JSON.stringify({ identifiers }),
    });
    const data = await res.json();
    if (!data?.success) return [];
    return (data.orders || []).filter((o: { found: boolean }) => o.found);
  } catch (e) {
    console.error('[xpresportal] bulk status error', e);
    return [];
  }
}
