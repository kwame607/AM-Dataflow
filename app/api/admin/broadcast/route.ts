// app/api/admin/broadcast/route.ts — NEW FILE
// Sends a notification to every agent at once. Reuses the existing
// support_notifications table/NotificationBell pipeline — no new
// polling or UI needed on the agent side.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { title, message, audience } = await req.json();

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Missing title or message' }, { status: 400 });
    }
    if (title.length > 120) {
      return NextResponse.json({ error: 'Title too long (max 120 chars)' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // audience: 'active' (default) or 'all' (includes pending/suspended)
    let query = supabase.from('agents').select('id');
    if (audience !== 'all') query = query.eq('status', 'active');

    const { data: agents, error: agentsErr } = await query;
    if (agentsErr) return NextResponse.json({ error: agentsErr.message }, { status: 500 });
    if (!agents || agents.length === 0) {
      return NextResponse.json({ error: 'No matching agents to notify' }, { status: 400 });
    }

    const rows = agents.map(a => ({
      target_type: 'agent' as const,
      agent_id: a.id,
      ticket_id: null,
      title: title.trim(),
      message: message.trim(),
      is_read: false,
    }));

    // Insert in chunks to stay well under any request-size limits
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('support_notifications').insert(rows.slice(i, i + CHUNK));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sent: rows.length });
  } catch (e) {
    console.error('[admin broadcast]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
