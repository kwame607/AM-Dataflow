// app/api/myztadata/balance/route.ts
// MyZtaData has no dedicated balance endpoint — we verify the key is alive
// and note that balance must be checked in their Console dashboard.
import { NextResponse } from 'next/server';
import { myZtaCheckBalance } from '@/lib/myztadata';

export async function GET() {
  const result = await myZtaCheckBalance();
  if (!result) {
    return NextResponse.json({ error: 'Could not reach MyZtaData API — check your API key' }, { status: 500 });
  }
  return NextResponse.json({
    keyValid: true,
    note: 'MyZtaData does not expose a balance API. Check your Console Wallet at myztadata.com.',
  });
}
