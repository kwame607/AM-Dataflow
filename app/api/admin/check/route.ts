import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getAdminEmails } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ isAdmin: false });

    const supabase = createSupabaseAdminClient();
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);

    if (!user?.email) return NextResponse.json({ isAdmin: false });

    const isAdmin = getAdminEmails().includes(user.email.toLowerCase());
    return NextResponse.json({ isAdmin, email: user.email });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
