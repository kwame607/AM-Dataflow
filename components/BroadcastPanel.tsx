// components/BroadcastPanel.tsx — NEW FILE
// Drop into the admin Settings tab. Two independent tools:
//  1. Notification broadcast — quiet, goes to each agent's bell (NotificationBell)
//  2. Urgent banner — loud, full-screen, for outages/critical announcements
'use client';

import React, { useState, useEffect } from 'react';

interface BroadcastPanelProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
}

interface BannerState {
  active: boolean;
  title?: string;
  body?: string;
}

export function BroadcastPanel({ authFetch, toast }: BroadcastPanelProps) {
  // ── Notification broadcast ──
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [audience, setAudience] = useState<'active' | 'all'>('active');
  const [sending, setSending] = useState(false);

  // ── Urgent banner ──
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerBody, setBannerBody] = useState('');
  const [savingBanner, setSavingBanner] = useState(false);
  const [loadingBanner, setLoadingBanner] = useState(true);

  useEffect(() => {
    authFetch('/api/admin/banner')
      .then(r => r.json())
      .then(d => {
        setBanner(d);
        if (d.active) { setBannerTitle(d.title || ''); setBannerBody(d.body || ''); }
      })
      .catch(() => {})
      .finally(() => setLoadingBanner(false));
  }, [authFetch]);

  async function sendBroadcast() {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast('Enter a title and message', 'warn');
      return;
    }
    setSending(true);
    try {
      const r = await authFetch('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title: notifTitle, message: notifMessage, audience }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to send', 'error'); return; }
      toast(`Sent to ${d.sent} agent${d.sent !== 1 ? 's' : ''}!`, 'success');
      setNotifTitle('');
      setNotifMessage('');
    } catch { toast('Network error', 'error'); }
    finally { setSending(false); }
  }

  async function saveBanner(activate: boolean) {
    if (activate && (!bannerTitle.trim() || !bannerBody.trim())) {
      toast('Enter a title and message for the banner', 'warn');
      return;
    }
    setSavingBanner(true);
    try {
      const r = await authFetch('/api/admin/banner', {
        method: 'PATCH',
        body: JSON.stringify(
          activate ? { title: bannerTitle, body: bannerBody, active: true } : { active: false }
        ),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to save', 'error'); return; }
      toast(activate ? 'Banner is now live!' : 'Banner turned off', 'success');
      setBanner(activate ? { active: true, title: bannerTitle, body: bannerBody } : { active: false });
    } catch { toast('Network error', 'error'); }
    finally { setSavingBanner(false); }
  }

  return (
    <>
      {/* ── Notification broadcast ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">📣 Send Notification to Agents</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Appears in each agent's notification bell — quiet, non-blocking
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              placeholder="e.g. New feature: Quick Buy is here!"
              maxLength={120}
              value={notifTitle}
              onChange={e => setNotifTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Describe the update, feature, or announcement…"
              style={{ resize: 'vertical' }}
              value={notifMessage}
              onChange={e => setNotifMessage(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Audience</label>
            <select className="form-input" value={audience} onChange={e => setAudience(e.target.value as 'active' | 'all')}>
              <option value="active">Active agents only</option>
              <option value="all">All agents (incl. pending/suspended)</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={sendBroadcast} disabled={sending}>
            {sending ? <><span className="spinner" /> Sending…</> : '📣 Send to All Agents'}
          </button>
        </div>
      </div>

      {/* ── Urgent banner ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">🚨 Urgent Site-Wide Banner</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Full-screen modal — use sparingly, for outages or critical issues only
            </div>
          </div>
          {!loadingBanner && banner?.active && (
            <span className="badge badge-success">🟢 Live</span>
          )}
        </div>
        <div className="card-body">
          {loadingBanner ? (
            <div style={{ padding: '8px 0' }}><span className="spinner" /></div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Banner Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. MTN Service Update"
                  value={bannerTitle}
                  onChange={e => setBannerTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Banner Message</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Explain what's happening and what agents/customers should expect…"
                  style={{ resize: 'vertical' }}
                  value={bannerBody}
                  onChange={e => setBannerBody(e.target.value)}
                />
                <div className="form-hint">Shown to everyone (agents, customers, admin) until dismissed. Changing the text re-shows it even to people who already dismissed the old version.</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={() => saveBanner(true)} disabled={savingBanner}>
                  {savingBanner ? <><span className="spinner" /> Publishing…</> : (banner?.active ? '🔄 Update Banner' : '🚨 Publish Banner')}
                </button>
                {banner?.active && (
                  <button
                    className="btn"
                    style={{ background: 'var(--err-dim)', color: 'var(--err)', border: '1px solid var(--err)' }}
                    onClick={() => saveBanner(false)}
                    disabled={savingBanner}
                  >
                    Turn Off Banner
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
