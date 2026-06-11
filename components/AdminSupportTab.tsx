// components/AdminSupportTab.tsx
// Drop inside app/xena-173424/page.tsx as a new tab
// Add 'support' to Tab type and navItems
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SupportTicket, TicketMessage, TicketStatus, TicketPriority } from '@/types/support';
import { TICKET_CATEGORIES, STATUS_CONFIG, PRIORITY_CONFIG } from '@/types/support';
import { fmtDate } from '@/lib/utils';

interface AdminSupportTabProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (
  msg: string,
  type?: 'error' | 'success' | 'info' | 'warn',
  duration?: number
) => void;
}

export function AdminSupportTab({ authFetch, toast }: AdminSupportTabProps) {
  const [view, setView]             = useState<'list' | 'thread'>('list');
  const [tickets, setTickets]       = useState<SupportTicket[]>([]);
  const [activeTicket, setActive]   = useState<SupportTicket | null>(null);
  const [messages, setMessages]     = useState<TicketMessage[]>([]);
  const [statusFilter, setStatus]   = useState('all');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [reply, setReply]           = useState('');
  const [attachmentUrl, setAttUrl]  = useState('');
  const [attachmentType, setAttType]= useState('');
  const [previewFile, setPreview]   = useState<string | null>(null);
  const pollRef  = useRef<NodeJS.Timeout | null>(null);
  const bottomRef= useRef<HTMLDivElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  const loadTickets = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ admin: '1' });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (search) qs.set('search', search);
      const r = await authFetch(`/api/support/tickets?${qs}`);
      const d = await r.json();
      setTickets(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
  }, [authFetch, statusFilter, search]);

  const loadMessages = useCallback(async (ticketId: string) => {
    try {
      const r = await authFetch(`/api/support/messages?ticketId=${ticketId}&admin=1`);
      const d = await r.json();
      setMessages(Array.isArray(d) ? d : []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { /* silent */ }
  }, [authFetch]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (view === 'thread' && activeTicket) {
      pollRef.current = setInterval(() => loadMessages(activeTicket.id), 30000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view, activeTicket, loadMessages]);

  async function openTicket(ticket: SupportTicket) {
    setActive(ticket);
    setView('thread');
    setLoading(true);
    await loadMessages(ticket.id);
    setLoading(false);
    loadTickets();
  }

  async function updateTicket(ticketId: string, updates: { status?: string; priority?: string }) {
    try {
      const r = await authFetch('/api/support/tickets', {
        method: 'PATCH',
        body:   JSON.stringify({ ticketId, ...updates }),
      });
      if (!r.ok) { toast('Update failed', 'error'); return; }
      toast('Ticket updated', 'success');
      // Refresh active ticket
      const updated = tickets.find(t => t.id === ticketId);
      if (updated && activeTicket?.id === ticketId) {
        setActive({ ...updated, ...updates } as SupportTicket);
      }
      loadTickets();
    } catch { toast('Network error', 'error'); }
  }

  async function sendReply() {
    if (!reply.trim() && !attachmentUrl) return;
    if (!activeTicket) return;
    setSending(true);
    try {
      const r = await authFetch('/api/support/messages', {
        method: 'POST',
        body:   JSON.stringify({
          ticketId:       activeTicket.id,
          message:        reply.trim() || '📎 Attachment',
          senderType:     'admin',
          attachmentUrl:  attachmentUrl  || undefined,
          attachmentType: attachmentType || undefined,
        }),
      });
      if (!r.ok) { toast('Failed to send', 'error'); return; }
      setReply('');
      setAttUrl('');
      setAttType('');
      setPreview(null);
      await loadMessages(activeTicket.id);
      loadTickets();
    } catch { toast('Network error', 'error'); }
    finally { setSending(false); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeTicket) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ticketId', activeTicket.id);
      const r = await authFetch('/api/support/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Upload failed', 'error'); return; }
      setAttUrl(d.url);
      setAttType(d.attachmentType);
      setPreview(d.attachmentType === 'image' ? d.url : null);
      toast('File attached!', 'success');
    } catch { toast('Upload error', 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const totalUnread = tickets.reduce((s, t) => s + (t.unread_count || 0), 0);

  function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
    if (!cfg) return null;
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:100, fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>
        {cfg.label}
      </span>
    );
  }

  const statusCounts = {
    all:      tickets.length,
    open:     tickets.filter(t => t.status === 'open').length,
    pending:  tickets.filter(t => t.status === 'pending').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed:   tickets.filter(t => t.status === 'closed').length,
  };

  // ── LIST VIEW ─────────────────────────────────────────────
  if (view === 'list') return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div className="page-title">Support Management</div>
          <div className="page-subtitle">Manage agent support tickets</div>
        </div>
        {totalUnread > 0 && (
          <span style={{ background:'var(--err)', color:'#fff', fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:800, padding:'6px 14px', borderRadius:100 }}>
            {totalUnread} unread
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10, marginBottom:20 }}>
        {(['all','open','pending','resolved','closed'] as const).map(s => {
          const cfg = s === 'all' ? null : STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setStatus(s)} style={{
              background: statusFilter===s ? (cfg?.bg||'var(--accent-dim)') : 'var(--surface)',
              border:`1px solid ${statusFilter===s ? (cfg?.border||'rgba(0,212,170,0.3)') : 'var(--border)'}`,
              borderRadius:'var(--radius)', padding:'12px 14px',
              textAlign:'left', cursor:'pointer', transition:'all .2s',
            }}>
              <div style={{ fontSize:10, fontWeight:700, color:cfg?.color||'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
                {s==='all'?'All':STATUS_CONFIG[s].label}
              </div>
              <div style={{ fontFamily:'Syne,sans-serif', fontSize:22, fontWeight:800, color:cfg?.color||'var(--accent)' }}>
                {statusCounts[s]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom:16 }}>
        <input className="form-input"
          placeholder="🔍 Search by agent name, ticket number or transaction ref…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        {tickets.length === 0
          ? <div className="empty"><div className="empty-icon">🎫</div><div className="empty-title">No tickets found</div></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Agent</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Last Activity</th>
                    <th>Unread</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.id} onClick={() => openTicket(t)} style={{ cursor:'pointer' }}>
                      <td>
                        <div style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent)', fontWeight:700 }}>{t.ticket_number}</div>
                        <div style={{ fontSize:12, color:'var(--text2)', marginTop:2, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.subject}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{t.agent_name}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>/store/{t.agent_slug}</div>
                      </td>
                      <td><span style={{ fontSize:12, color:'var(--text2)' }}>{t.category}</span></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>
                        <span style={{ fontSize:12, color:PRIORITY_CONFIG[t.priority as TicketPriority]?.color||'var(--text3)', fontWeight:600 }}>
                          {PRIORITY_CONFIG[t.priority as TicketPriority]?.label||t.priority}
                        </span>
                      </td>
                      <td style={{ fontSize:12, color:'var(--text3)', whiteSpace:'nowrap' }}>{fmtDate(t.last_message_at)}</td>
                      <td>
                        {(t.unread_count||0) > 0
                          ? <span style={{ background:'var(--err)', color:'#fff', fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:100 }}>{t.unread_count}</span>
                          : <span style={{ color:'var(--text3)', fontSize:12 }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  );

  // ── THREAD VIEW ───────────────────────────────────────────
  if (view === 'thread' && activeTicket) return (
    <div style={{ display:'flex', gap:16, height:'calc(100vh - 140px)', maxHeight:800 }}>

      {/* Left: conversation */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, flexShrink:0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setView('list'); loadTickets(); }}>← Back</button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent)', fontWeight:700 }}>{activeTicket.ticket_number}</span>
              <StatusBadge status={activeTicket.status} />
              <span style={{ fontSize:11, color:PRIORITY_CONFIG[activeTicket.priority as TicketPriority]?.color }}>{PRIORITY_CONFIG[activeTicket.priority as TicketPriority]?.label} Priority</span>
            </div>
            <div style={{ fontWeight:700, fontSize:14, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeTicket.subject}</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{activeTicket.agent_name} · {activeTicket.category}</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, paddingBottom:12 }}>
          {loading
            ? <div style={{ textAlign:'center', padding:40 }}><span className="spinner" style={{ margin:'0 auto' }} /></div>
            : messages.map(msg => {
              const isAdmin = msg.sender_type === 'admin';
              return (
                <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems:isAdmin ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth:'80%' }}>
                    <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textAlign:isAdmin?'right':'left' }}>
                      <strong style={{ color:isAdmin?'var(--accent)':'#7dd3fc' }}>
                        {isAdmin ? 'Admunz Support' : activeTicket.agent_name}
                      </strong>
                      {' · '}{fmtDate(msg.created_at)}
                      {!msg.is_read && !isAdmin && <span style={{ marginLeft:6, fontSize:10, color:'var(--warn)' }}>● unread</span>}
                    </div>
                    <div style={{
                      background: isAdmin ? 'var(--accent-dim)' : 'var(--surface2)',
                      border:`1px solid ${isAdmin?'rgba(0,212,170,0.25)':'var(--border)'}`,
                      borderRadius: isAdmin?'16px 16px 4px 16px':'16px 16px 16px 4px',
                      padding:'10px 14px', fontSize:13, lineHeight:1.6,
                    }}>
                      {msg.message}
                      {msg.attachment_url && msg.attachment_type==='image' && (
                        <img src={msg.attachment_url} alt="attachment"
                          style={{ display:'block', marginTop:8, maxWidth:'100%', maxHeight:200, borderRadius:8, cursor:'pointer' }}
                          onClick={() => window.open(msg.attachment_url, '_blank')}
                        />
                      )}
                      {msg.attachment_url && msg.attachment_type==='file' && (
                        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                          style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:8, color:'var(--accent)', fontSize:12, fontWeight:600 }}>
                          📎 View Attachment
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          }
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        {activeTicket.status !== 'closed' ? (
          <div style={{ flexShrink:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:14 }}>
            {previewFile && (
              <div style={{ marginBottom:10, position:'relative', display:'inline-block' }}>
                <img src={previewFile} alt="preview" style={{ height:80, borderRadius:8, border:'1px solid var(--border)' }} />
                <button onClick={() => { setPreview(null); setAttUrl(''); setAttType(''); }}
                  style={{ position:'absolute', top:-8, right:-8, width:22, height:22, borderRadius:'50%', background:'var(--err)', color:'#fff', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer' }}>✕</button>
              </div>
            )}
            {attachmentUrl && attachmentType==='file' && (
              <div style={{ marginBottom:10, fontSize:12, color:'var(--accent)' }}>
                📎 File attached
                <button onClick={() => { setAttUrl(''); setAttType(''); }} style={{ marginLeft:8, color:'var(--err)', background:'none', border:'none', cursor:'pointer', fontSize:11 }}>Remove</button>
              </div>
            )}
            <textarea className="form-input" rows={3}
              placeholder="Reply as Admunz Support…"
              style={{ resize:'none', marginBottom:10 }}
              value={reply} onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && e.ctrlKey) sendReply(); }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={handleFileUpload} />
              <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <><span className="spinner" style={{ width:14,height:14 }} /> Uploading…</> : '📎 Attach'}
              </button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={sendReply} disabled={sending||(!reply.trim()&&!attachmentUrl)}>
                {sending ? <><span className="spinner" /> Sending…</> : 'Send as Admunz Support'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flexShrink:0, padding:'12px 16px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:13, color:'var(--text3)', textAlign:'center' }}>
            🔒 Ticket is closed
          </div>
        )}
      </div>

      {/* Right: ticket info panel */}
      <div style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ fontSize:13 }}>Ticket Details</div></div>
          <div className="card-body" style={{ fontSize:12, display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { label:'Ticket #',  val: activeTicket.ticket_number },
              { label:'Agent',     val: activeTicket.agent_name || '—' },
              { label:'Category',  val: activeTicket.category },
              { label:'Created',   val: fmtDate(activeTicket.created_at) },
              ...(activeTicket.transaction_reference ? [{ label:'Transaction', val: activeTicket.transaction_reference }] : []),
            ].map(r => (
              <div key={r.label}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{r.label}</div>
                <div style={{ fontWeight:600, color:'var(--text)', wordBreak:'break-all' }}>{r.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Status control */}
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ fontSize:13 }}>Update Status</div></div>
          <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(['open','pending','resolved','closed'] as TicketStatus[]).map(s => {
              const cfg = STATUS_CONFIG[s];
              const isActive = activeTicket.status === s;
              return (
                <button key={s} onClick={() => updateTicket(activeTicket.id, { status: s })} style={{
                  padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600,
                  background: isActive ? cfg.bg : 'var(--surface2)',
                  border:`1px solid ${isActive ? cfg.border : 'var(--border)'}`,
                  color: isActive ? cfg.color : 'var(--text3)',
                  cursor: isActive ? 'default' : 'pointer',
                  transition:'all .2s',
                }}>
                  {isActive ? '● ' : ''}{cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority control */}
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ fontSize:13 }}>Priority</div></div>
          <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(['low','normal','high','urgent'] as TicketPriority[]).map(p => {
              const cfg = PRIORITY_CONFIG[p];
              const isActive = activeTicket.priority === p;
              return (
                <button key={p} onClick={() => updateTicket(activeTicket.id, { priority: p })} style={{
                  padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600,
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'var(--surface2)',
                  border:`1px solid ${isActive ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`,
                  color: isActive ? cfg.color : 'var(--text3)',
                  cursor: isActive ? 'default' : 'pointer',
                }}>
                  {isActive ? '● ' : ''}{cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
