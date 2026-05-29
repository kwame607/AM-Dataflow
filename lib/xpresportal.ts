/**
 * XpresPortal API
 * Docs: https://www.xpresportal.app/api/v1
 *
 * Networks (URL segment): mtn | at | telecel
 * Offer slugs used:
 *   MTN:      mtn_master_beneficiary_portal
 *   AT <30GB: airteltigo_ishare_portal
 *   AT 30GB+: airteltigo_bigtime_portal
 *   Telecel:  telecel_group_share_portal
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

interface OrderParams {
  network: string;       // 'mtn' | 'at' | 'telecel'
  phone: string;         // e.g. '233241234567' (international format)
  volume: number;        // GB as integer e.g. 2
  offerSlug: string;     // e.g. 'mtn_master_beneficiary_portal'
  reference: string;     // your internal reference
  webhookUrl?: string;
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  reference?: string;
  message?: string;
  raw?: unknown;
}

export async function xpresOrder(params: OrderParams): Promise<OrderResult> {
  const { network, phone, volume, offerSlug, reference, webhookUrl } = params;

  if (!process.env.XPRESPORTAL_API_KEY) {
    console.error('[xpresportal] XPRESPORTAL_API_KEY missing');
    return { success: false, message: 'API key not configured' };
  }

  // Ensure phone is in international format (233XXXXXXXXX)
  const intlPhone = phone.startsWith('233')
    ? phone
    : phone.startsWith('0')
    ? '233' + phone.slice(1)
    : phone;

  const body: Record<string, unknown> = {
    type: 'single',
    volume,
    phone: intlPhone,
    offerSlug,
    // Include your internal reference in webhookUrl params so you can match it
    webhookUrl: webhookUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/api/xpresportal/webhook`,
  };

  // Store our internal reference in the webhook URL as a query param
  // since XpresPortal uses their own orderId/reference
  if (webhookUrl) {
    body.webhookUrl = `${webhookUrl}?internalRef=${encodeURIComponent(reference)}`;
  }

  const endpoint = `${XPRES_BASE}/order/${network}`;
  console.log(`[xpresportal] POST ${endpoint}`, JSON.stringify({ ...body, phone: intlPhone }));

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[xpresportal] HTTP ${res.status} response:`, text);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* non-JSON */ }

    const success = data?.success === true;

    return {
      success,
      orderId: String(data?.orderId ?? ''),
      reference: String(data?.reference ?? ''),
      message: success ? 'Order submitted' : String(data?.error ?? 'Unknown error'),
      raw: data,
    };
  } catch (e) {
    console.error('[xpresportal] order error', e);
    return { success: false, message: `Network error: ${(e as Error).message}` };
  }
}

/**
 * Check the status of a single order by XpresPortal orderId or reference.
 */
export async function xpresOrderStatus(identifier: string): Promise<{
  status: string;
  found: boolean;
} | null> {
  try {
    const res = await fetch(`${XPRES_BASE}/order/status/${encodeURIComponent(identifier)}`, {
      method: 'GET',
      headers: getHeaders(),
      cache: 'no-store',
    });
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
