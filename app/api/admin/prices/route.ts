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
    const rows = prices.map((p: { bundleKey: string; sellingPrice: number; network: string; size: string; volume: string; hubnetCost: number; validity: string }) => ({
      bundle_key: p.bundleKey,
      network: p.network,
      size: p.size,
      volume: p.volume,
      hubnet_cost: p.hubnetCost,
      selling_price: p.sellingPrice,
      validity: p.validity,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('admin_prices')
      .upsert(rows, { onConflict: 'bundle_key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
