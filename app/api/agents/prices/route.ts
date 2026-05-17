import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from('agent_prices')
    .select('*')
    .eq('agent_id', agentId);

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, prices } = await req.json();
    if (!agentId || !Array.isArray(prices)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify agent exists
    const { data: agent } = await supabase.from('agents').select('id').eq('id', agentId).single();
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    // Get admin prices as floor
    const { data: adminPrices } = await supabase.from('admin_prices').select('*');
    const floorMap: Record<string, number> = {};
    (adminPrices || []).forEach((p: { bundle_key: string; selling_price: number }) => {
      floorMap[p.bundle_key] = p.selling_price;
    });

    const rows = prices.map((p: {
      bundleKey: string; network: string; size: string;
      volume: string; hubnetCost: number; adminPrice: number;
      agentPrice: number; validity: string;
    }) => {
      const floor = floorMap[p.bundleKey] ?? p.adminPrice;
      const agentPrice = Math.max(p.agentPrice, floor);
      return {
        agent_id: agentId,
        bundle_key: p.bundleKey,
        network: p.network,
        size: p.size,
        volume: p.volume,
        hubnet_cost: p.hubnetCost,
        admin_price: p.adminPrice,
        agent_price: agentPrice,
        validity: p.validity,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('agent_prices')
      .upsert(rows, { onConflict: 'agent_id,bundle_key' });

    if (error) {
      console.error('agent_prices upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('agent_prices POST exception:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
