import { NextResponse } from 'next/server';
import { hubnetCheckBalance } from '@/lib/hubnet';

export async function GET() {
  const result = await hubnetCheckBalance();
  if (result) {
    return NextResponse.json({ balance: result.balance });
  }
  return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
}
