const PAYSTACK_VERIFY_URL = 'https://api.paystack.co/transaction/verify';

async function callPaystackVerify(reference: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${PAYSTACK_VERIFY_URL}/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyPaystackPayment(reference: string): Promise<{
  success: boolean;
  amount?: number;
  email?: string;
  metadata?: Record<string, unknown>;
}> {
  const RETRIES = 4;
  const DELAY_MS = 2500;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const data = await callPaystackVerify(reference);
      const txStatus: string = (data.data?.status ?? '').toLowerCase();
      console.log(`[paystack verify attempt ${attempt}]`, JSON.stringify({ status: data.status, txStatus, amount: data.data?.amount, message: data.message }));

      if (data.status && (txStatus === 'success' || txStatus === 'successful' || txStatus === 'paid' || txStatus === 'complete')) {
        return {
          success: true,
          amount: data.data.amount / 100,
          email: data.data.customer?.email,
          metadata: data.data.metadata,
        };
      }

      if (txStatus === 'failed' || txStatus === 'reversed' || txStatus === 'abandoned') {
        console.log('[paystack verify] terminal failure status:', txStatus);
        return { success: false };
      }

      // pending / unknown — retry after delay
      if (attempt < RETRIES) {
        console.log(`[paystack verify] status="${txStatus}", retrying in ${DELAY_MS}ms…`);
        await new Promise(r => setTimeout(r, DELAY_MS));
      } else {
        console.log('[paystack verify] all retries exhausted. Final status:', txStatus, JSON.stringify(data));
      }
    } catch (e) {
      console.error(`[paystack verify attempt ${attempt}] error:`, e);
      if (attempt < RETRIES) await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return { success: false };
}

declare global {
  interface Window {
    PaystackPop: {
      setup(options: Record<string, unknown>): { openIframe(): void };
    };
  }
}

interface PaystackOptions {
  key: string;
  access_code: string;
  callback: (response: { reference: string }) => void;
  onClose: () => void;
}

export function openPaystack(options: PaystackOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('Not in browser')); return; }

    const launch = () => {
      try {
        window.PaystackPop.setup({
          key: options.key,
          access_code: options.access_code,
          callback: function(response: { reference: string }) { options.callback(response); },
          onClose: function() { options.onClose(); },
        }).openIframe();
        resolve();
      } catch (e) { reject(e); }
    };

    if (window.PaystackPop) { launch(); return; }

    // Poll up to 5 seconds for the Paystack script to finish loading
    let tries = 0;
    const poll = setInterval(() => {
      if (window.PaystackPop) { clearInterval(poll); launch(); }
      else if (++tries >= 50) { clearInterval(poll); reject(new Error('Paystack script failed to load')); }
    }, 100);
  });
}
