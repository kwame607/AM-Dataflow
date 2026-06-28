// app/api/agents/subagent-prices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { ALL_BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';

// ── GET — fetch floor prices set by a referring agent ─────────
// Used by two callers:
//   1. The referrer themselves (to see/edit their sub-agent floors)
//   2. A sub-agent (to find out what their minimum prices are)
export async function GET(req: NextRequest) {
  const params    = req.nextUrl.searchParams;
  const agentId   = params.get('agentId');   // referrer's ID
  const subAgent  = params.get('subAgentId'); // sub-agent requesting their floors

  const supabase = createSupabaseAdminClient();

  // Sub-agent looking up their floors based on who referred them
  if (subAgent) {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Find who referred this sub-agent
    const { data: agent } = await supabase
      .from('agents')
      .select('referred_by')
      .eq('id', subAgent)
      .single();

    if (!agent?.referred_by) {
      return NextResponse.json({ floors: [], hasCustomFloors: false });
    }

    // Find the referrer
    const { data: referrer } = await supabase
      .from('agents')
      .select('id, can_set_subagent_prices')
      .eq('slug', agent.referred_by)
      .single();

    if (!referrer || !referrer.can_set_subagent_prices) {
      return NextResponse.json({ floors: [], hasCustomFloors: false });
    }

    const { data: floors } = await supabase
      .from('subagent_floor_prices')
      .select('*')
      .eq('agent_id', referrer.id);

    return NextResponse.json({ floors: floors || [], hasCustomFloors: (floors || []).length > 0 });
  }

  // Referrer viewing/editing their own sub-agent floors
  if (agentId) {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: agent } = await supabase
      .from('agents')
      .select('can_set_subagent_prices')
      .eq('id', agentId)
      .single();

    if (!agent?.can_set_subagent_prices) {
      return NextResponse.json({ error: 'Not authorised to set sub-agent prices', canSet: false }, { status: 403 });
    }

    const { data: floors } = await supabase
      .from('subagent_floor_prices')
      .select('*')
      .eq('agent_id', agentId);

    // Also get current admin floors for reference
    const { data: adminPrices } = await supabase
      .from('admin_prices')
      .select('bundle_key, selling_price');

    const adminMap: Record<string, number> = {};
    (adminPrices || []).forEach(p => { adminMap[p.bundle_key] = p.selling_price; });

    return NextResponse.json({ floors: floors || [], adminMap, canSet: true });
  }

  return NextResponse.json({ error: 'Missing agentId or subAgentId' }, { status: 400 });
}

// ── POST — referrer saves their sub-agent floor prices ────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId, prices } = await req.json();
    if (!agentId || !Array.isArray(prices)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify agent is allowed to set sub-agent prices
    const { data: agent } = await supabase
      .from('agents')
      .select('can_set_subagent_prices')
      .eq('id', agentId)
      .single();

    if (!agent?.can_set_subagent_prices) {
      return NextResponse.json({ error: 'Not authorised to set sub-agent prices' }, { status: 403 });
    }

    // Get admin floors to enforce minimum
    const { data: adminPrices } = await supabase
      .from('admin_prices')
      .select('bundle_key, selling_price');

    const adminMap: Record<string, number> = {};
    (adminPrices || []).forEach(p => { adminMap[p.bundle_key] = p.selling_price; });

    // Build rows — enforce ≥ admin floor
    const rows = prices.map((p: {
      bundleKey: string; network: string; size: string;
      volume: string; hubnetCost: number; agentFloor: number; validity: string;
    }) => {
      const adminFloor = adminMap[p.bundleKey] ?? getDefaultAdminPrice(p.hubnetCost);
      const agentFloor = Math.max(p.agentFloor, adminFloor); // never below admin floor
      return {
        agent_id:    agentId,
        bundle_key:  p.bundleKey,
        network:     p.network,
        size:        p.size,
        volume:      p.volume,
        hubnet_cost: p.hubnetCost,
        admin_floor: adminFloor,
        agent_floor: agentFloor,
        validity:    p.validity,
        updated_at:  new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('subagent_floor_prices')
      .upsert(rows, { onConflict: 'agent_id,bundle_key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[subagent-prices POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── PATCH — admin toggles can_set_subagent_prices for an agent ─
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId, canSet } = await req.json();
    if (!agentId || typeof canSet !== 'boolean') {
      return NextResponse.json({ error: 'Missing agentId or canSet' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('agents')
      .update({ can_set_subagent_prices: canSet, updated_at: new Date().toISOString() })
      .eq('id', agentId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, canSet });
  } catch (e) {
    console.error('[subagent-prices PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
