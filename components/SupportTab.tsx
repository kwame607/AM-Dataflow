// components/SupportTab.tsx
// Drop this inside app/dashboard/page.tsx as a new tab
// Add 'support' to the Tab type and navItems array
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SupportTicket, TicketMessage, TicketCategory } from '@/types/support';
import { TICKET_CATEGORIES, STATUS_CONFIG, PRIORITY_CONFIG } from '@/types/support';
import { fmtDate } from '@/lib/utils';

interface SupportTabProps {
  agent: { id: string; name: string; slug: string };
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (
  msg: string,
  type?: 'warn' | 'error' | 'success' | 'info',
  duration?: number
) => void;
}

export function SupportTab({ agent, authFetch, toast }: SupportTabProps) {
  const [view, setView]               = useState<'list' | 'thread' | 'new'>('list');
  const [tickets, setTickets]         = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages]       = useState<TicketMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [sending, setSending]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [reply, setReply]             = useState('');
  const [attachmentUrl, setAttachmentUrl]   = useState('');
  const [attachmentType, setAttachmentType] = useState('');
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const pollRef   = useRef<NodeJS.Timeout | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  // ── New ticket form ───────────────────────────────────────
  const [form, setForm] = useState({
    subject: '', category: '' as TicketCategory | '',
    message: '', transactionRef: '',
  });
  const [formErr, setFormErr] = useState('');

  const loadTickets = useCallback(async () => {
    try {
      const r = await authFetch(`/api/support/tickets?agentId=${agent.id}`);
      const d = await r.json();
      setTickets(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
  }, [agent.id, authFetch]);

  const loadMessages = useCallback(async (ticketId: string) => {
    try {
      const r = await authFetch(`/api/support/messages?ticketId=${ticketId}`);
      const d = await r.json();
      setMessages(Array.isArray(d) ? d : []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { /* silent */ }
  }, [authFetch]);

  // Initial load
  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Poll every 30s when in thread view
  useEffect(() => {
    if (view === 'thread' && activeTicket) {
      pollRef.current = setInterval(() => loadMessages(activeTicket.id), 30000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view, activeTicket, loadMessages]);

  async function openTicket(ticket: SupportTicket) {
    setActiveTicket(ticket);
    setView('thread');
    setLoading(true);
    await loadMessages(ticket.id);
    setLoading(false);
    // Refresh ticket list to clear unread badge
    loadTickets();
  }

  async function submitTicket() {
    if (!form.subject.trim()) { setFormErr('Enter a subject'); return; }
    if (!form.category)       { setFormErr('Select a category'); return; }
    if (!form.message.trim()) { setFormErr('Enter a message'); return; }
    setFormErr('');
    setSending(true);
    try {
      const r = await authFetch('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          agentId:              agent.id,
          subject:              form.subject,
          category:             form.category,
          message:              form.message,
          transactionReference: form.transactionRef || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to create ticket', 'error'); return; }
      toast(`Ticket ${d.ticket.ticket_number} created!`, 'success');
      setForm({ subject: '', category: '', message: '', transactionRef: '' });
      await loadTickets();
      openTicket(d.ticket);
    } catch { toast('Network error', 'error'); }
    finally { setSending(false); }
  }

  async function sendReply() {
    if (!reply.trim() && !attachmentUrl) return;
    if (!activeTicket) return;
    setSending(true);
    try {
      const r = await authFetch('/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          ticketId:       activeTicket.id,
          message:        reply.trim() || '📎 Attachment',
          senderType:     'agent',
          senderId:       agent.id,
          attachmentUrl:  attachmentUrl  || undefined,
          attachmentType: attachmentType || undefined,
        }),
      });
      if (!r.ok) { toast('Failed to send', 'error'); return; }
      setReply('');
      setAttachmentUrl('');
      setAttachmentType('');
      setPreviewFile(null);
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
      setAttachmentUrl(d.url);
      setAttachmentType(d.attachmentType);
      setPreviewFile(d.attachmentType === 'image' ? d.url : null);
      toast('File attached!', 'success');
    } catch { toast('Upload error', 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const filteredTickets = tickets.filter(t => {
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchSearch = !search || t.ticket_number.toLowerCase().includes(search.toLowerCase())
      || t.subject.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalUnread = tickets.reduce((s, t) => s + (t.unread_count || 0), 0);

  // ── STATUS BADGE ──────────────────────────────────────────
  function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
    if (!cfg) return null;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 100,
        fontSize: 11, fontWeight: 700,
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      }}>{cfg.label}</span>
    );
  }

  // ── TICKET LIST ───────────────────────────────────────────
  if (view === 'list') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Support Center</div>
          <div className="page-subtitle">Get help from Admunz Support</div>
        </div>
        <button className="btn btn-primary" onClick={() => setView('new')}>
          + New Ticket
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
        {(['all','open','pending','resolved','closed'] as const).map(s => {
          const count = s === 'all' ? tickets.length : tickets.filter(t => t.status === s).length;
          const cfg   = s === 'all' ? null : STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              background: statusFilter === s ? (cfg?.bg || 'var(--accent-dim)') : 'var(--surface)',
              border: `1px solid ${statusFilter === s ? (cfg?.border || 'rgba(0,212,170,0.3)') : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '12px 14px',
              textAlign: 'left', cursor: 'pointer', transition: 'all .2s',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: cfg?.color || 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
              </div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: cfg?.color || 'var(--accent)' }}>{count}</div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          placeholder="🔍 Search tickets by number or subject…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Ticket list */}
      <div className="card">
        {filteredTickets.length === 0
          ? (
            <div className="empty" style={{ padding: '48px 20px' }}>
              <div className="empty-icon">🎫</div>
              <div className="empty-title">No tickets found</div>
              <div className="empty-text">Create a new ticket to get support</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setView('new')}>
                Create Ticket
              </button>
            </div>
          )
          : filteredTickets.map(ticket => (
            <button key={ticket.id} onClick={() => openTicket(ticket)} style={{
              width: '100%', background: ticket.unread_count ? 'rgba(0,212,170,0.03)' : 'none',
              border: 'none', borderBottom: '1px solid var(--border)',
              padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{ticket.ticket_number}</span>
                  <StatusBadge status={ticket.status} />
                  {(ticket.unread_count || 0) > 0 && (
                    <span style={{ background: 'var(--accent)', color: '#060910', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>
                      {ticket.unread_count} new
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ticket.category} · {fmtDate(ticket.last_message_at)}</div>
              </div>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          ))
        }
      </div>
    </div>
  );

  // ── NEW TICKET FORM ───────────────────────────────────────
  if (view === 'new') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setView('list')}>← Back</button>
        <div>
          <div className="page-title">New Support Ticket</div>
          <div className="page-subtitle">Describe your issue and our team will respond shortly</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 580 }}>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Subject <span style={{ color: 'var(--err)' }}>*</span></label>
            <input className="form-input" placeholder="Brief description of your issue"
              value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Category <span style={{ color: 'var(--err)' }}>*</span></label>
            <select className="form-input" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as TicketCategory }))}>
              <option value="">Select a category…</option>
              {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Transaction Reference <span style={{ color: 'var(--text3)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input className="form-input" placeholder="e.g. DF-MPV5REL5-06MHHV"
              value={form.transactionRef} onChange={e => setForm(f => ({ ...f, transactionRef: e.target.value }))} />
            <div className="form-hint">Attach a transaction reference to speed up resolution</div>
          </div>

          <div className="form-group">
            <label className="form-label">Message <span style={{ color: 'var(--err)' }}>*</span></label>
            <textarea className="form-input" rows={5} placeholder="Describe your issue in detail…"
              style={{ resize: 'vertical' }}
              value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
          </div>

          {formErr && <div className="alert alert-error" style={{ marginBottom: 14 }}><span>⚠</span><span>{formErr}</span></div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitTicket} disabled={sending}>
              {sending ? <><span className="spinner" /> Creating…</> : '🎫 Submit Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── TICKET THREAD ─────────────────────────────────────────
  if (view === 'thread' && activeTicket) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', maxHeight: 800 }}>
      {/* Thread header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setView('list'); loadTickets(); }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{activeTicket.ticket_number}</span>
            <StatusBadge status={activeTicket.status} />
            {activeTicket.priority !== 'normal' && (
              <span style={{ fontSize: 11, color: PRIORITY_CONFIG[activeTicket.priority]?.color }}>{PRIORITY_CONFIG[activeTicket.priority]?.label} Priority</span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTicket.subject}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{activeTicket.category}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
        {loading
          ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}><span className="spinner" style={{ margin: '0 auto' }} /></div>
          : messages.map(msg => {
            const isAgent = msg.sender_type === 'agent';
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textAlign: isAgent ? 'right' : 'left' }}>
                    <strong style={{ color: isAgent ? 'var(--accent)' : '#7dd3fc' }}>
                      {isAgent ? agent.name : 'Admunz Support'}
                    </strong>
                    {' · '}{fmtDate(msg.created_at)}
                  </div>
                  <div style={{
                    background: isAgent ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: `1px solid ${isAgent ? 'rgba(0,212,170,0.25)' : 'var(--border)'}`,
                    borderRadius: isAgent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
                    color: 'var(--text)',
                  }}>
                    {msg.message}
                    {msg.attachment_url && msg.attachment_type === 'image' && (
                      <img src={msg.attachment_url} alt="attachment"
                        style={{ display: 'block', marginTop: 8, maxWidth: '100%', maxHeight: 200, borderRadius: 8, cursor: 'pointer' }}
                        onClick={() => window.open(msg.attachment_url, '_blank')}
                      />
                    )}
                    {msg.attachment_url && msg.attachment_type === 'file' && (
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
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
        <div style={{ flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
          {previewFile && (
            <div style={{ marginBottom: 10, position: 'relative', display: 'inline-block' }}>
              <img src={previewFile} alt="preview" style={{ height: 80, borderRadius: 8, border: '1px solid var(--border)' }} />
              <button onClick={() => { setPreviewFile(null); setAttachmentUrl(''); setAttachmentType(''); }}
                style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: 'var(--err)', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          )}
          {attachmentUrl && attachmentType === 'file' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--accent)' }}>
              📎 File attached
              <button onClick={() => { setAttachmentUrl(''); setAttachmentType(''); }} style={{ marginLeft: 8, color: 'var(--err)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>Remove</button>
            </div>
          )}
          <textarea
            className="form-input"
            rows={3}
            placeholder="Type your reply…"
            style={{ resize: 'none', marginBottom: 10 }}
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) sendReply(); }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Uploading…</> : '📎 Attach'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={sendReply} disabled={sending || (!reply.trim() && !attachmentUrl)}>
              {sending ? <><span className="spinner" /> Sending…</> : 'Send Reply'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Ctrl+Enter to send</div>
        </div>
      ) : (
        <div style={{ flexShrink: 0, padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
          🔒 This ticket is closed. Create a new ticket if you need further help.
        </div>
      )}
    </div>
  );

  return null;
}
