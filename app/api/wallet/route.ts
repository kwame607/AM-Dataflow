// app/api/wallet/route.ts — NEW FILE
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';

// ── GET — fetch wallet for the authenticated agent ────────────
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();

    // Ownership check — financial data, so verify the caller owns this agent record
    const { data: agentRow } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get or create wallet
    let { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (!wallet) {
      const { data: newWallet, error } = await supabase
        .from('wallets')
        .insert({ agent_id: agentId })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      wallet = newWallet;
    }

    return NextResponse.json({ wallet });
  } catch (e) {
    console.error('[wallet GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST — admin: adjust wallet balance ───────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId, amount, type, description } = await req.json();

    if (!agentId || !amount || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!['adjustment', 'bonus', 'reversal'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type for admin operation' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    if (wallet.is_frozen) return NextResponse.json({ error: 'Wallet is frozen' }, { status: 400 });

    const newBalance = Math.max(0, wallet.balance + amount);
    const reference = `ADJ-${Date.now().toString(36).toUpperCase()}`;

    // Update wallet
    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        balance: newBalance,
        total_deposited: amount > 0 ? wallet.total_deposited + amount : wallet.total_deposited,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Record transaction
    await supabase.from('wallet_transactions').insert({
      wallet_id:      wallet.id,
      agent_id:       agentId,
      type,
      amount:         Math.abs(amount),
      balance_before: wallet.balance,
      balance_after:  newBalance,
      reference,
      status:        'success',
      description:   description || `Admin ${type}`,
    });

    return NextResponse.json({ success: true, newBalance });
  } catch (e) {
    console.error('[wallet POST admin]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── PATCH — freeze/unfreeze wallet (admin) ────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId, frozen } = await req.json();
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('wallets')
      .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
      .eq('agent_id', agentId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[wallet PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
