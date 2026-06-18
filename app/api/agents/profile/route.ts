// app/api/agents/profile/route.ts — NEW FILE
// Allows an agent to update their own profile fields (not status/slug,
// which remain admin-controlled via existing app/api/agents/route.ts PATCH).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { agentId, phone, whatsapp, storeName, storeDescription, storeBannerText, storeColor, storeLogoUrl, showMtn, showAt, showTelecel } = body;

    if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // Verify the authenticated user owns this agent record
    const { data: agent } = await supabase.from('agents').select('id, auth_user_id').eq('id', agentId).single();
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    if (agent.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (phone !== undefined)            update.phone = phone;
    if (whatsapp !== undefined)         update.whatsapp = whatsapp;
    if (storeName !== undefined)        update.store_name = storeName;
    if (storeDescription !== undefined) update.store_description = storeDescription;
    if (storeBannerText !== undefined)  update.store_banner_text = storeBannerText;
    if (storeColor !== undefined)       update.store_color = storeColor;
    if (storeLogoUrl !== undefined)     update.store_logo_url = storeLogoUrl;
    if (showMtn !== undefined)          update.show_mtn = showMtn;
    if (showAt !== undefined)           update.show_at = showAt;
    if (showTelecel !== undefined)      update.show_telecel = showTelecel;

    const { data, error } = await supabase
      .from('agents')
      .update(update)
      .eq('id', agentId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, agent: data });
  } catch (e) {
    console.error('[agents profile PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
