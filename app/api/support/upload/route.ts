// app/api/support/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData  = await req.formData();
    const file      = formData.get('file') as File;
    const ticketId  = formData.get('ticketId') as string;

    if (!file || !ticketId) {
      return NextResponse.json({ error: 'Missing file or ticketId' }, { status: 400 });
    }

    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed. Use JPG, PNG, WEBP or PDF.' }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 });
    }

    const supabase  = createSupabaseAdminClient();
    const ext       = file.name.split('.').pop();
    const fileName  = `${ticketId}/${Date.now()}.${ext}`;
    const bytes     = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from('support-attachments')
      .upload(fileName, bytes, {
        contentType:  file.type,
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadErr) {
      console.error('[support upload]', uploadErr);
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    // Get signed URL (valid 7 days — refreshed on each view)
    const { data: signed } = await supabase.storage
      .from('support-attachments')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);

    const attachmentType = file.type.startsWith('image/') ? 'image' : 'file';

    return NextResponse.json({
      success:        true,
      url:            signed?.signedUrl || '',
      path:           fileName,
      attachmentType,
    });
  } catch (e) {
    console.error('[support upload]', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
