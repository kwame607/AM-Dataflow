// app/api/wallet/claims/route.ts — NEW FILE
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { sendDepositClaimEmail } from '@/lib/wallet-email';

// ── GET — list claims (agent sees own, admin sees all) ────────
export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const agentId = params.get('agentId');
  const isAdmin = params.get('admin') === '1';
  const status  = params.get('status');

  const supabase = createSupabaseAdminClient();

  if (isAdmin) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

    const { data: agentRow } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    let query = supabase
  .from('deposit_claims')
  .select(
    isAdmin
      ? `
          *,
          agents (
            name,
            slug
          )
        `
      : '*'
  )
  .order('created_at', { ascending: false });

    if (agentId) query = query.eq('agent_id', agentId);
    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = (data ?? []).map((c: any) => ({
  ...c,
  agent_name: c.agents?.name ?? null,
  agent_slug: c.agents?.slug ?? null,
}));

result.forEach((c: any) => delete c.agents);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[deposit claims GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST — submit a new deposit claim ──────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  // Rate limit claims submission to prevent spam/abuse — 5 per 10 minutes
  const rl = rateLimit(`deposit-claim:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many claim submissions. Please wait before trying again.' }, { status: 429 });
  }

  try {
    const { agentId, network, senderNumber, transactionId, amount, proofUrl } = await req.json();

    if (!agentId || !network || !senderNumber || !transactionId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: agent } = await supabase.from('agents').select('id, name, slug, auth_user_id').eq('id', agentId).single();
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    if (agent.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Prevent duplicate claims with the same transaction ID
    const { data: dup } = await supabase
      .from('deposit_claims')
      .select('id')
      .eq('transaction_id', transactionId)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: 'A claim with this transaction ID already exists' }, { status: 400 });
    }

    const { data: claim, error } = await supabase
      .from('deposit_claims')
      .insert({
        agent_id: agentId,
        network,
        sender_number: senderNumber,
        transaction_id: transactionId,
        amount,
        proof_url: proofUrl || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    sendDepositClaimEmail({
      agentName: agent.name,
      agentSlug: agent.slug,
      network,
      senderNumber,
      transactionId,
      amount,
      claimId: claim.id,
    }).catch(e => console.error('[deposit claim email]', e));

    return NextResponse.json({ success: true, claim });
  } catch (e) {
    console.error('[deposit claims POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── PATCH — admin approves/rejects a claim ─────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { claimId, status, adminNote, reviewedBy } = await req.json();
    if (!claimId || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: claim } = await supabase.from('deposit_claims').select('*').eq('id', claimId).single();
    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    if (claim.status !== 'pending') {
      return NextResponse.json({ error: 'Claim has already been reviewed' }, { status: 400 });
    }

    // Update claim status first
    const { error: claimErr } = await supabase
      .from('deposit_claims')
      .update({
        status,
        admin_note: adminNote || null,
        reviewed_by: reviewedBy || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId);

    if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

    // If approved, credit the wallet
    if (status === 'approved') {
      const { data: wallet } = await supabase.from('wallets').select('*').eq('agent_id', claim.agent_id).single();
      if (wallet && !wallet.is_frozen) {
        const newBalance = wallet.balance + claim.amount;
        await supabase.from('wallets').update({
          balance: newBalance,
          total_deposited: wallet.total_deposited + claim.amount,
          updated_at: new Date().toISOString(),
        }).eq('id', wallet.id);

        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          agent_id: claim.agent_id,
          type: 'deposit',
          amount: claim.amount,
          balance_before: wallet.balance,
          balance_after: newBalance,
          reference: `CLM-${claimId.slice(0, 8).toUpperCase()}`,
          status: 'success',
          description: `Approved deposit claim — ${claim.network.toUpperCase()} ${claim.sender_number}`,
          metadata: { claim_id: claimId, transaction_id: claim.transaction_id },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[deposit claims PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
