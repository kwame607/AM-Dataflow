import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agentId');
  const status = req.nextUrl.searchParams.get('status');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '200');

  const supabase = createSupabaseAdminClient();
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);

  if (agentId) query = query.eq('agent_id', agentId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}
