// app/api/hubnet/wallet-balance/route.ts
//
// Checks the REAL Hubnet wallet balance. Kept at a separate path from the
// existing /api/hubnet/balance route, which — despite its name — actually
// checks XpresPortal's balance (a leftover from before the provider switch).
// That existing route is left untouched; this is purely additive.
import { NextResponse } from 'next/server';
import { hubnetCheckBalance } from '@/lib/hubnet';
import { requireAdmin } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await hubnetCheckBalance();
  if (!result) {
    return NextResponse.json({ error: 'Failed to fetch Hubnet balance' }, { status: 500 });
  }
  return NextResponse.json({ balance: result.balance });
}
