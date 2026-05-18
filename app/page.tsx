'use client';

import { useEffect, useState, useCallback } from 'react';
import { NetworkLogo } from '@/components/ui/NetworkLogo';
import { BUNDLES, NET_NAMES, ALL_BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';
import { genRef, detectNetwork, fmt, fmtDate } from '@/lib/utils';
import { openPaystack } from '@/lib/paystack';
import type { Bundle, AdminPrice } from '@/types';
import { useSimpleToast } from '@/components/ui/Toast';

interface SelectedBundle extends Bundle {
  network: string;
  customerPays: number;
  adminPrice: number;
}

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP || '0200000000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';
const STORE_NAME = 'ADMUNZ';
const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '';

export default function MainStorePage() {
  const { toast, ToastContainer } = useSimpleToast();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [adminPrices, setAdminPrices] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {};
    ALL_BUNDLES.forEach(b => { defaults[b.key] = getDefaultAdminPrice(b.cost); });
    return defaults;
  });
  const [currentNet, setCurrentNet] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<SelectedBundle | null>(null);

  // Order form state
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [phoneHint, setPhoneHint] = useState<{ text: string; ok: boolean } | null>(null);
  const [step1Err, setStep1Err] = useState('');
  const [paying, setPaying] = useState(false);
  const [successRef, setSuccessRef] = useState('');

  // Track
  const [trackRef, setTrackRef] = useState('');
  const [trackResult, setTrackResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/prices')
      .then(r => r.json())
      .then((data: AdminPrice[]) => {
        if (Array.isArray(data)) {
          const map: Record<string, number> = {};
          data.forEach(p => { map[p.bundle_key] = p.selling_price; });
          setAdminPrices(map);
        }
      })
      .catch(() => {});
  }, []);

  function getPrice(bundle: Bundle): number {
    return adminPrices[bundle.key] ?? getDefaultAdminPrice(bundle.cost);
  }

  function openNetwork(net: string) {
    setCurrentNet(net);
    setPanelOpen(true);
  }

  function selectBundle(bundle: Bundle) {
    const price = getPrice(bundle);
    setSelectedBundle({ ...bundle, network: currentNet, customerPays: price, adminPrice: price });
    setStep(1);
    setPhone('');
    setPhoneHint(null); setStep1Err('');
    setPanelOpen(false);
    setOrderOpen(true);
  }

  function onPhoneChange(val: string) {
    setPhone(val);
    if (val.length === 10) {
      const det = detectNetwork(val);
      if (det) {
        const match = det === currentNet;
        setPhoneHint({
          text: `Detected: ${NET_NAMES[det]}${match ? ' ✓' : ` — sending ${NET_NAMES[currentNet]} data to this number`}`,
          ok: match,
        });
      } else {
        setPhoneHint(null);
      }
    } else {
      setPhoneHint(null);
    }
  }

  function goStep2() {
    if (phone.length !== 10) { setStep1Err('Enter a valid 10-digit phone number'); return; }
    setStep1Err('');
    setStep(2);
  }

  async function placeOrder() {
    if (!selectedBundle) return;
    setPaying(true);

    const reference = genRef('DF');
    const orderData = {
      reference,
      phone,
      network: selectedBundle.network,
      bundleKey: selectedBundle.key,
      size: selectedBundle.size,
      volume: selectedBundle.volume,
      adminPrice: selectedBundle.adminPrice,
      source: 'main',
    };

    try {
      // 1. Initialize transaction server-side via Paystack API
      const initRes = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${phone}@admunz.com`,
          amount: Math.round(selectedBundle.customerPays * 100),
          reference,
          metadata: {
            network: selectedBundle.network,
            bundle_key: selectedBundle.key,
            source: 'main',
            custom_fields: [
              { display_name: 'Phone Number', variable_name: 'phone', value: phone },
              { display_name: 'Network', variable_name: 'network', value: selectedBundle.network },
              { display_name: 'Volume (MB)', variable_name: 'volume', value: selectedBundle.volume },
            ],
          },
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        toast(initData.error || 'Could not start payment', 'error');
        setPaying(false);
        return;
      }

      // 2. Open Paystack popup with server-generated reference + full v1 params
      await openPaystack({
        key: PAYSTACK_KEY,
        email: `${phone}@admunz.com`,
        amount: Math.round(selectedBundle.customerPays * 100),
        ref: initData.reference,
        callback: async (response: { reference: string }) => {
          try {
            const res = await fetch('/api/paystack/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: response.reference, orderData }),
            });
            const result = await res.json();
            if (result.success) {
              setSuccessRef(response.reference);
              setStep(3);
            } else {
              toast(result.error || 'Order processing failed. Contact support.', 'error');
            }
          } catch {
            toast('Network error. Save ref: ' + response.reference, 'error');
          } finally {
            setPaying(false);
          }
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
        const o = data.order;
        setTrackResult({
          ok: o.status === 'success',
          msg: `${o.size} — ${NET_NAMES[o.network] || o.network} · Phone: ${o.phone} · Status: ${o.status.toUpperCase()} · ${fmtDate(o.created_at)}`,
        });
      } else {
        setTrackResult({ ok: false, msg: 'Reference not found. Contact support on WhatsApp.' });
      }
    } catch {
      setTrackResult({ ok: false, msg: 'Error checking status. Try again.' });
    }
  }

  const waLink = (ref = '', ph = '') =>
    `https://wa.me/+233${WA_NUMBER.replace(/^0/, '')}?text=${encodeURIComponent(`Hi, I need help with order ${ref}. Phone: ${ph}`)}`;

  if (!mounted) return (
    <div style={{ minHeight: '100vh', background: '#06090e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#00d4aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#000', fontFamily: 'sans-serif' }}>A</div>
        <div>
          <div style={{ fontFamily: 'sans-serif', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>ADMUNZ</div>
          <div style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#64748b', marginTop: 2 }}>Data</div>
        </div>
      </div>
      <svg viewBox="0 0 40 40" width="40" height="40" style={{ animation: 'spin 0.9s linear infinite' }}>
        <circle cx="20" cy="20" r="16" fill="none" stroke="#1a2230" strokeWidth="3.5" />
        <circle cx="20" cy="20" r="16" fill="none" stroke="#00d4aa" strokeWidth="3.5" strokeDasharray="60 44" strokeLinecap="round" />
      </svg>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <>
      {/* HEADER */}
      <header className="store-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="logo-mark">{STORE_NAME[0]}</div>
          <div className="logo-text">
            <strong>{STORE_NAME}</strong>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="live-dot" /> All Networks Live
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setTrackOpen(true)}>Track Order</button>
          <a href={waLink()} className="btn btn-sm" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }}>
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/></svg>
            Help
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="store-hero">
        <div className="store-hero-glow" />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 14px 6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 20 }}>
          <span className="live-dot" />
          {STORE_NAME} — Data Store
        </div>
        <h1>Instant Data<br /><span className="hero-accent">Delivered Fast</span></h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>
          MTN · AirtelTigo bundles at the best rates. Delivered in 5–60 minutes, 24/7.
        </p>
      </section>

      {/* NETWORK CARDS */}
      <div className="store-networks">
        {(['mtn','at'] as const).map(net => (
          <button key={net} className="net-card" onClick={() => openNetwork(net)}>
            <NetworkLogo network={net} size={52} />
            <div>
              <div className="net-card-name">{NET_NAMES[net]}</div>
              <div className="net-card-sub">Non-expiry data bundles — 90 days</div>
            </div>
            <svg className="net-card-arrow" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        ))}
        <div style={{ marginTop: 8 }}>
          <a href="/register" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 'var(--radius)', border: '1px dashed var(--border-h)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, transition: 'all .2s' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-h)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Become a Reseller Agent
          </a>
        </div>
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
                <div key={i} className="bundle-item" onClick={() => selectBundle(b)}>
                  <div>
                    <div className="bundle-size">{b.size}</div>
                    <div className="bundle-validity">{b.validity}{b.type ? ` · ${b.type}` : ''}</div>
                  </div>
                  <div className="bundle-price">{fmt(getPrice(b))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ORDER FLOW OVERLAY */}
      {orderOpen && selectedBundle && (
        <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) { if (step < 3) { setOrderOpen(false); setPanelOpen(true); } } }}>
          <div className="sheet" style={{ maxWidth: 480 }}>
            <div className="sheet-header">
              {step < 3 && <button className="btn btn-secondary btn-sm" onClick={() => { if (step === 1) { setOrderOpen(false); setPanelOpen(true); } else setStep(step - 1); }}>← Back</button>}
              {step < 3 && <button className="close-btn" onClick={() => setOrderOpen(false)}>✕</button>}
            </div>
            <div className="sheet-body">
              {/* Step dots */}
              {step < 3 && (
                <div className="step-dots">
                  {[1,2].map(n => <div key={n} className={`step-dot${step === n ? ' active' : ''}`} />)}
                </div>
              )}

              {/* Step 1 */}
              {step === 1 && (
                <div>
                  <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800 }}>{selectedBundle.size}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{NET_NAMES[selectedBundle.network]}{selectedBundle.type ? ' · ' + selectedBundle.type : ''} · {selectedBundle.validity}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Recipient Phone Number</label>
                    <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={phone} onChange={e => onPhoneChange(e.target.value)} />
                    {phoneHint && <div className="form-hint" style={{ color: phoneHint.ok ? 'var(--ok)' : 'var(--warn)' }}>{phoneHint.text}</div>}
                  </div>
                  {step1Err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{step1Err}</div>}
                  <button className="btn btn-primary btn-full btn-lg" onClick={goStep2}>Continue</button>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div>
                  <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Order Summary</h3>
                  <div className="order-summary" style={{ marginBottom: 18 }}>
                    <div className="order-summary-row"><span>Bundle</span><span>{selectedBundle.size}</span></div>
                    <div className="order-summary-row"><span>Network</span><span>{NET_NAMES[selectedBundle.network]}</span></div>
                    <div className="order-summary-row"><span>Recipient</span><span>{phone}</span></div>
                    <div className="order-summary-row total"><span>Total</span><span>{fmt(selectedBundle.customerPays)}</span></div>
                  </div>
                  <button className="btn btn-primary btn-full btn-lg" onClick={placeOrder} disabled={paying}>
                    {paying ? <><span className="spinner" /> Processing…</> : 'Place Order & Pay'}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Secured by Paystack · GHS payment</p>
                </div>
              )}

              {/* Step 3 – Success */}
              {step === 3 && (
                <div className="success-anim">
                  <div className="success-check">✓</div>
                  <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Order Placed!</h3>
                  <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Your data will arrive within 5–60 minutes. Save your reference:</p>
                  <div className="ref-box">
                    <span className="ref-val">{successRef}</span>
                    <button className="copy-btn" onClick={() => { try { navigator.clipboard.writeText(successRef); } catch { const el = document.createElement('textarea'); el.value = successRef; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); } toast('Reference copied!', 'success', 2000); }}>Copy</button>
                  </div>
                  <a href={waLink(successRef, phone)} className="btn btn-full" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', marginTop: 12, justifyContent: 'center' }}>
                    WhatsApp Support
                  </a>
                  <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => { setOrderOpen(false); setStep(1); }}>Buy Another</button>
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
                <input className="form-input" placeholder="e.g. DF-XXXXXX-XXXXX" value={trackRef} onChange={e => setTrackRef(e.target.value)} />
              </div>
              {trackResult && (
                <div className={`alert ${trackResult.ok ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 12 }}>{trackResult.msg}</div>
              )}
              <button className="btn btn-primary btn-full" onClick={trackOrder}>Check Status</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </>
  );
}
