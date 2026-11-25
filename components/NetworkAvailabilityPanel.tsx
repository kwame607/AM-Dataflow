// components/NetworkAvailabilityPanel.tsx
// Drop into the admin Settings tab (top of the list). One switch per telecom.
// Turning a network OFF hides it on every store and blocks purchases server-side.
'use client';

import { useEffect, useState } from 'react';

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const NETWORKS = [
  { key: 'mtn',     label: 'MTN',        color: '#f59e0b' },
  { key: 'at',      label: 'AirtelTigo', color: '#3b82f6' },
  { key: 'telecel', label: 'Telecel',    color: '#ef4444' },
] as const;

export function NetworkAvailabilityPanel({ authFetch, toast }: Props) {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [drafts, setDrafts]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  async function load() {
    try {
      const r = await fetch('/api/network-status', { cache: 'no-store' });
      const d = await r.json();
      setDisabled(d.disabled || []);
      setMessages(d.messages || {});
      setDrafts(d.messages || {});
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggle(network: string, enable: boolean) {
    const label = NETWORKS.find(n => n.key === network)?.label || network;
    if (!enable && !confirm(`Turn OFF ${label}? It will disappear from all stores and customers/agents will not be able to buy it.`)) return;
    setSaving(network);
    try {
      const r = await authFetch('/api/network-status', {
        method: 'PATCH',
        body: JSON.stringify({ network, enabled: enable, message: drafts[network] || '' }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to update', 'error'); return; }
      toast(enable ? `${label} is back ON` : `${label} is now OFF`, enable ? 'success' : 'warn');
      await load();
    } catch { toast('Network error', 'error'); }
    finally { setSaving(null); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">📶 Network Availability</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Switch a telecom off during maintenance — hidden on every store and blocked at checkout
          </div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? <span className="spinner" /> : NETWORKS.map(n => {
          const off = disabled.includes(n.key);
          return (
            <div key={n.key} style={{
              border: `1px solid ${off ? 'rgba(244,63,94,0.35)' : 'var(--border)'}`,
              background: off ? 'var(--err-dim)' : 'var(--surface2)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: off ? 'var(--err)' : 'var(--ok)' }} />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: n.color }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: off ? 'var(--err)' : 'var(--ok)', fontWeight: 700 }}>
                    {off ? 'OFF — hidden from stores' : 'ON — available'}
                  </div>
                </div>
                <button
                  className={`btn btn-sm ${off ? 'btn-primary' : ''}`}
                  style={off ? undefined : { background: 'var(--err-dim)', color: 'var(--err)', border: '1px solid var(--err)' }}
                  onClick={() => toggle(n.key, off)}
                  disabled={saving === n.key}
                >
                  {saving === n.key ? <span className="spinner" style={{ width: 12, height: 12 }} /> : off ? 'Turn ON' : 'Turn OFF'}
                </button>
              </div>
              {!off && (
                <input
                  className="form-input"
                  style={{ marginTop: 10, fontSize: 12 }}
                  maxLength={200}
                  placeholder={`Optional message shown while off, e.g. "${n.label} is under maintenance. Back on 1st December."`}
                  value={drafts[n.key] || ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [n.key]: e.target.value }))}
                />
              )}
              {off && messages[n.key] && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>Message: “{messages[n.key]}”</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
