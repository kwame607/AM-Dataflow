// app/api/agents/check-slug/route.ts
// Public endpoint — checks if a store slug is available during registration.
// Returns { available: boolean } only — no other data exposed.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || '';

  if (!slug || !/^[a-z0-9]+$/.test(slug) || slug.length < 3) {
    return NextResponse.json({ available: false });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    return NextResponse.json({ available: !data });
  } catch {
    // On error, don't block registration — return available:true and let
    // the actual registration endpoint catch the duplicate if there is one.
    return NextResponse.json({ available: true });
  }
}
