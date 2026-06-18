// app/api/agents/profile/upload-logo/route.ts — NEW FILE
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file      = formData.get('file') as File;
    const agentId   = formData.get('agentId') as string;

    if (!file || !agentId) {
      return NextResponse.json({ error: 'Missing file or agentId' }, { status: 400 });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed. Use JPG, PNG, or WEBP.' }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 2MB.' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: agent } = await supabase.from('agents').select('id, auth_user_id').eq('id', agentId).single();
    if (!agent || agent.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ext      = file.name.split('.').pop();
    const fileName = `${agentId}/logo-${Date.now()}.${ext}`;
    const bytes    = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from('store-logos')
      .upload(fileName, bytes, { contentType: file.type, cacheControl: '3600', upsert: true });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: pub } = supabase.storage.from('store-logos').getPublicUrl(fileName);

    await supabase.from('agents').update({ store_logo_url: pub.publicUrl, updated_at: new Date().toISOString() }).eq('id', agentId);

    return NextResponse.json({ success: true, url: pub.publicUrl });
  } catch (e) {
    console.error('[upload-logo]', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
