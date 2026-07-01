// app/track-phone/page.tsx
// Public page — customers type their phone number to see all their orders.
// No login needed. Link from main store and agent stores.
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { NET_NAMES } from '@/lib/bundles';
import { fmt, fmtDate } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Order {
  reference:         string;
  phone:             string;
  network:           string;
  size:              string;
  status:            string;
  delivery_status:   string;
  created_at:        string;
  source:            string;
  agent_slug?:       string;
  agent_price:       number;
  delivery_provider?: string;
}

const DELIVERY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  delivered:  { label: 'Delivered',  color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✓' },
  processing: { label: 'Processing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
  pending:    { label: 'Processing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
  failed:     { label: 'Placed',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
};

const NET_COLORS: Record<string, string> = {
  mtn:     '#f59e0b',
  telecel: '#ef4444',
  at:      '#3b82f6',
};

export default function TrackByPhonePage() {
  const [phone,   setPhone]   = useState('');
  const [orders,  setOrders]  = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function track() {
    const cleaned = phone.trim().replace(/\s/g, '');
    if (!/^0[0-9]{9}$/.test(cleaned)) {
      setError('Enter a valid 10-digit phone number starting with 0');
      return;
    }
    setError('');
    setLoading(true);
    setOrders(null);
    try {
      const r = await fetch(`/api/orders/track-by-phone?phone=${encodeURIComponent(cleaned)}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Something went wrong'); return; }
      setOrders(d.orders || []);
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  const deliveredCount  = (orders || []).filter(o => o.delivery_status === 'delivered').length;
  const processingCount = (orders || []).filter(o => ['processing', 'pending'].includes(o.delivery_status)).length;

  return (
    <>
      {/* Header */}
      <header className="store-header">
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
            <Image src="/admunz.png" alt="AdmunZ" width={38} height={38} style={{ objectFit: 'cover' }} />
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: "'Raleway', sans-serif", fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
              Admun<span style={{ color: '#f59e0b' }}>Z</span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--text3)', textTransform: 'uppercase', marginTop: 2 }}>
              Order Tracker
            </div>
          </div>
        </a>
        <ThemeToggle />
      </header>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <h1 style={{ fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            Track Your Orders
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>
            Enter the phone number you bought data for to see all your orders
          </p>
        </div>

        {/* Search box */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                className="form-input"
                type="tel"
                placeholder="0241234567"
                maxLength={10}
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && track()}
                autoFocus
                style={{ fontSize: 18, fontWeight: 600, letterSpacing: 1 }}
              />
              {error && (
                <div className="alert alert-error" style={{ marginTop: 10, fontSize: 13 }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={track}
              disabled={loading}
            >
              {loading ? <><span className="spinner" /> Checking…</> : '🔍 Find My Orders'}
            </button>
          </div>
        </div>

        {/* Results */}
        {orders !== null && (
          <>
            {orders.length === 0 ? (
              <div className="card">
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No orders found</div>
                  <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
                    No orders found for <strong style={{ color: 'var(--text)' }}>{phone}</strong>.<br />
                    Try the number you used to buy data, or{' '}
                    <a href="/track" style={{ color: 'var(--accent)' }}>track by reference number</a> instead.
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total Orders',  val: orders.length,      color: 'var(--accent)' },
                    { label: 'Delivered',     val: deliveredCount,     color: 'var(--ok)' },
                    { label: 'Processing',    val: processingCount,    color: 'var(--warn)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Orders list */}
                <div className="card">
                  {orders.map((o, i) => {
                    const dlv = DELIVERY_CONFIG[o.delivery_status] || DELIVERY_CONFIG.pending;
                    const netColor = NET_COLORS[o.network] || 'var(--accent)';
                    return (
                      <div key={o.reference} style={{
                        padding: '16px',
                        borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        {/* Top row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                              background: `${netColor}20`,
                              border: `1px solid ${netColor}40`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 11,
                              color: netColor,
                            }}>
                              {(NET_NAMES[o.network] || o.network).slice(0, 3).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16 }}>{o.size}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{NET_NAMES[o.network] || o.network} · {fmtDate(o.created_at)}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--accent)' }}>{fmt(o.agent_price)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Paid</div>
                          </div>
                        </div>

                        {/* Status + reference row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 100,
                            fontSize: 12, fontWeight: 700,
                            background: dlv.bg, color: dlv.color,
                          }}>
                            {dlv.icon} {dlv.label}
                          </span>
                          <a
                            href={`/receipt/${o.reference}`}
                            style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            View Receipt →
                          </a>
                        </div>

                        {/* Processing message */}
                        {['processing', 'pending'].includes(o.delivery_status) && (
                          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                            ⏱ Data is on its way — usually delivered within 5–60 minutes. Check your phone balance.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Support prompt */}
                <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                  Data not arrived after 60 minutes?{' '}
                  <a
                    href={`https://wa.me/233${(process.env.NEXT_PUBLIC_WHATSAPP || '').replace(/^0/, '')}?text=${encodeURIComponent(`Hi, my data hasn't arrived. Phone: ${phone}`)}`}
                    style={{ color: '#25d366', fontWeight: 600 }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Contact Support on WhatsApp
                  </a>
                </div>
              </>
            )}
          </>
        )}

        {/* Back link */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/" style={{ fontSize: 13, color: 'var(--text3)' }}>← Back to Store</a>
        </div>
      </div>
    </>
  );
}
