'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fmt, fmtDate } from '@/lib/utils';
import { NET_NAMES } from '@/lib/bundles';

interface OrderReceipt {
  reference: string;
  phone: string;
  network: string;
  size: string;
  status: string;
  delivery_status: string;
  created_at: string;
  buyer_name?: string;
  agent_price: number;
  admin_price: number;
  source: string;
  agent_slug?: string;
}

interface AgentInfo {
  name: string;
  store_name?: string;
  whatsapp?: string;
  phone?: string;
}

export default function ReceiptPage() {
  const params = useParams();
  const ref = params?.reference as string;

  const [order, setOrder] = useState<OrderReceipt | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [numberVerified, setNumberVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ref) return;
    fetch(`/api/orders/track?ref=${encodeURIComponent(ref)}`)
      .then(r => r.json())
      .then(async data => {
        if (data.order) {
          setOrder(data.order);
          // fetch agent info if agent order
          if (data.order.agent_slug) {
            const agentRes = await fetch(`/api/agents/store?slug=${data.order.agent_slug}`);
            const agentData = await agentRes.json();
            if (agentData.agent) setAgent(agentData.agent);
          }
          // Check whether this number is already "known" (verified) based on
          // order history — informational only, never blocks rendering.
          fetch(`/api/orders/number-status?phone=${encodeURIComponent(data.order.phone)}`)
            .then(r => r.json())
            .then(d => setNumberVerified(!!d.verified))
            .catch(() => setNumberVerified(null));
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [ref]);

  function copyRef() {
    if (!order) return;
    try { navigator.clipboard.writeText(order.reference); }
    catch {
      const el = document.createElement('textarea');
      el.value = order.reference;
      document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    if (!order) return;
    const storeName = agent?.store_name || agent?.name || 'ADMUNZ';
    const waNumber = agent?.whatsapp
      ? `233${agent.whatsapp.replace(/^0/, '')}`
      : process.env.NEXT_PUBLIC_WHATSAPP
        ? `233${(process.env.NEXT_PUBLIC_WHATSAPP).replace(/^0/, '')}`
        : '';

    const msg = `🧾 *DATA PURCHASE RECEIPT*\n\n` +
      `Store: ${storeName}\n` +
      `Reference: ${order.reference}\n` +
      `Network: ${NET_NAMES[order.network] || order.network}\n` +
      `Bundle: ${order.size}\n` +
      `Phone: ${order.phone}\n` +
      `Amount: ${fmt(order.agent_price)}\n` +
      `Date: ${fmtDate(order.created_at)}\n` +
      `Status: ${order.delivery_status?.toUpperCase() || 'PROCESSING'}\n\n` +
      `Track your order: ${window.location.href}`;

    const url = waNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }


  const networkColors: Record<string, { bg: string; color: string; border: string }> = {
    mtn:     { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    telecel: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    at:      { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  };

  const deliveryColors: Record<string, { color: string; bg: string; icon: string; label: string }> = {
    delivered:  { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✓', label: 'Delivered' },
    processing: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳', label: 'Processing' },
    pending:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳', label: 'Processing' },
    failed:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳', label: 'Placed' },
  };

  // ── Loading ──────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06090e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px', borderColor: 'rgba(0,212,170,0.2)', borderTopColor: 'var(--accent)' }} />
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading receipt…</div>
      </div>
    </div>
  );

  // ── Not found ────────────────────────────────────────────────
  if (notFound || !order) return (
    <div style={{ minHeight: '100vh', background: '#06090e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>Receipt Not Found</div>
        <div style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>This reference doesn&apos;t exist or hasn&apos;t been processed yet.</div>
        <a href="/" className="btn btn-primary">Back to Store</a>
      </div>
    </div>
  );

  const netStyle = networkColors[order.network] || { bg: 'rgba(0,212,170,0.12)', color: '#00d4aa', border: 'rgba(0,212,170,0.3)' };
  const dlv = deliveryColors[order.delivery_status || 'pending'] || deliveryColors.pending;
  const storeName = agent?.store_name || agent?.name || 'ADMUNZ';

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes checkPop {
          0%   { transform: scale(0); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .receipt-card { animation: fadeUp 0.5s ease forwards; }
        .check-icon   { animation: checkPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both; }
        .row-animate  { animation: fadeUp 0.4s ease forwards; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#06090e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '32px 16px 60px',
      }}>

        {/* Header */}
        <div className="no-print" style={{ width: '100%', maxWidth: 480, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <a href={order.source === 'agent' && order.agent_slug ? `/store/${order.agent_slug}` : '/'} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to Store
          </a>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Receipt</div>
        </div>

        {/* Receipt Card */}
        <div className="receipt-card" style={{
          width: '100%',
          maxWidth: 480,
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 24,
          overflow: 'hidden',
        }}>

          {/* Top accent bar */}
          <div style={{ height: 4, background: 'linear-gradient(90deg, #00d4aa, #0ea5e9)' }} />

          {/* Success header */}
          <div style={{ padding: '32px 28px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="check-icon" style={{
              width: 64, height: 64, borderRadius: '50%',
              background: order.delivery_status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
              border: `2px solid ${order.delivery_status === 'failed' ? '#ef4444' : '#10b981'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 28,
            }}>
              {order.delivery_status === 'failed' ? '✕' : '✓'}
            </div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>
              {order.delivery_status === 'delivered' ? 'Data Delivered!' : order.delivery_status === 'failed' ? 'Delivery Failed' : 'Order Confirmed!'}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {order.delivery_status === 'delivered'
                ? 'Your data bundle has been delivered successfully.'
                : order.delivery_status === 'failed'
                ? 'Contact support with your reference number below.'
                : 'Your data is on its way. Usually takes 5–60 minutes.'}
            </div>
          </div>

          {/* Reference box */}
          <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,212,170,0.04)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Transaction Reference</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#00d4aa', letterSpacing: 1 }}>{order.reference}</div>
              <button
                onClick={copyRef}
                style={{
                  background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: copied ? '#10b981' : '#94a3b8',
                  borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Order details */}
          <div style={{ padding: '20px 28px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Order Details</div>

            {[
              {
                label: 'Network',
                value: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: netStyle.bg, color: netStyle.color, border: `1px solid ${netStyle.border}` }}>
                    {NET_NAMES[order.network] || order.network}
                  </span>
                ),
              },
              { label: 'Bundle',       value: <strong style={{ color: '#f1f5f9' }}>{order.size}</strong> },
              { label: 'Sent To',      value: <strong style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{order.phone}</strong> },
              ...(numberVerified !== null ? [{
                label: 'Number Status',
                value: numberVerified ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    ✓ Verified
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                    🆕 New number
                  </span>
                ),
              }] : []),
              { label: 'Amount Paid', value: <strong style={{ color: '#00d4aa', fontFamily: 'Syne,sans-serif', fontSize: 16 }}>{fmt(order.agent_price || order.admin_price || 0)}</strong> },
              { label: 'Date & Time',  value: <span style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(order.created_at)}</span> },
              { label: 'Store',        value: <span style={{ color: '#94a3b8' }}>{storeName}</span> },
              {
                label: 'Delivery Status',
                value: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: dlv.bg, color: dlv.color }}>
                    {dlv.icon} {dlv.label}
                  </span>
                ),
              },
            ].map((row, i, arr) => (
              <div key={row.label} className="row-animate" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                animationDelay: `${i * 0.05}s`,
              }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{row.label}</span>
                <span style={{ fontSize: 13 }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Dashed divider (receipt style) */}
          <div style={{ padding: '0 28px', marginBottom: 0 }}>
            <div style={{ borderTop: '2px dashed rgba(255,255,255,0.06)' }} />
          </div>

          {/* Action buttons */}
          <div className="no-print" style={{ padding: '20px 28px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={shareWhatsApp}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 20px', borderRadius: 12,
                background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
                color: '#25d366', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.2)')}
              onMouseOut={e  => (e.currentTarget.style.background = 'rgba(37,211,102,0.12)')}
            >
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/></svg>
              Send Receipt via WhatsApp
            </button>

            <a
              href={order.source === 'agent' && order.agent_slug ? `/store/${order.agent_slug}` : '/'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg, #00d4aa, #00b894)',
                color: '#060910', fontSize: 14, fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(0,212,170,0.25)',
                transition: 'all 0.2s',
              }}
            >
              Buy Another Bundle
            </a>
          </div>

        </div>

        {/* Footer note */}
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#334155' }}>
          Keep this reference safe · <span style={{ color: '#00d4aa' }}>ADMUNZ</span>
        </div>

      </div>
    </>
  );
}
