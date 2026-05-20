/**
 * Hubnet Direct API
 * Docs: https://hubnet-web.onrender.com/api-documentation
 *
 * Networks: mtn | at | big-time
 */

const HUBNET_BASE = 'https://console.hubnet.app/live/api/context/business/transaction';

function getHeaders() {
  const key = process.env.HUBNET_API_KEY;
  if (!key) console.error('[hubnet] ⚠️ HUBNET_API_KEY is not set!');
  return {
    'token': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export async function hubnetCheckBalance(): Promise<{ balance: number } | null> {
  try {
    const res = await fetch(`${HUBNET_BASE}/check_balance`, {
      method: 'GET',
      headers: getHeaders(),
      cache: 'no-store',
    });
    const data = await res.json();
    console.log('[hubnet balance]', JSON.stringify(data));

    // Actual response: { data: { wallet_balance: 238 } }
    const balance = data?.data?.wallet_balance ?? data?.balance;
    if (balance !== undefined) return { balance: parseFloat(balance) };
    return null;
  } catch (e) {
    console.error('[hubnet balance error]', e);
    return null;
  }
}

interface TransactParams {
  network: string;
  phone: string;
  volume: string;
  reference: string;
  webhook?: string;
}

interface TransactResult {
  success: boolean;
  code?: string;
  message?: string;
  transactionId?: string;
  raw?: unknown;
}

export async function hubnetTransact(params: TransactParams): Promise<TransactResult> {
  const { network, phone, volume, reference, webhook } = params;

  if (!process.env.HUBNET_API_KEY) {
    console.error('[hubnet] HUBNET_API_KEY missing');
    return { success: false, message: 'API key not configured' };
  }

  const body: Record<string, string> = { phone, volume, reference };
  if (webhook) body.webhook = webhook;

  const endpoint = `${HUBNET_BASE}/${network}-new-transaction`;
  console.log(`[hubnet] POST ${endpoint}`, JSON.stringify(body));

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[hubnet] HTTP ${res.status} response:`, text);

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* non-JSON */ }

    // Success: status true + message "0000"
    const success =
  	data?.status === true ||
  	data?.message === '0000' ||
  	String(data?.message).toLowerCase() === 'transaction submitted' ||
  	(data?.data as Record<string,unknown>)?.code === '0000';

    return {
      success,
      code: String(data?.message ?? ''),
      message: String(data?.reason ?? data?.code ?? ''),
      transactionId: String(data?.transaction_id ?? ''),
      raw: data,
    };
  } catch (e) {
    console.error('[hubnet] transact error', e);
    return { success: false, message: `Network error: ${(e as Error).message}` };
  }
}
