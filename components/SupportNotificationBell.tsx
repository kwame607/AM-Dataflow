// components/SupportNotificationBell.tsx
// Drop this in your topbar for both agent dashboard and admin dashboard
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SupportNotification } from '@/types/support';
import { fmtDate } from '@/lib/utils';

interface NotificationBellProps {
  authFetch:   (url: string, options?: RequestInit) => Promise<Response>;
  agentId?:    string;  // pass for agent dashboard
  isAdmin?:    boolean; // pass true for admin dashboard
  onOpenTicket?: (ticketId: string) => void; // callback to open ticket thread
}

export function NotificationBell({ authFetch, agentId, isAdmin, onOpenTicket }: NotificationBellProps) {
  const [open, setOpen]           = useState(false);
  const [notifications, setNotifs]= useState<SupportNotification[]>([]);
  const [unreadCount, setUnread]  = useState(0);
  const dropRef                   = useRef<HTMLDivElement>(null);
  const pollRef                   = useRef<NodeJS.Timeout | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (isAdmin)       qs.set('admin', '1');
      if (agentId)       qs.set('agentId', agentId);
      const r = await authFetch(`/api/support/unread?${qs}`);
      const d = await r.json();
      setUnread(d.total || 0);
    } catch { /* silent */ }
  }, [authFetch, isAdmin, agentId]);

  const fetchNotifications = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (isAdmin)  qs.set('admin', '1');
      if (agentId)  qs.set('agentId', agentId);
      const r = await authFetch(`/api/support/notifications?${qs}`);
      const d = await r.json();
      setNotifs(d.notifications || []);
      setUnread(d.unreadCount   || 0);
    } catch { /* silent */ }
  }, [authFetch, isAdmin, agentId]);

  // Poll every 30s for unread count
  useEffect(() => {
    fetchUnread();
    pollRef.current = setInterval(fetchUnread, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchUnread]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function openDropdown() {
    if (!open) await fetchNotifications();
    setOpen(v => !v);
  }

  async function markAllRead() {
    try {
      await authFetch('/api/support/notifications', {
        method: 'PATCH',
        body:   JSON.stringify(isAdmin ? { markAllAdmin: true } : { agentId }),
      });
      setNotifs(ns => ns.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch { /* silent */ }
  }

  async function markOneRead(id: string) {
    try {
      await authFetch('/api/support/notifications', {
        method: 'PATCH',
        body:   JSON.stringify({ ids: [id] }),
      });
      setNotifs(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnread(v => Math.max(0, v - 1));
    } catch { /* silent */ }
  }

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={openDropdown}
        style={{
          width: 38, height: 38, borderRadius: 10,
          background:  'var(--surface2)',
          border:      '1px solid var(--border)',
          display:     'flex', alignItems: 'center', justifyContent: 'center',
          cursor:      'pointer', position: 'relative', color: 'var(--text2)',
          transition:  'all .2s',
        }}
      >
        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: 'var(--err)', color: '#fff',
            fontSize: 9, fontWeight: 800,
            width: 18, height: 18, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, zIndex: 500,
          width: 340, maxHeight: 480, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          animation: 'popIn .2s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
          }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700 }}>
              Support Notifications
              {unreadCount > 0 && (
                <span style={{ marginLeft: 8, background: 'var(--err)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={async () => {
                  if (!n.is_read) await markOneRead(n.id);
                  if (n.ticket_id && onOpenTicket) onOpenTicket(n.ticket_id);
                  setOpen(false);
                }}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: n.ticket_id ? 'pointer' : 'default',
                  background: n.is_read ? 'transparent' : 'rgba(0,212,170,0.04)',
                  transition: 'background .2s',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseOut={e  => (e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(0,212,170,0.04)')}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: n.is_read ? 'transparent' : 'var(--accent)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: 'var(--text)', marginBottom: 3 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{fmtDate(n.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
