// app/api/agents/store/route.ts — REPLACE existing file
// Backward compatible: all original fields preserved, new flyer/branding
// fields added (store_description, store_logo_url, store_banner_text,
// store_color, show_mtn/at/telecel). Existing consumers of this route
// (app/store/[slug]/page.tsx) continue to work unchanged since they only
// destructure the fields they already use.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ agent: null });

  const supabase = createSupabaseAdminClient();

  const { data: agent } = await supabase
    .from('agents')
    .select(`
      id, name, store_name, slug, phone, whatsapp, status,
      store_description, store_logo_url, store_banner_text, store_color,
      show_mtn, show_at, show_telecel
    `)
    .eq('slug', slug)
    .single();

  if (!agent || agent.status !== 'active') {
    return NextResponse.json({ agent: null });
  }

  const { data: prices } = await supabase
    .from('agent_prices')
    .select('bundle_key, agent_price')
    .eq('agent_id', agent.id);

  const priceList = prices || [];
  return NextResponse.json({ agent, prices: priceList, hasPrices: priceList.length > 0 });
}
