// app/api/agents/favorites/route.ts — NEW FILE
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';

async function verifyOwnership(supabase: ReturnType<typeof createSupabaseAdminClient>, agentId: string, userId: string) {
  const { data } = await supabase.from('agents').select('auth_user_id').eq('id', agentId).single();
  return !!data && data.auth_user_id === userId;
}

// ── GET — list an agent's favorite bundle keys ────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (!(await verifyOwnership(supabase, agentId, auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('agent_favorite_bundles')
    .select('bundle_key')
    .eq('agent_id', agentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ favorites: (data || []).map(f => f.bundle_key) });
}

// ── POST — add a favorite ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId, bundleKey } = await req.json();
    if (!agentId || !bundleKey) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    if (!(await verifyOwnership(supabase, agentId, auth.userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('agent_favorite_bundles')
      .upsert({ agent_id: agentId, bundle_key: bundleKey }, { onConflict: 'agent_id,bundle_key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[favorites POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── DELETE — remove a favorite ─────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId, bundleKey } = await req.json();
    if (!agentId || !bundleKey) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    if (!(await verifyOwnership(supabase, agentId, auth.userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('agent_favorite_bundles')
      .delete()
      .eq('agent_id', agentId)
      .eq('bundle_key', bundleKey);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[favorites DELETE]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
