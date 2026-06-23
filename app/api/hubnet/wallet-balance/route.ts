// app/api/hubnet/wallet-balance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.HUBNET_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'HUBNET_API_KEY not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(
      'https://console.hubnet.app/live/api/context/business/transaction/check_balance',
      {
        method: 'GET',
        headers: { token: `Bearer ${key}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      }
    );

    const data = await res.json();
    console.log('[hubnet wallet-balance]', JSON.stringify(data));

    // Real live shape: { status:"success", data:{ wallet_balance: 43.7, ... } }
    // Docs shape (wrong): { status:true, balance: 500.00 }
    const balance =
      data?.data?.wallet_balance ??  // real live shape
      data?.balance ??               // documented shape (fallback)
      null;

    if (balance !== null && balance !== undefined) {
      return NextResponse.json({ balance: parseFloat(String(balance)) });
    }

    return NextResponse.json({ error: 'Could not parse balance from Hubnet response', raw: data }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: `Network error: ${(e as Error).message}` }, { status: 500 });
  }
}
