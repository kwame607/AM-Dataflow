// app/api/wallet/fund/verify/route.ts — NEW FILE
// Verifies a Paystack wallet top-up payment and credits the wallet.
// Mirrors /api/paystack/verify's idempotency pattern (check existing
// transaction by reference before crediting, to prevent double-credit
// if called twice e.g. from a retry).
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaystackPayment } from '@/lib/paystack';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`wallet-fund-verify:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const { reference, agentId } = await req.json();
    if (!reference || !agentId) {
      return NextResponse.json({ error: 'Missing reference or agentId' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Ownership check — the authenticated user must own this agent record
    const { data: agentRow } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Idempotency check — has this reference already been credited? ──
    const { data: existingTxn } = await supabase
      .from('wallet_transactions')
      .select('id, balance_after')
      .eq('reference', reference)
      .maybeSingle();

    if (existingTxn) {
      return NextResponse.json({ success: true, alreadyProcessed: true, balance: existingTxn.balance_after });
    }

    // ── Verify with Paystack ─────────────────────────────────
    const paystack = await verifyPaystackPayment(reference);
    if (!paystack.success) {
      return NextResponse.json({ error: 'Payment verification failed. Contact support if you were charged.' }, { status: 400 });
    }

    // ── Cross-check agentId against the metadata set at initialize time ──
    // Without this, anyone who knows a valid (already-paid) Paystack reference
    // could pass a different agentId and redirect the credit to their own
    // wallet instead of the wallet that actually paid.
    const metaAgentId = (paystack.metadata as { agent_id?: string } | undefined)?.agent_id;
    if (!metaAgentId || metaAgentId !== agentId) {
      return NextResponse.json({ error: 'Reference does not belong to this agent' }, { status: 403 });
    }

    const amount = paystack.amount || 0;
    if (amount <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
    }

    // ── Get wallet ────────────────────────────────────────────
    let { data: wallet } = await supabase.from('wallets').select('*').eq('agent_id', agentId).single();
    if (!wallet) {
      const { data: newWallet, error } = await supabase.from('wallets').insert({ agent_id: agentId }).select().single();
      if (error) return NextResponse.json({ error: 'Could not create wallet' }, { status: 500 });
      wallet = newWallet;
    }

    if (wallet.is_frozen) {
      return NextResponse.json({ error: 'Your wallet is frozen. Contact support.' }, { status: 403 });
    }

    const newBalance = wallet.balance + amount;

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        balance: newBalance,
        total_deposited: wallet.total_deposited + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id);

    if (updateErr) return NextResponse.json({ error: 'Failed to credit wallet' }, { status: 500 });

    await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      agent_id: agentId,
      type: 'deposit',
      amount,
      balance_before: wallet.balance,
      balance_after: newBalance,
      reference,
      status: 'success',
      description: 'Wallet top-up via Paystack',
      metadata: { method: 'paystack' },
    });

    // Notify (optional — wire up sendWalletFundedEmail in lib/email.ts if desired)
    console.log(`[wallet fund verify] Credited GHS ${amount} to agent ${agentId}, new balance: ${newBalance}`);

    return NextResponse.json({ success: true, balance: newBalance, amount });
  } catch (e) {
    console.error('[wallet fund verify] error:', e);
    return NextResponse.json({ error: 'Server error verifying wallet funding' }, { status: 500 });
  }
}
