// app/api/admin/banner/route.ts — NEW FILE
// Controls the site-wide urgent banner (ServiceBanner). Public GET so the
// banner can render for anyone (store pages included); admin-only PATCH.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

export const revalidate = 60;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('banner_id, banner_title, banner_body, banner_active')
      .eq('id', 1)
      .single();

    if (error || !data?.banner_active) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      id: data.banner_id,
      title: data.banner_title,
      body: data.banner_body,
    });
  } catch {
    return NextResponse.json({ active: false });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { title, body, active } = await req.json();
    const supabase = createSupabaseAdminClient();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (active === false) {
      update.banner_active = false;
    } else {
      if (!title?.trim() || !body?.trim()) {
        return NextResponse.json({ error: 'Missing title or body' }, { status: 400 });
      }
      // New id whenever content changes — this is what makes the banner
      // re-appear for agents who already dismissed a previous version.
      update.banner_id = `${Date.now().toString(36)}`;
      update.banner_title = title.trim();
      update.banner_body = body.trim();
      update.banner_active = true;
    }

    const { error } = await supabase.from('app_settings').update(update).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[admin banner PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
