'use client';

import { useEffect, useState } from 'react';
import { NetworkLogo } from '@/components/ui/NetworkLogo';
import { useParams } from 'next/navigation';
import { BUNDLES, NET_NAMES, ALL_BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';
import { fmt, genRef, detectNetwork } from '@/lib/utils';
import { openPaystack } from '@/lib/paystack';
import { useSimpleToast } from '@/components/ui/Toast';

interface AgentInfo {
  id: string; name: string; store_name?: string; slug: string; phone?: string; whatsapp?: string;
}
interface PriceMap { [bundleKey: string]: number }

export default function AgentStorePage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { toast, ToastContainer } = useSimpleToast();

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [prices, setPrices] = useState<PriceMap>(() => {
    const defaults: PriceMap = {};
    ALL_BUNDLES.forEach(b => { defaults[b.key] = getDefaultAdminPrice(b.cost); });
    return defaults;
  });
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hasPrices, setHasPrices] = useState(false);

  const [currentNet, setCurrentNet] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [phoneHint, setPhoneHint] = useState<{ text: string; ok: boolean } | null>(null);
  const [paying, setPaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [successRef, setSuccessRef] = useState('');
  const [trackRef, setTrackRef] = useState('');
  const [trackResult, setTrackResult] = useState<{ found: false; msg: string } | { found: true; order: { reference: string; phone: string; network: string; size: string; status: string; delivery_status: string; created_at: string } } | null>(null);

  const storeName = 'ADMUNZ';
  const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '';

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/agents/store?slug=${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.agent) {
          setAgent(data.agent);
          setHasPrices(!!data.hasPrices);
          const pm: PriceMap = {};
          (data.prices || []).forEach((p: { bundle_key: string; agent_price: number }) => { pm[p.bundle_key] = p.agent_price; });
          setPrices(pm);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingAgent(false));
  }, [slug]);

  const selectedBundle = currentNet ? BUNDLES[currentNet]?.find(b => b.key === selectedKey) : undefined;

  function getPrice(key: string, cost: number) {
    return prices[key] ?? cost;
  }

  function openNetwork(net: string) {
    setCurrentNet(net);
    setPanelOpen(true);
  }

  function selectBundle(key: string) {
    setSelectedKey(key);
    setOrderStep(1);
    setPhone('');
    setPhoneHint(null);
    setPanelOpen(false);
    setOrderOpen(true);
  }

  function onPhoneChange(val: string) {
    setPhone(val);
    if (val.length === 10) {
      const det = detectNetwork(val);
      if (det) {
        const match = det === currentNet;
        setPhoneHint({ text: `Detected: ${NET_NAMES[det]}${match ? ' ✓' : ` — sending ${NET_NAMES[currentNet]} data to this number`}`, ok: match });
      } else setPhoneHint(null);
    } else setPhoneHint(null);
  }

  function goStep2() {
    if (phone.length !== 10) { toast('Enter a valid 10-digit phone number', 'warn'); return; }
    setOrderStep(2);
  }

  async function placeOrder() {
    if (!agent || !selectedBundle) return;
    if (!PAYSTACK_KEY) { toast('Payment not configured. Contact support.', 'error'); return; }
    setPaying(true);

    const price = getPrice(selectedBundle.key, selectedBundle.cost);
    const ref = genRef('DF');
    const orderData = { phone, network: currentNet, bundleKey: selectedBundle.key, agentSlug: slug, source: 'agent', agentPrice: price };

    try {
      const initRes = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${phone}@admunz.com`,
          amount: Math.round(price * 100),
          reference: ref,
          metadata: {
            network: currentNet,
            bundle_key: selectedBundle.key,
            agent_slug: slug,
            source: 'agent',
            agent_price: price,
            custom_fields: [
              { display_name: 'Phone Number', variable_name: 'phone', value: phone },
              { display_name: 'Network', variable_name: 'network', value: currentNet },
              { display_name: 'Volume (MB)', variable_name: 'volume', value: selectedBundle.volume },
            ],
          },
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) { toast(initData.error || 'Could not start payment', 'error'); setPaying(false); return; }

      await openPaystack({
        key: PAYSTACK_KEY,
        email: `${phone}@admunz.com`,
        amount: Math.round(price * 100),
        currency: 'GHS',
        access_code: initData.access_code,
        callback: async (_ps: { reference: string }) => {
          setProcessing(true);
          try {
            await new Promise(r => setTimeout(r, 3000));
            const res = await fetch('/api/paystack/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: _ps.reference, orderData }),
            });
            const result = await res.json();
            if (result.success) { setSuccessRef(_ps.reference); setOrderStep(3); }
            else { toast(result.error || 'Order failed. Contact support.', 'error'); }
          } catch { toast('Network error. Save ref: ' + _ps.reference, 'error'); }
          finally { setProcessing(false); setPaying(false); }
        },
        onClose: () => { setPaying(false); toast('Payment cancelled', 'info'); },
      });
    } catch (e) {
      console.error('Paystack error:', e);
      toast('Payment error: ' + (e instanceof Error ? e.message : String(e)), 'error');
      setPaying(false);
    }
  }

  async function trackOrder() {
    if (!trackRef.trim()) return;
    try {
      const res = await fetch(`/api/orders/track?ref=${encodeURIComponent(trackRef)}`);
      const data = await res.json();
      if (data.order) {
        setTrackResult({ found: true, order: data.order });
      } else setTrackResult({ found: false, msg: 'Reference not found. Contact agent on WhatsApp.' });
    } catch { setTrackResult({ found: false, msg: 'Error checking status. Try again.' }); }
  }

  function copyRef(ref: string) {
    try { navigator.clipboard.writeText(ref); }
    catch { const el = document.createElement('textarea'); el.value = ref; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
    toast('Reference copied!', 'success', 2000);
  }

  const waLink = (ref = '') => agent?.whatsapp
    ? `https://wa.me/233${agent.whatsapp.replace(/^0/, '')}?text=${encodeURIComponent(`Hi, I need help with order ${ref}. Phone: ${phone}`)}`
    : '#';

  if (loadingAgent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px', borderColor: 'rgba(0,212,170,0.2)', borderTopColor: 'var(--accent)' }} />
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading store…</div>
        </div>
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Store Not Found</div>
          <div style={{ color: 'var(--text2)', marginBottom: 20 }}>This store link is invalid or no longer active.</div>
          <a href="/" className="btn btn-primary">Visit Main Store</a>
        </div>
      </div>
    );
  }

  if (!hasPrices) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 340, padding: '0 20px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-dim)', border: '2px solid rgba(0,212,170,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>🏗️</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Store Coming Soon</div>
          <div style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>
            <strong style={{ color: 'var(--text)' }}>{agent.name}</strong>&apos;s store is being set up. Check back shortly.
          </div>
          {agent.whatsapp && (
            <a href={`https://wa.me/233${agent.whatsapp.replace(/^0/, '')}`} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
              💬 Contact Agent on WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* HEADER */}
      <header className="store-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="logo-mark">{(agent.store_name || agent.name)[0]}</div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)' }}>{agent.store_name || agent.name}</div>
        </div>
        <div className="store-header-btns" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setTrackResult(null); setTrackOpen(true); }}>Track Order</button>
          {agent.whatsapp && (
            <a href={waLink()} className="btn btn-sm" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }} target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/></svg>
              <span className="store-btn-label">Help</span>
            </a>
          )}
        </div>
      </header>

      {/* HERO */}
      <section className="store-hero">
        <div className="store-hero-glow" />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 14px 6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 20 }}>
          <span className="live-dot" />
          {agent.store_name || agent.name}
        </div>
        <h1>Instant Data<br /><span className="hero-accent">Delivered Fast</span></h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>
          MTN · AirtelTigo bundles at the best rates. Delivered in 5–60 minutes, 24/7.
        </p>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12 }}>
          Powered by <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{storeName}</a>
        </div>
      </section>

      {/* CONTACT BAR */}
      {(agent.phone || agent.whatsapp) && (
        <div style={{ maxWidth: 600, margin: '0 auto 8px', padding: '0 16px' }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Contact {agent.store_name || agent.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {agent.phone && (
                <a href={`tel:${agent.phone}`} className="btn btn-sm btn-secondary" style={{ fontSize: 12 }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                  {agent.phone}
                </a>
              )}
              {agent.whatsapp && (
                <a href={`https://wa.me/233${agent.whatsapp.replace(/^0/, '')}`} className="btn btn-sm" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', fontSize: 12 }} target="_blank" rel="noopener noreferrer">
                  <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/></svg>
                  {agent.whatsapp}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NETWORK CARDS */}
      <div className="store-networks">
        {(['mtn', 'at'] as const).map(net => (
          <button key={net} className="net-card" onClick={() => openNetwork(net)}>
            <NetworkLogo network={net} size={52} />
            <div>
              <div className="net-card-name">{NET_NAMES[net]}</div>
              <div className="net-card-sub">Non-expiry data bundles — 90 days</div>
            </div>
            <svg className="net-card-arrow" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        ))}
      </div>

      {/* BUNDLE PANEL OVERLAY */}
      {panelOpen && (
        <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) setPanelOpen(false); }}>
          <div className="sheet">
            <div className="sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <NetworkLogo network={currentNet} size={40} />
                <div className="sheet-title">{NET_NAMES[currentNet]} Data Bundles</div>
              </div>
              <button className="close-btn" onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            <div className="sheet-body">
              {(BUNDLES[currentNet] || []).map((b, i) => (
                <div key={i} className="bundle-item" onClick={() => selectBundle(b.key)}>
                  <div>
                    <div className="bundle-size">{b.size}</div>
                    <div className="bundle-validity">{b.validity}{b.type ? ` · ${b.type}` : ''}</div>
                  </div>
                  <div className="bundle-price">{fmt(getPrice(b.key, b.cost))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ORDER FLOW OVERLAY */}
      {orderOpen && selectedBundle && (
        <div className="overlay open" onClick={e => { if (e.target === e.currentTarget && orderStep < 3) { setOrderOpen(false); setPanelOpen(true); } }}>
          <div className="sheet" style={{ maxWidth: 480 }}>
            <div className="sheet-header">
              {orderStep < 3 && <button className="btn btn-secondary btn-sm" onClick={() => { if (orderStep === 1) { setOrderOpen(false); setPanelOpen(true); } else setOrderStep(orderStep - 1); }}>← Back</button>}
              {orderStep < 3 && <button className="close-btn" onClick={() => setOrderOpen(false)}>✕</button>}
            </div>
            <div className="sheet-body">
              {orderStep < 3 && (
                <div className="step-dots">
                  {[1, 2].map(n => <div key={n} className={`step-dot${orderStep === n ? ' active' : ''}`} />)}
                </div>
              )}

              {/* Step 1 — Phone */}
              {orderStep === 1 && (
                <div>
                  <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800 }}>{selectedBundle.size}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{NET_NAMES[currentNet]}{selectedBundle.type ? ' · ' + selectedBundle.type : ''} · {selectedBundle.validity}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Recipient Phone Number</label>
                    <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={phone} onChange={e => onPhoneChange(e.target.value)} />
                    {phoneHint && <div className="form-hint" style={{ color: phoneHint.ok ? 'var(--ok)' : 'var(--warn)' }}>{phoneHint.text}</div>}
                  </div>
                  <button className="btn btn-primary btn-full btn-lg" onClick={goStep2}>Continue</button>
                </div>
              )}

              {/* Step 2 — Summary + Pay */}
              {orderStep === 2 && (
                <div>
                  <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Order Summary</h3>
                  <div className="order-summary" style={{ marginBottom: 18 }}>
                    <div className="order-summary-row"><span>Bundle</span><span>{selectedBundle.size}</span></div>
                    <div className="order-summary-row"><span>Network</span><span>{NET_NAMES[currentNet]}</span></div>
                    <div className="order-summary-row"><span>Recipient</span><span>{phone}</span></div>
                    <div className="order-summary-row total"><span>Total</span><span>{fmt(getPrice(selectedBundle.key, selectedBundle.cost))}</span></div>
                  </div>
                  <button className="btn btn-primary btn-full btn-lg" onClick={placeOrder} disabled={paying || processing}>
                    {paying || processing ? <><span className="spinner" /> Processing…</> : 'Place Order & Pay'}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Secured by Paystack · GHS payment</p>
                </div>
              )}

              {/* Step 3 — Success */}
              {orderStep === 3 && (
                <div className="success-anim">
                  <div className="success-check">✓</div>
                  <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Order Placed!</h3>
                  <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Your data will arrive within 5–60 minutes. Save your reference:</p>
                  <div className="ref-box">
                    <span className="ref-val">{successRef}</span>
                    <button className="copy-btn" onClick={() => copyRef(successRef)}>Copy</button>
                  </div>
                  {agent.whatsapp && (
                    <a href={waLink(successRef)} className="btn btn-full" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', marginTop: 12, justifyContent: 'center' }} target="_blank" rel="noopener noreferrer">
                      WhatsApp Support
                    </a>
                  )}
                  <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => { setOrderOpen(false); setOrderStep(1); }}>Buy Another</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TRACK ORDER OVERLAY */}
      {trackOpen && (
        <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) setTrackOpen(false); }}>
          <div className="sheet">
            <div className="sheet-header">
              <div className="sheet-title">Track Order</div>
              <button className="close-btn" onClick={() => setTrackOpen(false)}>✕</button>
            </div>
            <div className="sheet-body">
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Enter your transaction reference to check delivery status.</p>
              <div className="form-group">
                <label className="form-label">Transaction Reference</label>
                <input className="form-input" placeholder="e.g. DF-XXXXX-XXX" value={trackRef} onChange={e => setTrackRef(e.target.value)} />
              </div>
              {trackResult && !trackResult.found && (
                <div className="alert alert-error" style={{ marginBottom: 12 }}>{trackResult.msg}</div>
              )}
              {trackResult && trackResult.found && (() => {
                const o = trackResult.order;
                const payOk = o.status === 'success';
                const dlv = o.delivery_status || 'pending';
                const dlvMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
                  delivered:  { label: 'Delivered', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✓' },
                  pending:    { label: 'Processing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
                  processing: { label: 'Processing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
                  failed:     { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '✕' },
                };
                const d = dlvMap[dlv] ?? dlvMap.pending;
                const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                return (
                  <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ background: 'var(--surface2)', padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text3)' }}>{o.reference}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(o.created_at)}</span>
                    </div>
                    <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: 13 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Bundle</div>
                        <div style={{ fontWeight: 700 }}>{o.size}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{NET_NAMES[o.network] || o.network}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Phone</div>
                        <div style={{ fontWeight: 700 }}>{o.phone}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Payment</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: payOk ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: payOk ? '#10b981' : '#ef4444' }}>
                          <span>{payOk ? '✓' : '✕'}</span>{payOk ? 'Paid' : 'Unpaid'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Data Delivery</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: d.bg, color: d.color }}>
                          <span>{d.icon}</span>{d.label}
                        </div>
                      </div>
                    </div>
                    {(dlv === 'pending' || dlv === 'processing') && (
                      <div style={{ padding: '0 14px 14px', fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                        ⏱ Data is on its way — check your phone balance. Usually delivered within 5–60 mins.
                      </div>
                    )}
                    {dlv === 'failed' && agent?.whatsapp && (
                      <div style={{ padding: '0 14px 14px' }}>
                        <a href={`https://wa.me/+233${agent.whatsapp.replace(/^0/, '')}?text=${encodeURIComponent(`Hi, I need help with order ${o.reference}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                          💬 Contact Agent on WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}
              <button className="btn btn-primary btn-full" onClick={trackOrder}>Check Status</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </>
  );
}
