// app/api/referral/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getReferralBalance } from '@/lib/referral';
import { getReferralPct, setReferralPct } from '@/lib/settings';

// GET /api/referral?agentId=xxx — agent fetches their own referral stats
// GET /api/referral?admin=1 — admin fetches all referral relationships
export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const agentId = params.get('agentId');
  const isAdmin = params.get('admin') === '1';

  if (isAdmin) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createSupabaseAdminClient();

    // All referral earnings with agent names
    const { data: earnings } = await supabase
      .from('referral_earnings')
      .select(`
        id, bonus_amount, pct, referred_profit, created_at,
        referrer:referrer_id(id, name, slug),
        referred:referred_id(id, name, slug)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    // All agents who were referred
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

  const balance = await getReferralBalance(agentId);

  // Also get who this agent has referred
  const supabase = createSupabaseAdminClient();
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
    ...balance,
    referredAgents: referred || [],
    pct,
    referralSlug: agent?.slug || '',
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
