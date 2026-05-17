const HUBNET_BASE = 'https://console.hubnet.app/live/api/context/business/transaction';

function getHeaders() {
  return {
    token: `Bearer ${process.env.HUBNET_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function hubnetCheckBalance(): Promise<{ balance: number } | null> {
  try {
    const res = await fetch(`${HUBNET_BASE}/check_balance`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    const data = await res.json();
    if (data.balance !== undefined) {
      return { balance: parseFloat(data.balance) };
    }
    return null;
  } catch {
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

  const body: Record<string, string> = { phone, volume, reference };
  if (webhook) body.webhook = webhook;

  try {
    const res = await fetch(`${HUBNET_BASE}/${network}-new-transaction`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    const data = await res.json();

    const code = data?.data?.code || data?.message || '';
    const success =
      data?.status === true ||
      code === '0000' ||
      data?.data?.code === '0000';

    return {
      success,
      code: String(code),
      message: data?.reason || data?.message || '',
      transactionId: data?.data?.transactionId || data?.transactionId,
      raw: data,
    };
  } catch (e) {
    return { success: false, message: `Network error: ${(e as Error).message}` };
  }
}

const requestQueue: Array<() => void> = [];
let requestCount = 0;
const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;

export function enqueueHubnetRequest(fn: () => void) {
  if (requestCount < RATE_LIMIT) {
    requestCount++;
    fn();
    setTimeout(() => { requestCount--; }, WINDOW_MS);
  } else {
    requestQueue.push(fn);
    setTimeout(() => {
      const next = requestQueue.shift();
      if (next) { requestCount++; next(); setTimeout(() => requestCount--, WINDOW_MS); }
    }, WINDOW_MS);
  }
}
