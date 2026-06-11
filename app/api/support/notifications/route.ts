// app/api/support/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';

// ── GET — fetch notifications ─────────────────────────────────
export async function GET(req: NextRequest) {
  const params    = req.nextUrl.searchParams;
  const agentId   = params.get('agentId');
  const isAdmin   = params.get('admin') === '1';
  const unreadOnly = params.get('unreadOnly') === '1';

  if (isAdmin) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from('support_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (isAdmin) {
      query = query.eq('target_type', 'admin');
    } else if (agentId) {
      query = query.eq('target_type', 'agent').eq('agent_id', agentId);
    }

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Return count of unread too
    const unreadCount = (data || []).filter((n: { is_read: boolean }) => !n.is_read).length;

    return NextResponse.json({ notifications: data || [], unreadCount });
  } catch (e) {
    console.error('[support notifications GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── PATCH — mark notifications as read ───────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ids, agentId, markAllAdmin } = await req.json();
    const supabase = createSupabaseAdminClient();

    if (markAllAdmin) {
      // Mark all admin notifications read
      await supabase
        .from('support_notifications')
        .update({ is_read: true })
        .eq('target_type', 'admin')
        .eq('is_read', false);
    } else if (ids && ids.length > 0) {
      await supabase
        .from('support_notifications')
        .update({ is_read: true })
        .in('id', ids);
    } else if (agentId) {
      // Mark all for this agent read
      await supabase
        .from('support_notifications')
        .update({ is_read: true })
        .eq('agent_id', agentId)
        .eq('target_type', 'agent');
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[support notifications PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
