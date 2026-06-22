// app/api/stats/today/route.ts
// Public endpoint — no auth required. Returns today's successful order count
// for the trust signal on the store hero. Cached for 5 minutes so it doesn't
// hammer the DB on every store page load.
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export const revalidate = 300; // Next.js cache: revalidate every 5 minutes

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'success')
      .gte('created_at', todayStart.toISOString());

    if (error) {
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
