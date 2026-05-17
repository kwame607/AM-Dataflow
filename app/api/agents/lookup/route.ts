import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { identifier } = await req.json();
    if (!identifier) return NextResponse.json({ email: null });

    const supabase = createSupabaseAdminClient();

    // Email - return as-is
    if (identifier.includes('@')) {
      return NextResponse.json({ email: identifier.toLowerCase().trim() });
    }

    // Phone number (10 digits starting with 0)
    if (/^0\d{9}$/.test(identifier.trim())) {
      const { data } = await supabase
        .from('agents')
        .select('email')
        .eq('phone', identifier.trim())
        .single();
      return NextResponse.json({ email: data?.email || null });
    }

    // Username / slug
    const { data } = await supabase
      .from('agents')
      .select('email')
      .eq('slug', identifier.trim().toLowerCase())
      .single();
    return NextResponse.json({ email: data?.email || null });
  } catch {
    return NextResponse.json({ email: null });
  }
}
