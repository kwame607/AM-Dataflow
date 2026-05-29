import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

/**
 * Poll endpoint — client calls this after Paystack callback fires,
 * checking if the webhook already saved the order to DB.
 * Returns { found: true } as soon as the order exists with status='success'.
 * This lets the client skip calling /verify when the webhook beats the browser.
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref');
  if (!ref) return NextResponse.json({ found: false });

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('orders')
      .select('reference, status, delivery_status')
      .eq('reference', ref.toUpperCase())
      .maybeSingle();

    if (data && data.status === 'success') {
      return NextResponse.json({
        found: true,
        status: data.status,
        delivery_status: data.delivery_status,
      });
    }
    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ found: false });
  }
}
