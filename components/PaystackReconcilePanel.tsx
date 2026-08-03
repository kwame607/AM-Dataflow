// components/PaystackReconcilePanel.tsx — NEW FILE
// Drop into the admin Settings tab alongside ProviderToggle/MyZtaPriceSync.
// Finds Paystack transactions from the last N hours that succeeded but
// never became an order (the missing-webhook symptom), and lets you
// resolve each one manually — either recording it as already delivered
// (no re-delivery, since you may have already fulfilled it directly via
// Hubnet's own portal) or actually creating + delivering it now.
'use client';

import { useState } from 'react';

interface Orphan {
  reference:     string;
  amount:        number;
  phone:         string;
  network:       string;
  bundleKey:     string;
  source:        string;
  agentSlug:     string | null;
  agentPrice?:   number;
  paidAt:        string;
  customerEmail?: string;
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;

export function PaystackReconcilePanel({ authFetch, toast }: Props) {
  const [loading, setLoading]     = useState(false);
  const [orphans, setOrphans]     = useState<Orphan[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [checkedRange, setCheckedRange] = useState<{ from: string; to: string; total: number } | null>(null);
  const [hoursWindow, setHoursWindow] = useState(24 * 7); // default: last 7 days

  const RANGE_OPTIONS = [
    { label: '24h',   hours: 24 },
    { label: '3 days', hours: 24 * 3 },
    { label: '7 days', hours: 24 * 7 },
  ];

  async function check() {
    setLoading(true);
    setOrphans(null);
    try {
      const r = await authFetch(`/api/admin/reconcile-paystack?hours=${hoursWindow}&network=mtn`);
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Reconciliation failed', 'error'); return; }
      setOrphans(d.orphans || []);
      setCheckedRange({ from: d.checkedFrom, to: d.checkedTo, total: d.totalChecked });
      if ((d.orphans || []).length === 0) toast(`No orphaned MTN transactions in the selected range ✓`, 'success');
      else toast(`Found ${d.orphans.length} orphaned transaction(s)`, 'warn');
    } catch { toast('Network error', 'error'); }
    finally { setLoading(false); }
  }

  async function resolve(o: Orphan, action: 'mark-delivered' | 'deliver') {
    setResolving(o.reference);
    try {
      const r = await authFetch('/api/admin/reconcile-paystack', {
        method: 'POST',
        body: JSON.stringify({
          reference: o.reference,
          action,
          phone:      o.phone,
          network:    o.network,
          bundleKey:  o.bundleKey,
          source:     o.source,
          agentSlug:  o.agentSlug,
          agentPrice: o.agentPrice,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to resolve', 'error'); return; }
      toast(
        action === 'mark-delivered'
          ? 'Recorded as manually delivered'
          : (d.success ? 'Delivered successfully!' : `Delivery attempt failed: ${d.message}`),
        d.success !== false ? 'success' : 'error'
      );
      setOrphans(prev => (prev || []).filter(x => x.reference !== o.reference));
    } catch {
      toast('Network error', 'error');
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">🔍 Paystack Reconciliation</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Finds MTN payments in the selected time range that succeeded on Paystack but never became an order in your system.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tab-nav" style={{ marginBottom: 0 }}>
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                className={`tab-btn${hoursWindow === opt.hours ? ' active' : ''}`}
                onClick={() => setHoursWindow(opt.hours)}
                disabled={loading}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={check} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Checking…</> : '↻ Check Now'}
          </button>
        </div>
      </div>

      {checkedRange && (
        <div className="card-body">
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: orphans && orphans.length > 0 ? 14 : 0 }}>
            Checked {checkedRange.total} Paystack transaction{checkedRange.total !== 1 ? 's' : ''} between{' '}
            {new Date(checkedRange.from).toLocaleString('en-GH')} and {new Date(checkedRange.to).toLocaleString('en-GH')}.
          </div>

          {orphans && orphans.length === 0 && (
            <div className="alert alert-success" style={{ fontSize: 13 }}>
              <span>✓</span><span>No orphaned MTN transactions found — everything's accounted for.</span>
            </div>
          )}

          {orphans && orphans.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Reference</th><th>Phone</th><th>Amount</th><th>Paid At</th><th>Source</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {orphans.map(o => (
                    <tr key={o.reference}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.reference}</td>
                      <td className="mono">{o.phone || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(o.amount)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(o.paidAt).toLocaleString('en-GH')}</td>
                      <td style={{ fontSize: 12 }}>{o.source === 'agent' ? `/store/${o.agentSlug}` : 'Main'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }}
                            onClick={() => resolve(o, 'mark-delivered')}
                            disabled={resolving === o.reference}
                            title="I already delivered this manually — just record it, don't send data again"
                          >
                            {resolving === o.reference ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '✓ Already Delivered'}
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'rgba(56,189,248,.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.4)' }}
                            onClick={() => resolve(o, 'deliver')}
                            disabled={resolving === o.reference}
                            title="This one still needs to be delivered — create the order and deliver now"
                          >
                            {resolving === o.reference ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↺ Deliver Now'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
