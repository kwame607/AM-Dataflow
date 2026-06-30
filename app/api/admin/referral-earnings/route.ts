// app/api/admin/referral-earnings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const params      = req.nextUrl.searchParams;
    const referrerId  = params.get('referrerId');
    const referredId  = params.get('referredId');
    const from        = params.get('from');
    const to          = params.get('to');

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from('referral_earnings_summary')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (referrerId) query = query.eq('referrer_slug', referrerId);
    if (referredId) query = query.eq('referred_slug', referredId);
    if (from)       query = query.gte('created_at', from);
    if (to)         query = query.lte('created_at', to);

    const { data: earnings, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const credited = (earnings || []).filter(e => e.status === 'credited');
    const totalPaid = credited.reduce((s, e) => s + (e.bonus_amount || 0), 0);

    // Top referrers by bonus earned
    const byReferrer: Record<string, { name: string; slug: string; total: number; count: number }> = {};
    credited.forEach(e => {
      if (!byReferrer[e.referrer_slug]) {
        byReferrer[e.referrer_slug] = { name: e.referrer_name, slug: e.referrer_slug, total: 0, count: 0 };
      }
      byReferrer[e.referrer_slug].total += e.bonus_amount || 0;
      byReferrer[e.referrer_slug].count++;
    });

    const topReferrers = Object.values(byReferrer)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(r => ({ ...r, total: parseFloat(r.total.toFixed(2)) }));

    return NextResponse.json({
      earnings: earnings || [],
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalEntries: (earnings || []).length,
      topReferrers,
    });
  } catch (e) {
    console.error('[admin/referral-earnings]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
