// components/MyZtaPriceSync.tsx
// Drop into admin Settings tab next to ProviderToggle.
// Shows live vs stored MyZtaData prices and flags mismatches.
'use client';

import { useState } from 'react';

interface Mismatch {
  bundleKey:  string;
  network:    string;
  volumeGB:   number;
  storedCost: number;
  liveCost:   number;
  difference: number;
}

interface SyncResult {
  checkedAt:       string;
  totalPackages:   number;
  matched:         number;
  mismatches:      number;
  mismatchDetails: Mismatch[];
  unmapped:        Array<{ network: string; volumeGB: number; cost: number; status: string }>;
  allGood:         boolean;
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;

export function MyZtaPriceSync({ authFetch, toast }: Props) {
  const [result,  setResult]  = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const r = await authFetch('/api/myztadata/sync-prices');
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Sync failed', 'error'); return; }
      setResult(d);
      if (d.allGood) toast('All MyZtaData prices match ✓', 'success');
      else toast(`${d.mismatches} price mismatch${d.mismatches > 1 ? 'es' : ''} found`, 'warn');
    } catch { toast('Network error', 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">🚀 MyZtaData Price Sync</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Compare live API prices against stored costs in myztadata-prices.ts
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={check} disabled={loading}>
          {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Checking…</> : '↻ Check Now'}
        </button>
      </div>

      {result && (
        <div className="card-body">
          {/* Summary row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Packages Checked', val: result.totalPackages, color: 'var(--text)' },
              { label: 'Matched',          val: result.matched,       color: 'var(--ok)' },
              { label: 'Mismatches',       val: result.mismatches,    color: result.mismatches > 0 ? 'var(--err)' : 'var(--ok)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', minWidth: 100 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'flex-end', paddingBottom: 4 }}>
              Checked {new Date(result.checkedAt).toLocaleTimeString()}
            </div>
          </div>

          {result.allGood && (
            <div className="alert alert-success" style={{ fontSize: 13 }}>
              <span>✓</span><span>All stored prices match live MyZtaData API — no action needed.</span>
            </div>
          )}

          {result.mismatchDetails.length > 0 && (
            <>
              <div className="alert alert-error" style={{ fontSize: 13, marginBottom: 12 }}>
                <span>⚠️</span>
                <span>
                  These prices have changed on MyZtaData. Update <code>lib/myztadata-prices.ts</code> with the live costs below, then redeploy — otherwise your profit calculations will be wrong.
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Bundle</th><th>Network</th><th>Stored Cost</th><th>Live Cost</th><th>Difference</th></tr>
                  </thead>
                  <tbody>
                    {result.mismatchDetails.map(m => (
                      <tr key={m.bundleKey}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.bundleKey}</td>
                        <td>{m.network}</td>
                        <td style={{ color: 'var(--err)' }}>{m.storedCost === 0 ? '—' : fmt(m.storedCost)}</td>
                        <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(m.liveCost)}</td>
                        <td style={{ color: m.difference > 0 ? 'var(--err)' : 'var(--ok)', fontWeight: 700 }}>
                          {m.difference > 0 ? '+' : ''}{fmt(m.difference)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.unmapped.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>
                Unmapped packages (on MyZtaData but not in your bundles list):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.unmapped.map((u, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: 'var(--surface2)', color: 'var(--text3)' }}>
                    {u.network} {u.volumeGB}GB — {fmt(u.cost)} ({u.status})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
