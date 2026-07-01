// components/BulkRetryPanel.tsx
// Replaces the existing orders tab retry button in admin dashboard.
// Shows all failed/pending orders with checkboxes, select all, and bulk retry.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { DeliveryBadge, NetworkBadge } from '@/components/ui/Badge';
import type { Order } from '@/types';
import { fmt, fmtDate } from '@/lib/utils';

interface RetryResult {
  orderId:   string;
  reference: string;
  success:   boolean;
  message:   string;
  provider:  string;
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
  onDone?:   () => void; // callback to refresh parent orders list
}

export function BulkRetryPanel({ authFetch, toast, onDone }: Props) {
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [results,  setResults]  = useState<RetryResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch('/api/orders?status=success&limit=200');
      const d = await r.json();
      const eligible = (Array.isArray(d) ? d : []).filter(
        (o: Order) => ['failed', 'pending'].includes(o.delivery_status || '')
      );
      setOrders(eligible);
      setSelected(new Set()); // clear selection on reload
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map(o => o.id)));
    }
  }

  async function runRetry(retryAll: boolean) {
    const ids = retryAll ? [] : Array.from(selected);
    if (!retryAll && ids.length === 0) {
      toast('Select at least one order', 'warn');
      return;
    }

    const count = retryAll ? orders.length : ids.length;
    if (!confirm(`Retry ${count} order${count > 1 ? 's' : ''}? This will attempt delivery for each one.`)) return;

    setRetrying(true);
    setResults(null);
    setProgress({ done: 0, total: count });
    toast(`Retrying ${count} order${count > 1 ? 's' : ''}…`, 'info');

    try {
      const r = await authFetch('/api/orders/bulk-retry', {
        method: 'POST',
        body:   JSON.stringify({ orderIds: ids, retryAll }),
      });
      const d = await r.json();

      if (!r.ok) { toast(d.error || 'Bulk retry failed', 'error'); return; }

      setResults(d.results || []);
      setProgress({ done: d.processed, total: d.processed });

      toast(
        `Done — ${d.succeeded} sent, ${d.failed} failed`,
        d.failed === 0 ? 'success' : d.succeeded === 0 ? 'error' : 'warn'
      );

      await load();
      onDone?.();
    } catch { toast('Network error during bulk retry', 'error'); }
    finally { setRetrying(false); }
  }

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const someSelected = selected.size > 0;

  return (
    <div>
      {/* Header + action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title" style={{ fontSize: 20 }}>Failed / Pending Orders</div>
          <div className="page-subtitle">
            {loading ? 'Loading…' : `${orders.length} order${orders.length !== 1 ? 's' : ''} need${orders.length === 1 ? 's' : ''} delivery`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading || retrying}>
            ↻ Refresh
          </button>
          {someSelected && (
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--warn)' }}
              onClick={() => runRetry(false)}
              disabled={retrying}
            >
              {retrying ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Retrying…</> : `↺ Retry Selected (${selected.size})`}
            </button>
          )}
          {orders.length > 0 && (
            <button
              className="btn btn-sm"
              style={{ background: 'var(--err-dim)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--err)' }}
              onClick={() => runRetry(true)}
              disabled={retrying}
            >
              {retrying ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Retrying…</> : `↺ Retry All (${orders.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {retrying && progress && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
            <span>Processing orders…</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
              background: 'var(--accent)',
              borderRadius: 100,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Results summary */}
      {results && !retrying && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map(r => (
            <div key={r.orderId} style={{
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
              padding: '8px 12px', borderRadius: 8,
              background: r.success ? 'var(--ok-dim)' : 'var(--err-dim)',
              border: `1px solid ${r.success ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
            }}>
              <span style={{ fontSize: 14 }}>{r.success ? '✓' : '✕'}</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{r.reference}</span>
              <span style={{ color: 'var(--text3)' }}>{r.message}</span>
              {r.provider && <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 11 }}>{r.provider}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Orders table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : orders.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✅</div>
            <div className="empty-title">All orders delivered</div>
            <div className="empty-text">No failed or pending orders right now</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                  </th>
                  <th>Reference</th>
                  <th>Network</th>
                  <th>Bundle</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr
                    key={o.id}
                    style={{ background: selected.has(o.id) ? 'var(--accent-dim)' : undefined, cursor: 'pointer' }}
                    onClick={() => toggleOne(o.id)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleOne(o.id)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.reference}</td>
                    <td><NetworkBadge network={o.network} /></td>
                    <td style={{ fontWeight: 600 }}>{o.size}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.phone}</td>
                    <td><DeliveryBadge status={o.delivery_status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{o.source}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(o.admin_price || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {orders.length > 0 && !loading && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, textAlign: 'right' }}>
          {selected.size} of {orders.length} selected · Click row or checkbox to select
        </div>
      )}
    </div>
  );
}
