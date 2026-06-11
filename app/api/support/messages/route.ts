// app/api/support/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';

// ── GET — fetch messages for a ticket ────────────────────────
export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams;
  const ticketId = params.get('ticketId');
  const isAdmin  = params.get('admin') === '1';

  if (!ticketId) return NextResponse.json({ error: 'Missing ticketId' }, { status: 400 });

  if (isAdmin) {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: messages, error } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark messages as read for the viewer
    // Admin views: mark agent messages as read
    // Agent views: mark admin messages as read
    const senderToMark = isAdmin ? 'agent' : 'admin';
    const unreadIds = (messages || [])
      .filter((m: { sender_type: string; is_read: boolean }) =>
        m.sender_type === senderToMark && !m.is_read)
      .map((m: { id: string }) => m.id);

    if (unreadIds.length > 0) {
      await supabase
        .from('ticket_messages')
        .update({ is_read: true })
        .in('id', unreadIds);
    }

    // Replace admin sender info with anonymous display name
    const sanitized = (messages || []).map((m: {
      sender_type: string;
      sender_id?: string;
    } & Record<string, unknown>) => ({
      ...m,
      display_name: m.sender_type === 'admin' ? 'Admunz Support' : undefined,
      // Never expose admin sender_id to agents
      sender_id: isAdmin ? m.sender_id : (m.sender_type === 'admin' ? null : m.sender_id),
    }));

    return NextResponse.json(sanitized);
  } catch (e) {
    console.error('[support messages GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST — send a message ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body       = await req.json();
    const { ticketId, message, attachmentUrl, attachmentType, senderType, senderId } = body;

    if (!ticketId || !message || !senderType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Auth check based on sender type
    if (senderType === 'admin') {
      const auth = await requireAdmin(req);
      if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    } else {
      const auth = await requireAuth(req);
      if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify ticket exists and get details
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('*, agents!support_tickets_agent_id_fkey(id, name)')
      .eq('id', ticketId)
      .single();

    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    if (ticket.status === 'closed') {
      return NextResponse.json({ error: 'Cannot reply to a closed ticket' }, { status: 400 });
    }

    // Insert message
    const { data: msg, error: msgErr } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id:       ticketId,
        sender_type:     senderType,
        sender_id:       senderType === 'admin' ? null : senderId, // admin stays anonymous
        message,
        attachment_url:  attachmentUrl  || null,
        attachment_type: attachmentType || null,
        is_read:         false,
      })
      .select()
      .single();

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    // If admin replied, update ticket status to pending if it was open
    if (senderType === 'admin' && ticket.status === 'open') {
      await supabase
        .from('support_tickets')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', ticketId);
    }

    // If agent replied on a resolved ticket, reopen it
    if (senderType === 'agent' && ticket.status === 'resolved') {
      await supabase
        .from('support_tickets')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', ticketId);
    }

    // ── Send notifications ─────────────────────────────────
    const agentData = ticket.agents as { id: string; name: string } | null;

    if (senderType === 'admin' && agentData) {
      // Notify agent that support replied
      await supabase.from('support_notifications').insert({
        target_type: 'agent',
        agent_id:    agentData.id,
        ticket_id:   ticketId,
        title:       '💬 Admunz Support replied',
        message:     `New reply on ticket ${ticket.ticket_number}: ${message.slice(0, 80)}${message.length > 80 ? '…' : ''}`,
        is_read:     false,
      });
    }

    if (senderType === 'agent') {
      // Notify admin that agent replied
      await supabase.from('support_notifications').insert({
        target_type: 'admin',
        agent_id:    senderId || null,
        ticket_id:   ticketId,
        title:       '📩 Agent replied',
        message:     `${agentData?.name || 'Agent'} replied on ${ticket.ticket_number}: ${message.slice(0, 80)}${message.length > 80 ? '…' : ''}`,
        is_read:     false,
      });
    }

    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    console.error('[support messages POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
