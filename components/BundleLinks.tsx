// components/BundleLinks.tsx
// Drop into agent dashboard My Store tab — shows per-bundle share links + QR codes
'use client';

import { useState } from 'react';
import { BUNDLES, NET_NAMES } from '@/lib/bundles';
import { fmt } from '@/lib/utils';

interface Props {
  agentSlug: string;
  agentPrices: Record<string, number>;
  siteUrl: string;
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const NET_COLORS: Record<string, string> = {
  mtn:     '#f59e0b',
  telecel: '#ef4444',
  at:      '#3b82f6',
};

export function BundleLinks({ agentSlug, agentPrices, siteUrl, toast }: Props) {
  const [activeNet, setActiveNet] = useState<'mtn' | 'at' | 'telecel'>('mtn');
  const [showQR, setShowQR]       = useState<string | null>(null);

  function getBundleUrl(bundleKey: string) {
    return `${siteUrl}/store/${agentSlug}?bundle=${bundleKey}`;
  }

  function copyLink(bundleKey: string) {
    const url = getBundleUrl(bundleKey);
    try { navigator.clipboard.writeText(url); }
    catch {
      const el = document.createElement('textarea');
      el.value = url; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast('Bundle link copied!', 'success', 2000);
  }

  function getQRUrl(bundleKey: string) {
    const url = encodeURIComponent(getBundleUrl(bundleKey));
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${url}&bgcolor=0d1117&color=00d4aa&margin=10`;
  }

  const bundles = BUNDLES[activeNet] || [];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">📎 Bundle Share Links</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Share a link that opens directly to a specific bundle — perfect for WhatsApp and flyers
          </div>
        </div>
      </div>
      <div className="card-body">

        {/* Network tabs */}
        <div className="tab-nav" style={{ marginBottom: 16 }}>
          {(['mtn', 'at', 'telecel'] as const).map(net => (
            <button
              key={net}
              className={`tab-btn${activeNet === net ? ' active' : ''}`}
              onClick={() => { setActiveNet(net); setShowQR(null); }}
            >
              {NET_NAMES[net]}
            </button>
          ))}
        </div>

        {/* Bundle list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bundles.map(b => {
            const price    = agentPrices[b.key];
            const hasPrice = !!price;
            const url      = getBundleUrl(b.key);
            const isQROpen = showQR === b.key;

            return (
              <div key={b.key} style={{
                border:       `1px solid ${isQROpen ? NET_COLORS[activeNet] + '60' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                overflow:     'hidden',
                transition:   'border-color .2s',
              }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: `${NET_COLORS[activeNet]}18`,
                    border: `1px solid ${NET_COLORS[activeNet]}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 11,
                    color: NET_COLORS[activeNet],
                  }}>
                    {b.size.replace('GB', '')}GB
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b.size}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {b.validity}
                      {hasPrice ? ` · ${fmt(price)}` : ' · price not set'}
                    </div>
                  </div>
                  {!hasPrice && (
                    <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 600 }}>Set price first</span>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyLink(b.key)}
                      disabled={!hasPrice}
                      title="Copy bundle link"
                    >
                      📋 Copy
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowQR(isQROpen ? null : b.key)}
                      disabled={!hasPrice}
                      title="Show QR code"
                      style={{ background: isQROpen ? 'var(--accent-dim)' : undefined, borderColor: isQROpen ? 'var(--accent)' : undefined }}
                    >
                      {isQROpen ? '✕ QR' : '⬜ QR'}
                    </button>
                    <a
                      href={hasPrice ? url : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ opacity: hasPrice ? 1 : 0.4, pointerEvents: hasPrice ? 'auto' : 'none' }}
                      title="Preview store"
                    >
                      👁 Preview
                    </a>
                  </div>
                </div>

                {/* QR panel */}
                {isQROpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--surface2)', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <img
                      src={getQRUrl(b.key)}
                      alt={`QR for ${b.size}`}
                      style={{ width: 140, height: 140, borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                        {NET_NAMES[activeNet]} {b.size} — {fmt(price)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, wordBreak: 'break-all', background: 'var(--surface)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                        {url}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => copyLink(b.key)}>
                          📋 Copy Link
                        </button>
                        <a
                          href={getQRUrl(b.key)}
                          download={`qr-${agentSlug}-${b.key}.png`}
                          className="btn btn-secondary btn-sm"
                        >
                          ⬇ Download QR
                        </a>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Buy ${b.size} ${NET_NAMES[activeNet]} data for ${fmt(price)} 👇\n${url}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }}
                        >
                          💬 Share on WhatsApp
                        </a>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                        💡 Print this QR on flyers — customers scan and go straight to checkout
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
