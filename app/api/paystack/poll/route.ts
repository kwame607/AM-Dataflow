import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { rateLimit, getIp } from '@/lib/rate-limit';

/**
 * GET /api/paystack/poll?ref=DF-XXXXX
 *
 * Used by the client to check if a payment has been recorded, whether it was
 * saved by the webhook (server-to-server, instant) or the verify endpoint
 * (client-triggered). This means the client doesn't need to stay on the page
 * for the order to be saved — the webhook handles that independently.
 */
export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const rl = rateLimit(`poll:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ found: false, error: 'Too many requests' }, { status: 429 });
  }

  const ref = req.nextUrl.searchParams.get('ref');
  if (!ref || ref.length < 6) {
    return NextResponse.json({ found: false, error: 'Missing reference' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('orders')
      .select('id, reference, status, delivery_status, created_at')
      .eq('reference', ref.toUpperCase())
      .maybeSingle();

    if (data) {
      return NextResponse.json({ found: true, status: data.status, delivery_status: data.delivery_status });
    }
    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ found: false, error: 'Server error' }, { status: 500 });
  }
}
