// app/api/agents/change-password/route.ts — NEW FILE
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(req);
  const rl = rateLimit(`change-pw:${ip}`, 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });

  try {
    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: { user } } = await admin.auth.admin.getUserById(auth.userId);
    if (!user?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify current password by attempting a sign-in with a fresh client
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: signInErr } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInErr) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    // Update password via admin API
    const { error: updateErr } = await admin.auth.admin.updateUserById(auth.userId, { password: newPassword });
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[change-password]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
