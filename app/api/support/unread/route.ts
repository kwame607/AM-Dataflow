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
      // Admin "unresponded" count — FIXED: this used to count every
      // ticket_messages row with sender_type='agent' and is_read=false,
      // globally, with no regard for ticket status or whether the admin
      // had actually replied since. is_read only flips to true when the
      // admin's client happens to load that exact ticket's thread — so a
      // ticket that was replied to via a path that skipped re-fetching the
      // thread (or old data from before a ticket was ever opened) could
      // sit with stale unread flags forever, even after being fully
      // answered. That produced badge counts (e.g. "100 unresponded")
      // that didn't match reality.
      //
      // The fix: don't trust the is_read flag for this number at all.
      // Instead, directly check which open ticket's LATEST message was
      // sent by the agent — that can't go stale, because it's derived
      // from the actual conversation, not a flag someone has to remember
      // to update. A ticket only counts as "unresponded" if it's not
      // closed and the agent genuinely has the last word.
      const { data: openTickets } = await supabase
        .from('support_tickets')
        .select('id')
        .neq('status', 'closed');

      const ticketIds = (openTickets || []).map((t: { id: string }) => t.id);

      if (ticketIds.length > 0) {
        const { data: recentMessages } = await supabase
          .from('ticket_messages')
          .select('ticket_id, sender_type, created_at')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: false });

        const seenTickets = new Set<string>();
        let awaitingReply = 0;

        (recentMessages || []).forEach((m: { ticket_id: string; sender_type: string }) => {
          // Only the first row encountered per ticket_id is the most recent
          // one, since the query is ordered newest-first.
          if (seenTickets.has(m.ticket_id)) return;
          seenTickets.add(m.ticket_id);
          if (m.sender_type === 'agent') awaitingReply++;
        });

        msgCount = awaitingReply;
      }
    }

    // ── Total shown on the badge ──────────────────────────────────────────
    // For admin: use ONLY the ticket-based awaiting-reply count above.
    // support_notifications rows for target_type='admin' only ever get
    // marked read via the notification bell's "mark as read" actions — and
    // the admin dashboard doesn't render a bell at all, so those rows can
    // never be cleared and just accumulate forever (every single agent
    // reply ever sent adds one). Including them here was the real source
    // of a badge number that never matched "have I actually replied to
    // everyone" — it was really just counting lifetime agent-reply events,
    // not anything currently outstanding.
    // Agent side is unaffected: agents DO have a working NotificationBell,
    // so their notificationCount can genuinely be cleared and stays valid.
    const total = isAdmin ? msgCount : (notifCount || 0) + msgCount;

    return NextResponse.json({
      notificationCount: notifCount || 0,
      messageCount:      msgCount,
      total,
    });
  } catch (e) {
    console.error('[support unread]', e);
    return NextResponse.json({ notificationCount: 0, messageCount: 0, total: 0 });
  }
}
