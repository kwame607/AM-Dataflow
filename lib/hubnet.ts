/**
 * Hubnet API — lib/hubnet.ts
 *
 * Auth: Bearer token in a header literally named "token" (not "Authorization").
 * Rate limit: 5 requests/minute per endpoint.
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
  network:     HubnetNetwork;
  phone:       string;
  volumeMB:    number;
  reference:   string;
  referrer?:   string;
  webhookUrl?: string;
}

interface HubnetOrderResult {
  success:    boolean;
  orderId?:   string;
  reference?: string;
  message?:   string;
  raw?:       unknown;
}

/**
 * Determines whether a Hubnet API response represents a successfully accepted
 * order. Hubnet's live responses don't always match their docs exactly, so
 * this checks multiple signals rather than requiring all of them to match.
 *
 * An order is considered accepted if ANY of these are true:
 *   - status:true AND message:"0000" (documented happy path)
 *   - status:true AND data.code:"0000" (nested variant seen in practice)
 *   - status:true AND data.status:true (alternate nesting)
 *   - status:true AND transaction_id is present and non-empty
 *     (Hubnet only returns transaction_id on real acceptances)
 *
 * Explicit rejections (status:false, or error codes like 1004/1005/1007)
 * are always treated as failures regardless.
 */
function isHubnetSuccess(data: Record<string, unknown>): boolean {
  // Explicit failure — never override this
  if (data?.status === false) return false;

  // Explicit error codes — definitely a failure
  const topCode = String(data?.code ?? '');
  if (['1004', '1005', '1007'].includes(topCode)) return false;

  // FIX: Hubnet doesn't always send status as a boolean — live responses have
  // been observed with status as the string "success"/"successful"/"completed".
  // The old check `data?.status === true` is strict-equality across types, so
  // it silently evaluated to false for these responses and caused genuinely
  // successful orders to be marked as failed.
  const statusRaw = data?.status;
  const statusStr = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : '';

  // Explicit string failure signals
  if (['failed', 'false', 'error', 'rejected'].includes(statusStr)) return false;

  const statusOk = statusRaw === true || ['success', 'successful', 'completed', 'ok'].includes(statusStr);

  // If status indicates success (boolean true OR a recognized success string), check additional signals
  if (statusOk) {
    // Classic documented path
    if (data?.message === '0000') return true;

    // transaction_id present = Hubnet internally accepted the order
    const txId = String(data?.transaction_id ?? '').trim();
    if (txId && txId !== 'undefined' && txId !== '') return true;

    // Nested data object signals
    const nested = data?.data as Record<string, unknown> | undefined;
    if (nested?.code === '0000') return true;
    if (nested?.status === true) return true;
    const nestedStatusStr = typeof nested?.status === 'string' ? nested.status.toLowerCase() : '';
    if (['success', 'successful', 'completed', 'ok'].includes(nestedStatusStr)) return true;

    // reason field says successful
    const reason = String(data?.reason ?? '').toLowerCase();
    if (reason.includes('success')) return true;
  }

  return false;
}

export async function hubnetOrder(params: HubnetOrderParams): Promise<HubnetOrderResult> {
  const { network, phone, volumeMB, reference, referrer, webhookUrl } = params;

  if (!process.env.HUBNET_API_KEY) {
    console.error('[hubnet] HUBNET_API_KEY missing');
    return { success: false, message: 'API key not configured' };
  }

  // Hubnet wants national format (0XXXXXXXXX), not international
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

    // Log the FULL raw response so you can see exactly what Hubnet returns
    // in your Vercel logs — critical for debugging success detection issues
    console.log(`[hubnet] HTTP ${res.status} raw response: ${text}`);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }

    const success = isHubnetSuccess(data);

    console.log(`[hubnet] isHubnetSuccess=${success} status=${data?.status} message=${data?.message} transaction_id=${data?.transaction_id}`);

    // Build a useful error message for failed orders
    let message = 'Order submitted';
    if (!success) {
      const nested = data?.data as Record<string, unknown> | undefined;
      message = String(
        nested?.message ??
        data?.reason ??
        data?.message ??
        'Unknown error'
      );
    }

    return {
      success,
      orderId:   String(data?.transaction_id ?? '').trim() || undefined,
      reference: String(data?.reference ?? reference),
      message,
      raw: data,
    };
  } catch (e) {
    console.error('[hubnet] order error', e);
    return { success: false, message: `Network error: ${(e as Error).message}` };
  }
}

// ── Transaction Status Check ──────────────────────────────────
// Use this to poll status for orders that Hubnet accepted but our
// webhook hasn't confirmed yet, or for orders marked failed that
// may have actually been processed.
export async function hubnetOrderStatus(reference: string): Promise<{
  status: string;
  found:  boolean;
} | null> {
  try {
    const url = `${HUBNET_BASE}/transaction/check-transaction-status?reference=${encodeURIComponent(reference)}`;
    const res = await fetch(url, { method: 'GET', headers: getHeaders(), cache: 'no-store' });
    const data = await res.json();
    console.log('[hubnet status check]', JSON.stringify(data));

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
  return 'processing';
}
