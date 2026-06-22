// components/ProviderToggle.tsx
// Drop into the admin Settings tab to control which delivery provider handles
// new orders. Telecel is always routed to XpresPortal regardless of this
// toggle — the label makes that clear to avoid confusion.
'use client';

import { useState, useEffect } from 'react';

type Provider = 'xpresportal' | 'hubnet';

interface ProviderToggleProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

export function ProviderToggle({ authFetch, toast }: ProviderToggleProps) {
  const [provider, setProvider]   = useState<Provider | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [xpresBalance, setXpresBalance] = useState<number | null>(null);
  const [hubnetBalance, setHubnetBalance] = useState<number | null>(null);
  const [loadingBals, setLoadingBals] = useState(false);

  useEffect(() => {
    authFetch('/api/admin/provider')
      .then(r => r.json())
      .then(d => { if (d.provider) setProvider(d.provider); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  async function switchProvider(next: Provider) {
    if (next === provider || saving) return;
    setSaving(true);
    try {
      const r = await authFetch('/api/admin/provider', {
        method: 'POST',
        body:   JSON.stringify({ provider: next }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to switch provider', 'error'); return; }
      setProvider(next);
      toast(
        next === 'hubnet'
          ? '✅ Switched to Hubnet — all new MTN & AirtelTigo orders will route via Hubnet. Telecel stays on XpresPortal.'
          : '✅ Switched to XpresPortal — all new orders will route via XpresPortal.',
        'success',
      );
    } catch { toast('Network error', 'error'); }
    finally { setSaving(false); }
  }

  async function refreshBalances() {
    setLoadingBals(true);
    try {
      const [xpresRes, hubnetRes] = await Promise.all([
        fetch('/api/hubnet/balance').then(r => r.json()).catch(() => null),
        authFetch('/api/hubnet/wallet-balance').then(r => r.json()).catch(() => null),
      ]);
      if (xpresRes?.balance !== undefined) setXpresBalance(xpresRes.balance);
      if (hubnetRes?.balance !== undefined) setHubnetBalance(hubnetRes.balance);
    } finally { setLoadingBals(false); }
  }

  const fmt = (n: number) => `₵${n.toFixed(2)}`;

  if (loading) return (
    <div style={{ padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>Loading provider settings…</div>
  );

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="card-title">🔀 Delivery Provider</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Controls which API handles new data bundle deliveries
          </div>
        </div>
      </div>
      <div className="card-body">

        {/* Toggle buttons */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['xpresportal', 'hubnet'] as Provider[]).map(p => {
            const isActive = provider === p;
            const label    = p === 'xpresportal' ? 'XpresPortal' : 'Hubnet';
            const icon     = p === 'xpresportal' ? '🟢' : '🔵';
            return (
              <button
                key={p}
                onClick={() => switchProvider(p)}
                disabled={saving}
                style={{
                  flex: 1, minWidth: 160,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius)',
                  border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  background: isActive ? 'var(--accent-dim)' : 'var(--surface2)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all .2s',
                  textAlign: 'left',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{
                    fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 800,
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                  }}>{label}</span>
                  {isActive && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, fontWeight: 800, padding: '2px 8px',
                      borderRadius: 100, background: 'var(--ok)', color: '#fff',
                    }}>ACTIVE</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                  {p === 'xpresportal'
                    ? 'MTN · AirtelTigo · Telecel\nAll networks supported'
                    : 'MTN · AirtelTigo only\nTelecel always via XpresPortal'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Telecel note */}
        <div className="alert alert-info" style={{ marginBottom: 20, fontSize: 13 }}>
          <span>ℹ️</span>
          <span>
            <strong>Telecel orders always route through XpresPortal</strong> regardless of the
            toggle above, since Hubnet does not support Telecel transactions.
          </span>
        </div>

        {/* Wallet balances */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Wallet Balances
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={refreshBalances}
              disabled={loadingBals}
            >
              {loadingBals ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Refreshing…</> : '↻ Refresh Both'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              {
                label: 'XpresPortal',
                balance: xpresBalance,
                isActive: provider === 'xpresportal',
                color: 'var(--accent)',
              },
              {
                label: 'Hubnet',
                balance: hubnetBalance,
                isActive: provider === 'hubnet',
                color: '#38bdf8',
              },
            ].map(w => (
              <div key={w.label} style={{
                background: w.isActive ? 'var(--accent-dim)' : 'var(--surface2)',
                border: `1px solid ${w.isActive ? 'rgba(0,212,170,0.25)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '14px 16px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  {w.label}{w.isActive ? ' (active)' : ''}
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: w.balance !== null ? w.color : 'var(--text3)' }}>
                  {w.balance !== null ? fmt(w.balance) : '—'}
                </div>
                {w.balance !== null && w.balance < 50 && (
                  <div style={{ fontSize: 11, color: 'var(--err)', marginTop: 4, fontWeight: 600 }}>
                    ⚠️ Low — top up soon
                  </div>
                )}
              </div>
            ))}
          </div>
          {xpresBalance === null && hubnetBalance === null && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
              Click Refresh to load current balances
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
