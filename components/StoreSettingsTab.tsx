// components/StoreSettingsTab.tsx — NEW FILE
// Replaces/extends the old 'store' tab content in app/dashboard/page.tsx.
// Drop this in alongside the existing My Store tab logic, or swap it in
// directly — it covers everything the old tab did (link, QR, share) plus
// new customization options (banner text, color, network toggles, flyer mode link).
'use client';

import React, { useState } from 'react';

interface StoreSettingsTabProps {
  agent: {
    id: string; name: string; slug: string;
    store_banner_text?: string;
    store_color?: string;
    show_mtn?: boolean;
    show_at?: boolean;
    show_telecel?: boolean;
  };
  hasPrices: boolean;
  siteUrl: string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
  onGoToPrices: () => void;
  onAgentUpdate?: () => void;
}

const PRESET_COLORS = ['#00d4aa', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];

export function StoreSettingsTab({ agent, hasPrices, siteUrl, authFetch, toast, onGoToPrices, onAgentUpdate }: StoreSettingsTabProps) {
  const [bannerText, setBannerText] = useState(agent.store_banner_text || '');
  const [color, setColor]           = useState(agent.store_color || '#00d4aa');
  const [showMtn, setShowMtn]       = useState(agent.show_mtn !== false);
  const [showAt, setShowAt]         = useState(agent.show_at !== false);
  const [showTelecel, setShowTelecel] = useState(agent.show_telecel !== false);
  const [saving, setSaving]         = useState(false);

  const storeUrl = `${siteUrl}/store/${agent.slug}`;
  const flyerUrl = `${storeUrl}?flyer=1`;

  async function saveSettings() {
    setSaving(true);
    try {
      const r = await authFetch('/api/agents/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          agentId: agent.id,
          storeBannerText: bannerText,
          storeColor: color,
          showMtn, showAt, showTelecel,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to save', 'error'); return; }
      toast('Store settings saved!', 'success');
      onAgentUpdate?.();
    } catch { toast('Network error', 'error'); }
    finally { setSaving(false); }
  }

  if (!hasPrices) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Store Link Locked</div>
        <div style={{ fontSize: 14, color: 'var(--text3)', maxWidth: 320, margin: '0 auto 28px', lineHeight: 1.6 }}>
          You need to <strong style={{ color: 'var(--text)' }}>set your prices</strong> before your store goes live.
        </div>
        <button className="btn btn-primary" onClick={onGoToPrices}>Set My Prices Now →</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">My Store</div>
        <div className="page-subtitle">Share, customize, and screenshot your flyer-style storefront</div>
      </div>

      {/* Link + Share */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Store Link</div></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="copy-box">
            <span className="copy-url">{storeUrl}</span>
            <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(storeUrl); toast('Copied!', 'success', 1500); }}>Copy</button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Buy data bundles from my store: ${storeUrl}`)}`}
              className="btn btn-sm"
              style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }}
              target="_blank" rel="noopener noreferrer"
            >
              💬 Share on WhatsApp
            </a>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(storeUrl)}&bgcolor=0d1117&color=00d4aa&margin=10`}
              download="store-qr.png"
              className="btn btn-secondary btn-sm"
            >
              ⬇ Download QR
            </a>
            <a
              href={flyerUrl}
              target="_blank" rel="noopener noreferrer"
              className="btn btn-sm"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                color: '#fff',
                border: 'none',
              }}
            >
              📸 Screenshot Flyer
            </a>
          </div>

          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(storeUrl)}&bgcolor=0d1117&color=00d4aa&margin=10`}
              alt="Store QR Code"
              style={{ width: 160, height: 160, margin: '0 auto 8px', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }}
            />
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Scan to visit your store</div>
          </div>
        </div>
      </div>

      {/* ── BIG FLYER CTA ── agents must not miss this ── */}
      <a
        href={flyerUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          textDecoration: 'none',
          marginBottom: 16,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, #1a0533 0%, #0d1521 100%)',
          border: '1px solid rgba(124,58,237,0.35)',
          boxShadow: '0 4px 24px rgba(124,58,237,0.2)',
        }}
      >
        {/* Decorative background blobs */}
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -20, left: 20,
          width: 100, height: 100, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,170,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          {/* Camera icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: 'rgba(124,58,237,0.25)',
            border: '1px solid rgba(124,58,237,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>
            📸
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: 16, fontWeight: 800,
              color: '#ffffff',
              marginBottom: 4,
              letterSpacing: '-0.2px',
            }}>
              Open Screenshot Flyer
            </div>
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.4,
            }}>
              All 3 networks side by side — screenshot &amp; share on WhatsApp
            </div>
          </div>

          {/* Arrow badge */}
          <div style={{
            flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            borderRadius: 10, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
              Open →
            </span>
          </div>
        </div>

        {/* Bottom accent strip */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #7c3aed, #00d4aa, #7c3aed)',
        }} />
      </a>

      {/* Customization */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Flyer Customization</div></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Banner Text</label>
            <input className="form-input" placeholder="e.g. Best Data Prices in Town!" maxLength={60} value={bannerText} onChange={e => setBannerText(e.target.value)} />
            <div className="form-hint">Shown as a highlight banner on your store page</div>
          </div>

          <div className="form-group">
            <label className="form-label">Accent Color</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 10, background: c,
                    border: color === c ? '3px solid var(--text)' : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 4 }}>
            <label className="form-label">Visible Networks</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'mtn', label: 'MTN', val: showMtn, set: setShowMtn },
                { key: 'at', label: 'AirtelTigo', val: showAt, set: setShowAt },
                { key: 'telecel', label: 'Telecel', val: showTelecel, set: setShowTelecel },
              ].map(n => (
                <label key={n.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <input type="checkbox" checked={n.val} onChange={e => n.set(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                  {n.label}
                </label>
              ))}
            </div>
            <div className="form-hint">Hide networks you don't want to sell on your store</div>
          </div>

          <button className="btn btn-primary btn-full" onClick={saveSettings} disabled={saving} style={{ marginTop: 14 }}>
            {saving ? <><span className="spinner" /> Saving…</> : '💾 Save Store Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
