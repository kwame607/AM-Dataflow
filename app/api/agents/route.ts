import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, status } = await req.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('agents')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, authUserId } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    await supabase.from('agents').delete().eq('id', id);

    if (authUserId) {
      await supabase.auth.admin.deleteUser(authUserId);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
