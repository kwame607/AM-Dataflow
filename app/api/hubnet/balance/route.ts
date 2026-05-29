import { NextResponse } from 'next/server';
import { xpresCheckBalance } from '@/lib/xpresportal';

export async function GET() {
  const result = await xpresCheckBalance();
  if (result) {
    return NextResponse.json({ balance: result.balance });
  }
  return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
}
