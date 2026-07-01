// app/api/orders/track-by-phone/route.ts
// Returns all orders for a given phone number.
// No auth required — public endpoint, but rate limited and
// only returns safe display fields (no agent profits, no internal IDs).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const rl = rateLimit(`track-phone:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  const phone = req.nextUrl.searchParams.get('phone')?.trim();
  if (!phone) return NextResponse.json({ error: 'Missing phone number' }, { status: 400 });

  // Normalize — accept 0XXXXXXXXX or 233XXXXXXXXX
  const normalized = phone.startsWith('233')
    ? '0' + phone.slice(3)
    : phone;

  if (!/^0[0-9]{9}$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: orders, error } = await supabase
      .from('orders')
      .select('reference, phone, network, size, status, delivery_status, created_at, source, agent_slug, agent_price, delivery_provider')
      .eq('phone', normalized)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 });

    return NextResponse.json({ orders: orders || [], phone: normalized });
  } catch (e) {
    console.error('[track-by-phone]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
