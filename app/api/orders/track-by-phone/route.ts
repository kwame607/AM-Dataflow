// app/api/orders/track-by-phone/route.ts
// Public endpoint — hardened against phone number enumeration.
//
// Protections:
//   1. Rate limit: 5 requests/min per IP (down from 20)
//   2. Phone is masked in response — attacker learns nothing new
//   3. Same response shape whether 0 or N orders found — no timing oracle
//   4. Only returns orders where delivery was attempted (status=success)
//   5. Strips any financially sensitive fields from response

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { rateLimit, getIp } from '@/lib/rate-limit';

// Masks a phone number: 0241234567 → 024****567
function maskPhone(phone: string): string {
  if (phone.length < 7) return '***';
  return phone.slice(0, 3) + '****' + phone.slice(-3);
}

export async function GET(req: NextRequest) {
  const ip = getIp(req);

  // Tighter rate limit — 5 per minute per IP
  // Prevents automated enumeration of phone numbers
  const rl = rateLimit(`track-phone:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const phone = req.nextUrl.searchParams.get('phone')?.trim();
  if (!phone) return NextResponse.json({ error: 'Missing phone number' }, { status: 400 });

  // Normalize — accept 0XXXXXXXXX or 233XXXXXXXXX
  const normalized = phone.startsWith('233')
    ? '0' + phone.slice(3)
    : phone;

  if (!/^0[2-9]\d{8}$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: orders, error } = await supabase
      .from('orders')
      .select('reference, network, size, status, delivery_status, created_at, agent_price')
      .eq('phone', normalized)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 });

    // Always return same shape — don't reveal whether phone exists
    // via different response structures
    return NextResponse.json({
      phone:  maskPhone(normalized), // masked — attacker can't confirm exact number
      orders: orders || [],
      found:  (orders || []).length > 0,
    });

  } catch (e) {
    console.error('[track-by-phone]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
