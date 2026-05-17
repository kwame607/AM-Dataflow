import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  const supabase = createSupabaseAdminClient();

  const query = supabase.from('withdrawals').select('*').order('requested_at', { ascending: false });
  if (agentId) query.eq('agent_id', agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, amount, momoNumber, momoName, network, type } = await req.json();
    if (!amount || !momoNumber || !momoName || !network) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount < 20) {
      return NextResponse.json({ error: 'Minimum withdrawal is GHS 20.00' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Validate agent balance if agent withdrawal
    if (type === 'agent' && agentId) {
      const { data: agent } = await supabase.from('agents').select('id').eq('id', agentId).single();
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

      // Calculate available balance
      const { data: orders } = await supabase
        .from('orders')
        .select('agent_profit')
        .eq('agent_id', agentId)
        .eq('status', 'success');

      const { data: prevWithdrawals } = await supabase
        .from('withdrawals')
        .select('amount')
        .eq('agent_id', agentId)
        .in('status', ['pending', 'approved', 'paid']);

      const totalEarned = (orders || []).reduce((s: number, o: { agent_profit: number }) => s + (o.agent_profit || 0), 0);
      const totalWithdrawn = (prevWithdrawals || []).reduce((s: number, w: { amount: number }) => s + (w.amount || 0), 0);
      const available = totalEarned - totalWithdrawn;

      if (amount > available) {
        return NextResponse.json({ error: `Insufficient balance. Available: ₵${available.toFixed(2)}` }, { status: 400 });
      }
    }

    const { data, error } = await supabase.from('withdrawals').insert({
      type: type || 'agent',
      agent_id: agentId || null,
      amount,
      momo_number: momoNumber,
      momo_name: momoName,
      network,
      status: 'pending',
      requested_at: new Date().toISOString(),
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, withdrawal: data });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, note } = await req.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('withdrawals')
      .update({ status, note, resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
