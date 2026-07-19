import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { ALL_BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';
import { requireAdmin } from '@/lib/auth-guard';

export const revalidate = 60;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('admin_prices')
      .select('*')
      .order('network')
      .order('hubnet_cost');

    if (error) {
      // Fall back to default prices
      const defaults = ALL_BUNDLES.map(b => ({
        bundle_key: b.key,
        network: b.network,
        size: b.size,
        volume: b.volume,
        hubnet_cost: b.cost,
        selling_price: getDefaultAdminPrice(b.cost),
        admin_profit: getDefaultAdminPrice(b.cost) - b.cost,
        validity: b.validity,
      }));
      return NextResponse.json(defaults);
    }

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { prices } = await req.json();
    if (!Array.isArray(prices)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // ── Fetch the CURRENT admin_prices before overwriting them ─────────────
    // We need the old selling_price per bundle to know whether the floor is
    // actually going UP for that bundle (only then do we need to sweep
    // dependent tables). If it's going down or unchanged, leave agents alone.
    const { data: currentPrices } = await supabase
      .from('admin_prices')
      .select('bundle_key, selling_price');

    const oldFloorMap: Record<string, number> = {};
    (currentPrices || []).forEach(p => { oldFloorMap[p.bundle_key] = p.selling_price; });

    const rows = prices.map((p: { bundleKey: string; sellingPrice: number; storePrice: number; network: string; size: string; volume: string; hubnetCost: number; validity: string }) => ({
      bundle_key: p.bundleKey,
      network: p.network,
      size: p.size,
      volume: p.volume,
      hubnet_cost: p.hubnetCost,
      selling_price: p.sellingPrice,
      store_price: p.storePrice,
      validity: p.validity,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('admin_prices')
      .upsert(rows, { onConflict: 'bundle_key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Auto-raise agent_prices / subagent_floor_prices for bundles whose
    //    floor just went UP, so no one is left selling below the new floor
    //    until they happen to re-save their own price list. ─────────────────
    const raisedBundles: Array<{ bundleKey: string; oldFloor: number; newFloor: number }> = [];

    for (const row of rows) {
      const newFloor = row.selling_price;
      const oldFloor = oldFloorMap[row.bundle_key];

      // Only sweep if the floor for this bundle actually increased
      // (undefined oldFloor = brand new bundle, nothing to raise yet)
      if (oldFloor === undefined || newFloor <= oldFloor) continue;

      raisedBundles.push({ bundleKey: row.bundle_key, oldFloor, newFloor });

      // Raise any agent's own price on this bundle that's now below the new floor
      const { error: agentPriceErr } = await supabase
        .from('agent_prices')
        .update({ agent_price: newFloor, floor_source: 'admin', updated_at: new Date().toISOString() })
        .eq('bundle_key', row.bundle_key)
        .lt('agent_price', newFloor);

      if (agentPriceErr) {
        console.error('[admin/prices] Failed to raise agent_prices for', row.bundle_key, agentPriceErr);
      }

      // Raise the stored admin_floor reference on sub-agent floor rows
      const { error: adminFloorErr } = await supabase
        .from('subagent_floor_prices')
        .update({ admin_floor: newFloor, updated_at: new Date().toISOString() })
        .eq('bundle_key', row.bundle_key)
        .lt('admin_floor', newFloor);

      if (adminFloorErr) {
        console.error('[admin/prices] Failed to raise subagent admin_floor for', row.bundle_key, adminFloorErr);
      }

      // A sub-agent's own floor (agent_floor) must also never sit below the
      // new admin floor — raise those too if they've fallen behind.
      const { error: subFloorErr } = await supabase
        .from('subagent_floor_prices')
        .update({ agent_floor: newFloor, updated_at: new Date().toISOString() })
        .eq('bundle_key', row.bundle_key)
        .lt('agent_floor', newFloor);

      if (subFloorErr) {
        console.error('[admin/prices] Failed to raise subagent agent_floor for', row.bundle_key, subFloorErr);
      }
    }

    return NextResponse.json({ success: true, raisedBundles });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
