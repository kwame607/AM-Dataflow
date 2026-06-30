// app/api/admin/referral-settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from('app_settings')
    .select('referral_pct, referral_enabled')
    .eq('id', 1)
    .single();

  return NextResponse.json({
    referralPct:     parseFloat(String(data?.referral_pct ?? 10)),
    referralEnabled: data?.referral_enabled !== false,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { referralPct, referralEnabled } = await req.json();
    const supabase = createSupabaseAdminClient();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof referralPct === 'number') {
      if (referralPct < 0 || referralPct > 50) {
        return NextResponse.json({ error: 'Percentage must be between 0 and 50' }, { status: 400 });
      }
      update.referral_pct = referralPct;
    }

    if (typeof referralEnabled === 'boolean') {
      update.referral_enabled = referralEnabled;
    }

    const { error } = await supabase
      .from('app_settings')
      .update(update)
      .eq('id', 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[admin/referral-settings PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
