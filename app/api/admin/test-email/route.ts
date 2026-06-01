// app/api/admin/test-email/route.ts  ← NEW FILE
// Lets you test email delivery from the admin panel without a real event
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { sendWithdrawalRequestEmail, sendLowWalletEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type } = await req.json();

  if (type === 'withdrawal') {
    const result = await sendWithdrawalRequestEmail({
      agentName:    'Test Agent',
      agentSlug:    'test-agent',
      amount:       150.00,
      momoNumber:   '0241234567',
      momoName:     'Test Agent Name',
      network:      'mtn',
      withdrawalId: 'TEST-' + Date.now(),
      requestedAt:  new Date().toISOString(),
    });
    return NextResponse.json(result);
  }

  if (type === 'low_wallet') {
    const result = await sendLowWalletEmail({
      balance:       45.50,
      threshold:     100,
      pendingOrders: 3,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}
