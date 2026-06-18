// app/api/wallet/transactions/route.ts — NEW FILE
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const agentId = params.get('agentId');
  const isAdmin = params.get('admin') === '1';
  const type    = params.get('type'); // filter: deposit, purchase, refund, withdrawal, bonus
  const limit   = parseInt(params.get('limit')  || '50');
  const offset  = parseInt(params.get('offset') || '0');

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
      .from('wallet_transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (agentId) query = query.eq('agent_id', agentId);
    if (type && type !== 'all') query = query.eq('type', type);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ transactions: data || [], total: count || 0 });
  } catch (e) {
    console.error('[wallet transactions GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
