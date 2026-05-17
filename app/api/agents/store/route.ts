import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ agent: null });

  const supabase = createSupabaseAdminClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, store_name, slug, phone, whatsapp, status')
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
