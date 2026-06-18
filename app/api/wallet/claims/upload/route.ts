// app/api/wallet/claims/upload/route.ts — NEW FILE
// Mirrors app/api/support/upload/route.ts pattern but targets a
// dedicated 'deposit-proofs' storage bucket.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file     = formData.get('file') as File;
    const agentId  = formData.get('agentId') as string;

    if (!file || !agentId) {
      return NextResponse.json({ error: 'Missing file or agentId' }, { status: 400 });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed. Use JPG, PNG, or WEBP.' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: agentRow } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ext      = file.name.split('.').pop();
    const fileName = `${agentId}/${Date.now()}.${ext}`;
    const bytes    = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from('deposit-proofs')
      .upload(fileName, bytes, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr) {
      console.error('[wallet claim upload]', uploadErr);
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: signed } = await supabase.storage
      .from('deposit-proofs')
      .createSignedUrl(fileName, 60 * 60 * 24 * 30); // 30 days

    return NextResponse.json({ success: true, url: signed?.signedUrl || '', path: fileName });
  } catch (e) {
    console.error('[wallet claim upload]', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
