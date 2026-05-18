'use client';

import { useState } from 'react';
import { fmtDate } from '@/lib/utils';
import { NET_NAMES } from '@/lib/bundles';

interface OrderResult {
  reference: string;
  phone: string;
  network: string;
  size: string;
  status: string;
  delivery_status?: string;
  created_at: string;
  buyer_name?: string;
}

export default function TrackPage() {
  const [ref, setRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function track() {
    if (!ref.trim()) return;
    setLoading(true);
    setOrder(null);
    setNotFound(false);

    try {
      const res = await fetch(`/api/orders/track?ref=${encodeURIComponent(ref.trim())}`);
      const data = await res.json();
      if (data.order) {
        setOrder(data.order);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    success: 'var(--ok)',
    failed: 'var(--err)',
    pending: 'var(--warn)',
    processing: 'var(--accent2)',
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div className="logo-mark">A</div>
          <div className="logo-text">
            <strong>ADMUNZ</strong>
            <span>Order Tracker</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-title" style={{ fontSize: 22 }}>Track Your Order</div>
          <div className="auth-sub">Enter your transaction reference to check delivery status</div>

          <div className="form-group">
            <label className="form-label">Transaction Reference</label>
            <input
              className="form-input"
              placeholder="e.g. DF-XXXXXX-XXXXX"
              value={ref}
              onChange={e => setRef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && track()}
            />
          </div>

          <button className="btn btn-primary btn-full btn-lg" onClick={track} disabled={loading}>
            {loading ? <><span className="spinner" /> Checking…</> : 'Track Order'}
          </button>

          {notFound && (
            <div className="alert alert-error" style={{ marginTop: 16 }}>
              <span>✕</span>
              <div>
                <div>Reference not found.</div>
                <div style={{ marginTop: 4, fontSize: 12 }}>Contact support on WhatsApp with your reference number.</div>
              </div>
            </div>
          )}

          {order && (
            <div style={{ marginTop: 20, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: order.status === 'success' ? 'var(--ok-dim)' : 'var(--warn-dim)', border: `1px solid ${statusColor[order.status] || 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {order.status === 'success' ? '✓' : order.status === 'failed' ? '✕' : '⏳'}
                </div>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700 }}>
                    {order.status === 'success' ? 'Delivered' : order.status === 'failed' ? 'Failed' : 'Processing'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(order.created_at)}</div>
                </div>
              </div>

              {[
                { label: 'Reference', val: order.reference },
                { label: 'Network', val: NET_NAMES[order.network] || order.network },
                { label: 'Bundle', val: order.size },
                { label: 'Recipient', val: order.phone },
                ...(order.buyer_name ? [{ label: 'Buyer', val: order.buyer_name }] : []),
                { label: 'Payment', val: order.status.toUpperCase() },
                { label: 'Delivery', val: (order.delivery_status || 'pending').toUpperCase() },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                  <span style={{ fontWeight: 600, color: row.label === 'Status' ? statusColor[order.status] : 'var(--text)' }}>{row.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="auth-footer" style={{ marginTop: 16 }}>
          <a href="/">← Back to Store</a>
        </div>
      </div>
    </div>
  );
}
