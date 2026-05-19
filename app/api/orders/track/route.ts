import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref');
  if (!ref) return NextResponse.json({ error: 'No reference provided' }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('orders')
      .select('reference, phone, network, size, status, delivery_status, created_at, buyer_name')
      .eq('reference', ref.toUpperCase())
      .single();

    if (error || !data) return NextResponse.json({ order: null });
    return NextResponse.json({ order: data });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
