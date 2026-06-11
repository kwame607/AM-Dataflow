// components/ReportIssueButton.tsx
// Add this to any order/transaction page to auto-create a linked support ticket
'use client';

import React, { useState } from 'react';
import { TICKET_CATEGORIES } from '@/types/support';

interface ReportIssueButtonProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: string) => void;
  agentId:   string;
  order: {
    reference:       string;
    network:         string;
    size:            string;
    agent_price?:    number;
    delivery_status?: string;
  };
  onTicketCreated?: (ticketId: string, ticketNumber: string) => void;
}

export function ReportIssueButton({ authFetch, toast, agentId, order, onTicketCreated }: ReportIssueButtonProps) {
  const [open, setOpen]       = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Failed Data Delivery');

  async function submit() {
    if (!message.trim()) { toast('Enter a message describing your issue', 'warn'); return; }
    setSending(true);
    try {
      const subject = `Issue with order ${order.reference}`;
      const fullMessage =
        `**Order Details:**\n` +
        `- Reference: ${order.reference}\n` +
        `- Network: ${order.network?.toUpperCase()}\n` +
        `- Bundle: ${order.size}\n` +
        `${order.agent_price ? `- Amount: GHS ${order.agent_price.toFixed(2)}\n` : ''}` +
        `- Delivery Status: ${order.delivery_status || 'unknown'}\n\n` +
        `**Issue Description:**\n${message}`;

      const r = await authFetch('/api/support/tickets', {
        method: 'POST',
        body:   JSON.stringify({
          agentId,
          subject,
          category,
          message:              fullMessage,
          transactionReference: order.reference,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to create ticket', 'error'); return; }
      toast(`Ticket ${d.ticket.ticket_number} created! Support will respond shortly.`, 'success');
      setOpen(false);
      setMessage('');
      if (onTicketCreated) onTicketCreated(d.ticket.id, d.ticket.ticket_number);
    } catch { toast('Network error', 'error'); }
    finally { setSending(false); }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="btn btn-sm"
        style={{ background: 'var(--err-dim)', border: '1px solid rgba(244,63,94,0.3)', color: '#fda4af' }}
      >
        🚨 Report Issue
      </button>

      {/* Modal */}
      {open && (
        <div className="modal open" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="modal-title" style={{ margin: 0 }}>Report an Issue</div>
              <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Auto-filled order info */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Linked Order
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                <div><span style={{ color: 'var(--text3)' }}>Ref: </span><span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace' }}>{order.reference}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Network: </span><span style={{ fontWeight: 600 }}>{order.network?.toUpperCase()}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Bundle: </span><span style={{ fontWeight: 600 }}>{order.size}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Delivery: </span><span style={{ fontWeight: 600, color: order.delivery_status === 'delivered' ? 'var(--ok)' : 'var(--warn)' }}>{order.delivery_status || 'pending'}</span></div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Issue Category</label>
              <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Describe the Issue</label>
              <textarea
                className="form-input" rows={4}
                placeholder="e.g. My customer made payment but data was not delivered after 2 hours…"
                style={{ resize: 'vertical' }}
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={sending}>
                {sending ? <><span className="spinner" /> Submitting…</> : '🎫 Submit Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
