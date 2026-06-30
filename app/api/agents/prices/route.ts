// app/api/agents/prices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getDefaultAdminPrice } from '@/lib/bundles';

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  const { data: agentPrices } = await supabase
    .from('agent_prices')
    .select('*')
    .eq('agent_id', agentId);

  // Use referred_by_id (stable UUID) — not the mutable slug
  const { data: agent } = await supabase
    .from('agents')
    .select('referred_by_id')
    .eq('id', agentId)
    .single();

  let subagentFloors: Record<string, number> = {};

  if (agent?.referred_by_id) {
    const { data: referrer } = await supabase
      .from('agents')
      .select('id, can_set_subagent_prices')
      .eq('id', agent.referred_by_id)
      .single();

    if (referrer?.can_set_subagent_prices) {
      const { data: floors } = await supabase
        .from('subagent_floor_prices')
        .select('bundle_key, agent_floor')
        .eq('agent_id', referrer.id);

      (floors || []).forEach(f => { subagentFloors[f.bundle_key] = f.agent_floor; });
    }
  }

  return NextResponse.json({ prices: agentPrices || [], subagentFloors });
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, prices } = await req.json();
    if (!agentId || !Array.isArray(prices)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: agent } = await supabase
      .from('agents')
      .select('referred_by_id')
      .eq('id', agentId)
      .single();

    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const { data: adminPrices } = await supabase.from('admin_prices').select('*');
    const adminMap: Record<string, number> = {};
    (adminPrices || []).forEach((p: { bundle_key: string; selling_price: number }) => {
      adminMap[p.bundle_key] = p.selling_price;
    });

    // Get sub-agent floors via stable UUID lookup
    let subagentFloors: Record<string, number> = {};
    if (agent.referred_by_id) {
      const { data: referrer } = await supabase
        .from('agents')
        .select('id, can_set_subagent_prices')
        .eq('id', agent.referred_by_id)
        .single();

      if (referrer?.can_set_subagent_prices) {
        const { data: floors } = await supabase
          .from('subagent_floor_prices')
          .select('bundle_key, agent_floor')
          .eq('agent_id', referrer.id);
        (floors || []).forEach(f => { subagentFloors[f.bundle_key] = f.agent_floor; });
      }
    }

    const rows = prices.map((p: {
      bundleKey: string; network: string; size: string;
      volume: string; hubnetCost: number; adminPrice: number;
      agentPrice: number; validity: string;
    }) => {
      const adminFloor     = adminMap[p.bundleKey] ?? getDefaultAdminPrice(p.hubnetCost);
      const subFloor       = subagentFloors[p.bundleKey] ?? 0;
      const effectiveFloor = Math.max(adminFloor, subFloor);
      const agentPrice     = Math.max(p.agentPrice, effectiveFloor);
      const floorSource    = subFloor > adminFloor ? 'subagent' : 'admin';

      return {
        agent_id:     agentId,
        bundle_key:   p.bundleKey,
        network:      p.network,
        size:         p.size,
        volume:       p.volume,
        hubnet_cost:  p.hubnetCost,
        admin_price:  p.adminPrice,
        agent_price:  agentPrice,
        validity:     p.validity,
        floor_source: floorSource,
        updated_at:   new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('agent_prices')
      .upsert(rows, { onConflict: 'agent_id,bundle_key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[agent_prices POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
