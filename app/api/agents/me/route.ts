import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    // Read session from request cookies (same as middleware)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ agent: null }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: agent } = await admin
      .from('agents')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    if (!agent) return NextResponse.json({ agent: null }, { status: 404 });
    return NextResponse.json({ agent });
  } catch {
    return NextResponse.json({ agent: null }, { status: 500 });
  }
}
