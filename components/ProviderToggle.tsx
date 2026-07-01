// components/ProviderToggle.tsx
// Drop into admin Settings tab — 3-way provider selector
'use client';

import { useState, useEffect } from 'react';

type Provider = 'xpresportal' | 'hubnet' | 'myztadata';

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const PROVIDERS: Array<{
  id:       Provider;
  name:     string;
  icon:     string;
  networks: string;
  note:     string;
  balanceUrl: string | null;
}> = [
  {
    id:         'xpresportal',
    name:       'XpresPortal',
    icon:       '⚡',
    networks:   'MTN · AT · Telecel',
    note:       'Webhook-based delivery updates. All 3 networks.',
    balanceUrl: '/api/hubnet/balance',
  },
  {
    id:         'hubnet',
    name:       'Hubnet',
    icon:       '🌐',
    networks:   'MTN · AT · Telecel',
    note:       'Webhook-based delivery updates. All 3 networks.',
    balanceUrl: '/api/hubnet/wallet-balance',
  },
  {
    id:         'myztadata',
    name:       'MyZtaData',
    icon:       '🚀',
    networks:   'MTN · Telecel only',
    note:       'No webhook — delivery status polled automatically. AT orders auto-route to XpresPortal.',
    balanceUrl: null,
  },
];

const fmt = (n: number) => n === -1 ? '—' : `₵${n.toFixed(2)}`;

export function ProviderToggle({ authFetch, toast }: Props) {
  const [active, setActive]     = useState<Provider>('xpresportal');
  const [saving, setSaving]     = useState(false);
  const [balances, setBalances] = useState<Record<string, number | null>>({});

  useEffect(() => {
    authFetch('/api/admin/provider')
      .then(r => r.json())
      .then(d => { if (d.provider) setActive(d.provider); })
      .catch(() => {});

    // Fetch balances for providers that support it
    authFetch('/api/hubnet/balance')
      .then(r => r.json())
      .then(d => setBalances(prev => ({ ...prev, xpresportal: d.balance ?? null })))
      .catch(() => {});

    authFetch('/api/hubnet/wallet-balance')
      .then(r => r.json())
      .then(d => setBalances(prev => ({ ...prev, hubnet: d.balance ?? null })))
      .catch(() => {});
  }, [authFetch]);

  async function switchProvider(provider: Provider) {
    if (provider === active) return;
    setSaving(true);
    try {
      const r = await authFetch('/api/admin/provider', {
        method: 'POST',
        body:   JSON.stringify({ provider }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to switch provider', 'error'); return; }
      setActive(provider);
      toast(`Switched to ${PROVIDERS.find(p => p.id === provider)?.name}`, 'success');
    } catch { toast('Network error', 'error'); }
    finally { setSaving(false); }
  }

  async function pollMyZtaData() {
    toast('Polling MyZtaData for status updates…', 'info');
    try {
      const r = await authFetch('/api/cron/myztadata-poll');
      const d = await r.json();
      toast(`Checked ${d.checked} orders, updated ${d.updated}`, 'success');
    } catch { toast('Poll failed', 'error'); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">📡 Delivery Provider</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Active provider handles all new bundle deliveries
          </div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {PROVIDERS.map(p => {
          const isActive  = active === p.id;
          const balance   = balances[p.id];

          return (
            <div key={p.id} style={{
              border:       `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding:      '14px 16px',
              background:   isActive ? 'var(--accent-dim)' : 'var(--surface2)',
              transition:   'all .2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22 }}>{p.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15 }}>{p.name}</span>
                    {isActive && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'var(--accent)', color: '#060910' }}>
                        ACTIVE
                      </span>
                    )}
                    {p.id === 'myztadata' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--warn-dim)', color: 'var(--warn)' }}>
                        NO WEBHOOK
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.networks}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.note}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {p.balanceUrl !== null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Wallet</div>
                      <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16, color: balance !== null && balance !== undefined && balance < 100 ? 'var(--err)' : 'var(--accent)' }}>
                        {balance !== null && balance !== undefined ? fmt(balance) : '—'}
                      </div>
                    </div>
                  )}
                  {p.balanceUrl === null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Balance</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>myztadata.com</div>
                    </div>
                  )}
                  <button
                    className={`btn btn-sm ${isActive ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => switchProvider(p.id)}
                    disabled={isActive || saving}
                    style={{ minWidth: 80 }}
                  >
                    {saving && !isActive ? <span className="spinner" style={{ width: 12, height: 12 }} /> : isActive ? '✓ Active' : 'Switch'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {active === 'myztadata' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="alert alert-warn" style={{ flex: 1, fontSize: 12 }}>
              <span>⚠️</span>
              <span>MyZtaData has no delivery webhook. AirtelTigo orders auto-route to XpresPortal. Use the poll button or wait for the cron to check delivery status.</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={pollMyZtaData} style={{ flexShrink: 0 }}>
              ↻ Poll Status Now
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
