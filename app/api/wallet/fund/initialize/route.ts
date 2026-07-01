// app/api/wallet/fund/initialize/route.ts — NEW FILE
// Initializes a Paystack transaction for the purpose of TOPPING UP a wallet
// (separate from the existing /api/paystack/initialize used for bundle purchases).
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { genRef } from '@/lib/utils';
import { requireAuth } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { z } from 'zod';

const FundWalletSchema = z.object({
  agentId: z.string().uuid(),
  email: z.string().email(),
  amount: z.number().min(10).max(50_000), // GHS 100 minimum deposit
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`wallet-fund-init:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter) },
    });
  }

  try {
    const body = await req.json();
    const parsed = FundWalletSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
    }
    const { agentId, email, amount } = parsed.data;

    // Ownership check — the agent_id embedded in Paystack metadata here is
    // what /api/wallet/fund/verify trusts to know which wallet to credit,
    // so it must belong to whoever is actually authenticated.
    const supabase = createSupabaseAdminClient();
    const { data: agentRow } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Payment not configured on server' }, { status: 500 });
    }

    const reference = genRef('WFD'); // Wallet FunD

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        reference,
        currency: 'GHS',
        metadata: {
          purpose: 'wallet_funding',
          agent_id: agentId,
          custom_fields: [
            { display_name: 'Purpose', variable_name: 'purpose', value: 'Wallet Top-up' },
            { display_name: 'Agent ID', variable_name: 'agent_id', value: agentId },
          ],
        },
      }),
    });

    const data = await response.json();
    if (!data.status) {
      return NextResponse.json({ error: data.message || 'Paystack initialization failed' }, { status: 400 });
    }

    return NextResponse.json({
      access_code: data.data.access_code,
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (e) {
    console.error('[wallet fund initialize] error:', e);
    return NextResponse.json({ error: 'Server error initializing wallet funding' }, { status: 500 });
  }
}
