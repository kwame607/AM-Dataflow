// app/api/support/unread/route.ts
// Lightweight polling endpoint — called every 30s to check for new messages/notifications
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const agentId = params.get('agentId');
  const isAdmin = params.get('admin') === '1';

  if (isAdmin) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Count unread notifications
    let notifQuery = supabase
      .from('support_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);

    if (isAdmin) {
      notifQuery = notifQuery.eq('target_type', 'admin');
    } else if (agentId) {
      notifQuery = notifQuery.eq('target_type', 'agent').eq('agent_id', agentId);
    }

    const { count: notifCount } = await notifQuery;

    // Count unread messages in open tickets
    let msgCount = 0;
    if (agentId && !isAdmin) {
      // Get agent's ticket IDs
      const { data: agentTickets } = await supabase
        .from('support_tickets')
        .select('id')
        .eq('agent_id', agentId)
        .not('status', 'eq', 'closed');

      const ticketIds = (agentTickets || []).map((t: { id: string }) => t.id);
      if (ticketIds.length > 0) {
        const { count } = await supabase
          .from('ticket_messages')
          .select('id', { count: 'exact', head: true })
          .in('ticket_id', ticketIds)
          .eq('sender_type', 'admin')
          .eq('is_read', false);
        msgCount = count || 0;
      }
    } else if (isAdmin) {
      // Admin: count unread agent messages across all open tickets
      const { count } = await supabase
        .from('ticket_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_type', 'agent')
        .eq('is_read', false);
      msgCount = count || 0;
    }

    return NextResponse.json({
      notificationCount: notifCount || 0,
      messageCount:      msgCount,
      total:             (notifCount || 0) + msgCount,
    });
  } catch (e) {
    console.error('[support unread]', e);
    return NextResponse.json({ notificationCount: 0, messageCount: 0, total: 0 });
  }
}
