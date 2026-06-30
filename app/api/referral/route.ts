// app/api/referral/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getReferralPct, setReferralPct } from '@/lib/settings';

// GET /api/referral?agentId=xxx — agent fetches their own referral stats
// GET /api/referral?admin=1 — admin fetches all referral relationships
export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const agentId = params.get('agentId');
  const isAdmin = params.get('admin') === '1';

  const supabase = createSupabaseAdminClient();

  if (isAdmin) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: earnings } = await supabase
      .from('referral_earnings')
      .select(`
        id, bonus_amount, pct, referred_profit, created_at, status,
        referrer:referrer_id(id, name, slug),
        referred:referred_id(id, name, slug)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    const { data: referredAgents } = await supabase
      .from('agents')
      .select('id, name, slug, referred_by, created_at, status')
      .not('referred_by', 'is', null)
      .order('created_at', { ascending: false });

    const pct = await getReferralPct();

    return NextResponse.json({ earnings: earnings || [], referredAgents: referredAgents || [], pct });
  }

  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Build the agent's referral balance directly from referral_earnings
  // (replaces the old getReferralBalance helper which no longer exists
  // after lib/referral.ts was rebuilt with the wallet-based money model)
  const { data: earningsRows } = await supabase
    .from('referral_earnings')
    .select('bonus_amount, created_at, referred_id, status')
    .eq('referrer_id', agentId)
    .order('created_at', { ascending: false });

  const credited = (earningsRows || []).filter(e => e.status === 'credited');
  const totalEarned = credited.reduce((s, e) => s + (e.bonus_amount || 0), 0);

  // Referral bonuses are now credited straight to the agent's wallet
  // (lib/referral.ts -> creditReferralBonus), so "available" reflects
  // the same wallet balance rather than a separate withdrawal ledger.
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance')
    .eq('agent_id', agentId)
    .single();

  const { data: agent } = await supabase
    .from('agents')
    .select('slug')
    .eq('id', agentId)
    .single();

  const { data: referred } = await supabase
    .from('agents')
    .select('id, name, slug, status, created_at')
    .eq('referred_by', agent?.slug || '')
    .order('created_at', { ascending: false });

  const pct = await getReferralPct();

  return NextResponse.json({
    totalEarned:    parseFloat(totalEarned.toFixed(2)),
    committed:      0, // bonuses now go straight to wallet, no separate withdrawal commitment tracked here
    available:      wallet?.balance ?? 0,
    earnings:       credited,
    referredAgents: referred || [],
    pct,
    referralSlug:   agent?.slug || '',
  });
}

// PATCH /api/referral — admin updates referral percentage
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pct } = await req.json();
  if (typeof pct !== 'number') return NextResponse.json({ error: 'Invalid pct' }, { status: 400 });

  const result = await setReferralPct(pct);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, pct });
}
