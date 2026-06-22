// app/api/hubnet/wallet-balance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { hubnetCheckBalance } from '@/lib/hubnet';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.HUBNET_API_KEY) {
    return NextResponse.json({ error: 'HUBNET_API_KEY not configured in environment variables' }, { status: 503 });
  }

  const result = await hubnetCheckBalance();
  if (!result) {
    return NextResponse.json({ error: 'Hubnet returned an unexpected response — check HUBNET_API_KEY is correct and your Hubnet account is active' }, { status: 502 });
  }
  return NextResponse.json({ balance: result.balance });
}
