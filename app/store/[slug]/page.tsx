'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { NetworkLogo } from '@/components/ui/NetworkLogo';
import { useParams, useSearchParams } from 'next/navigation';
import { BUNDLES, NET_NAMES, ALL_BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';
import { fmt, genRef, detectNetwork } from '@/lib/utils';
import { openPaystack } from '@/lib/paystack';
import { useSimpleToast } from '@/components/ui/Toast';
import ServiceBanner from '@/components/ui/ServiceBanner';
import { ThemeToggle } from '@/components/ThemeToggle';

interface AgentInfo {
  id: string; name: string; store_name?: string; slug: string; phone?: string; whatsapp?: string;
  store_description?: string;
  store_logo_url?: string;
  store_banner_text?: string;
  store_color?: string;
  show_mtn?: boolean;
  show_at?: boolean;
  show_telecel?: boolean;
}
interface PriceMap { [bundleKey: string]: number }

export default function AgentStorePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const { toast, ToastContainer } = useSimpleToast();

  // Flyer mode — hides chrome, shows clean screenshot-ready layout
  const flyerMode = searchParams?.get('flyer') === '1';

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [prices, setPrices] = useState<PriceMap>(() => {
    const defaults: PriceMap = {};
    ALL_BUNDLES.forEach(b => { defaults[b.key] = getDefaultAdminPrice(b.cost); });
    return defaults;
  });
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hasPrices, setHasPrices] = useState(false);
  const [todaySales, setTodaySales] = useState<number | null>(null);

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
  const [paymentRecoveryRef, setPaymentRecoveryRef] = useState('');
  const [trackRef, setTrackRef] = useState('');
  const [trackResult, setTrackResult] = useState<
    | { found: false; msg: string }
    | { found: true; order: { reference: string; phone: string; network: string; size: string; status: string; delivery_status: string; created_at: string } }
    | null
  >(null);
  const [trackMode, setTrackMode]     = useState<'ref' | 'phone'>('ref');
  const [trackPhone, setTrackPhone]   = useState('');
  const [phoneOrders, setPhoneOrders] = useState<Array<{ reference: string; network: string; size: string; delivery_status: string; created_at: string; agent_price: number }> | null>(null);

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
          (data.prices || []).forEach((p: { bundle_key: string; agent_price: number }) => {
            pm[p.bundle_key] = p.agent_price;
          });
          setPrices(pm);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingAgent(false));

    fetch('/api/stats/today')
      .then(r => r.json())
      .then(d => { if (typeof d.count === 'number') setTodaySales(d.count); })
      .catch(() => {});
  }, [slug]);

  // Recover from a previous session where payment may have completed but the
  // page was closed/crashed before we could confirm — nudge instead of forcing
  // a full takeover, and ignore anything older than 2 hours as likely stale.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admunz_pending_ref');
      if (!raw) return;
      const saved = JSON.parse(raw) as { reference: string; savedAt: number };
      const ageMs = Date.now() - (saved.savedAt || 0);
      if (ageMs > 2 * 60 * 60 * 1000) {
        localStorage.removeItem('admunz_pending_ref');
        return;
      }
      toast(`You have a pending order (${saved.reference}). Tap Track Order to check its status.`, 'info', 8000);
    } catch { /* corrupt or unavailable — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBundle = currentNet ? BUNDLES[currentNet]?.find(b => b.key === selectedKey) : undefined;
  const accentColor = agent?.store_color || '#00d4aa';

  function getPrice(key: string, cost: number): number {
    return prices[key] ?? cost;
  }

  function silentPrice(key: string, cost: number): number {
    const base = getPrice(key, cost);
    return Math.ceil((base / 0.985) * 100) / 100;
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
        setPhoneHint({
          text: `Detected: ${NET_NAMES[det] || det}${match ? ' ✓' : ` — sending ${NET_NAMES[currentNet]} data to this number`}`,
          ok: match,
        });
      } else setPhoneHint(null);
    } else setPhoneHint(null);
  }

  function goStep2() {
    if (phone.length !== 10) { toast('Enter a valid 10-digit phone number', 'warn'); return; }
    setOrderStep(2);
  }

  async function placeOrder() {
    if (!selectedBundle) return;
    if (!PAYSTACK_KEY) { toast('Payment not configured. Contact support.', 'error'); return; }
    setPaying(true);

    const displayPrice   = getPrice(selectedBundle.key, selectedBundle.cost);
    const chargePrice    = silentPrice(selectedBundle.key, selectedBundle.cost);
    const agentBasePrice = displayPrice;
    const bundleKey    = selectedBundle.key;
    const bundleVolume = selectedBundle.volume;
    const network      = currentNet;
    const reference    = genRef('DF');

    try {
      const initRes = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${phone}@admunz.com`,
          amount: Math.round(chargePrice * 100),
          reference,
          metadata: {
            network,
            bundle_key: bundleKey,
            source: 'agent',
            agent_slug: slug,
            agent_price: agentBasePrice,
            custom_fields: [
              { display_name: 'Phone Number', variable_name: 'phone',   value: phone },
              { display_name: 'Network',      variable_name: 'network', value: network },
              { display_name: 'Volume (MB)',  variable_name: 'volume',  value: bundleVolume },
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

      // Persist the reference before opening Paystack — if the page crashes or
      // the network drops right after payment, this survives a refresh and lets
      // the customer (or support) recover the order via the Track Order screen.
      try {
        localStorage.setItem('admunz_pending_ref', JSON.stringify({
          reference, phone, network, savedAt: Date.now(),
        }));
      } catch { /* localStorage unavailable — non-fatal */ }

      await openPaystack({
        key:         PAYSTACK_KEY,
        email:       `${phone}@admunz.com`,
        amount:      Math.round(chargePrice * 100),
        currency:    'GHS',
        access_code: initData.access_code,
        reference,

        callback: async (_ps: { reference: string }) => {
          try {
            setProcessing(true);
            const paidRef = _ps.reference;
            let found = false;

            for (let i = 0; i < 8; i++) {
              await new Promise(r => setTimeout(r, 1000));
              const pollRes  = await fetch(`/api/paystack/poll?ref=${encodeURIComponent(paidRef)}`);
              const pollData = await pollRes.json();
              if (pollData.found) { found = true; break; }
            }

            if (found) {
              clearPendingRef();
              setSuccessRef(paidRef);
              setOrderStep(3);
              return;
            }

            const orderData = {
              phone,
              network,
              bundleKey,
              source:     'agent' as const,
              agentSlug:  slug,
              agentPrice: agentBasePrice,
            };
            const verifyRes = await fetch('/api/paystack/verify', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ reference: paidRef, orderData }),
            });
            const result = await verifyRes.json();

            if (result.success) {
              clearPendingRef();
              setSuccessRef(paidRef);
              setOrderStep(3);
            } else {
              toast(result.error || 'Order failed. Contact support with ref: ' + paidRef, 'error');
            }
          } catch {
            // Paystack confirmed payment but our poll/verify calls failed —
            // money may have left the customer's account. Don't guess; tell
            // them plainly and keep the reference front and center so it's
            // never lost, with a direct path to check status or get help.
            setPaymentRecoveryRef(_ps.reference);
          } finally {
            setProcessing(false);
            setPaying(false);
          }
        },

        onClose: () => {
          clearPendingRef();
          setPaying(false);
          toast('Payment cancelled', 'info');
        },
      });
    } catch (e) {
      console.error('Paystack error:', e);
      // This catch only fires before Paystack's popup opens (init call failed,
      // or the script itself errored) — no payment has been taken yet, so the
      // message should reassure rather than alarm.
      toast('Could not start payment — no charge was made. Please check your connection and try again.', 'error');
      clearPendingRef();
      setPaying(false);
    }
  }

  function clearPendingRef() {
    try { localStorage.removeItem('admunz_pending_ref'); } catch { /* non-fatal */ }
  }

  async function trackOrder() {
    if (!trackRef.trim()) return;
    try {
      const res  = await fetch(`/api/orders/track?ref=${encodeURIComponent(trackRef)}`);
      const data = await res.json();
      if (data.order) {
        setTrackResult({ found: true, order: data.order });
      } else {
        setTrackResult({ found: false, msg: 'Reference not found. Contact agent on WhatsApp.' });
      }
    } catch {
      setTrackResult({ found: false, msg: 'Error checking status. Try again.' });
    }
  }

  async function trackByPhone() {
    if (!trackPhone.trim()) return;
    try {
      const res  = await fetch(`/api/orders/track-by-phone?phone=${encodeURIComponent(trackPhone.trim())}`);
      const data = await res.json();
      setPhoneOrders(data.orders || []);
    } catch {
      setPhoneOrders([]);
    }
  }

  function copyRef(ref: string) {
    try { navigator.clipboard.writeText(ref); }
    catch {
      const el = document.createElement('textarea');
      el.value = ref; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    toast('Reference copied!', 'success', 2000);
  }

  const waLink = (ref = '') => agent?.whatsapp
    ? `https://wa.me/233${agent.whatsapp.replace(/^0/, '')}?text=${encodeURIComponent(`Hi, I need help with order ${ref}. Phone: ${phone}`)}`
    : '#';

  // ── Loading / not-found / no-prices screens ──────────────────
  if (loadingAgent) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px', borderColor: 'rgba(0,212,170,0.2)', borderTopColor: 'var(--accent)' }} />
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading store…</div>
      </div>
    </div>
  );

  if (notFound || !agent) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Store Not Found</div>
        <div style={{ color: 'var(--text2)', marginBottom: 20 }}>This store link is invalid or no longer active.</div>
        <a href="/" className="btn btn-primary">Visit Main Store</a>
      </div>
    </div>
  );

  if (!hasPrices) return (
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

  const allNetworks: Array<{ key: string; sub: string; visible: boolean }> = [
    { key: 'mtn',     sub: 'Non-expiry data bundles — 90 days', visible: agent.show_mtn !== false },
    { key: 'at',      sub: 'AT iShare & BigTime — 90 days',     visible: agent.show_at !== false },
    { key: 'telecel', sub: 'Group Share bundles — 90 days',     visible: agent.show_telecel !== false },
  ];
  const networks = allNetworks.filter(n => n.visible);

  // Per-network style config used in flyer mode
  const NET_STYLE: Record<string, { bg: string; text: string; accent: string; initials: string }> = {
    mtn:     { bg: '#FFF8E1', text: '#6D4C00', accent: '#F59E0B', initials: 'M'  },
    at:      { bg: '#EFF6FF', text: '#1E3A8A', accent: '#3B82F6', initials: 'AT' },
    telecel: { bg: '#FFF1F2', text: '#9F1239', accent: '#F43F5E', initials: 'T'  },
  };

  const agentStoreName = agent.store_name || agent.name;

  return (
    <>
      {/* Flyer-specific print styles */}
      {flyerMode && (
        <style>{`
          @media print {
            .flyer-toolbar { display: none !important; }
          }
          body { margin: 0; padding: 0; }
        `}</style>
      )}

      {/* Normal store header — hidden in flyer mode */}
      {!flyerMode && (
        <header className="store-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, overflow: 'hidden', flexShrink: 0, background: 'var(--surface2)' }}>
              {agent.store_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.store_logo_url} alt={agent.name} width={38} height={38} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
              ) : (
                <Image src="/admunz.png" alt="AdmunZ" width={38} height={38} style={{ objectFit: 'cover' }} />
              )}
            </div>
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontFamily: "'Raleway', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '0.02em', color: 'var(--text)', lineHeight: 1.15 }}>
                {(() => {
                  const name = agent.store_name || agent.name || '';
                  if (!name) return name;
                  return (
                    <>
                      {name.slice(0, -1)}
                      <span style={{ color: '#f59e0b' }}>{name.slice(-1)}</span>
                    </>
                  );
                })()}
              </div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--text3)', textTransform: 'uppercase', marginTop: 2 }}>
                Data Hub
              </div>
            </div>
          </div>
          <div className="store-header-btns" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggle />
            <button className="btn btn-secondary btn-sm" onClick={() => { setTrackResult(null); setTrackOpen(true); }}>Track Order</button>
            <a href="/track-phone" className="btn btn-secondary btn-sm">history</a>
            {agent.whatsapp && (
              <a href={waLink()} className="btn btn-sm" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }} target="_blank" rel="noopener noreferrer">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/></svg>
                <span className="store-btn-label">Help</span>
              </a>
            )}
          </div>
        </header>
      )}

      {/* ════════════════════════════════════════════════════════
          FLYER MODE vs NORMAL STORE
      ════════════════════════════════════════════════════════ */}
      {flyerMode ? (
        <>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
            @media print {
              .flyer-toolbar { display: none !important; }
              body { margin: 0; padding: 0; }
            }
            .flyer-wrap * { font-family: 'Inter', system-ui, sans-serif; box-sizing: border-box; line-height: 1; }
            .flyer-col-row { border-bottom: 1px solid rgba(0,0,0,0.07); }
            .flyer-col-row:last-child { border-bottom: none; }
          `}</style>

          {/* ── Toolbar (screen only) ── */}
          <div className="flyer-toolbar" style={{
            position: 'sticky', top: 0, zIndex: 100,
            background: '#0f172a',
            padding: '9px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>
              📸 Screenshot the flyer below to share with customers
            </span>
            <button onClick={() => window.print()} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: '#3b82f6', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              🖨 Print
            </button>
            <a href={`/store/${agent.slug}`} style={{
              padding: '6px 13px', borderRadius: 8,
              background: '#1e293b', color: '#94a3b8',
              fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}>← Store</a>
          </div>

          {/* ═══════════════════════════════════════════════════════
              THE FLYER
          ═══════════════════════════════════════════════════════ */}
          <div className="flyer-wrap" style={{
            background: '#ffffff',
            maxWidth: 420,
            margin: '0 auto',
            border: '1px solid #e2e8f0',
          }}>

            {/* ── TOP HEADER: store name + wifi icon ── */}
            <div style={{
              background: '#ffffff',
              padding: '12px 16px 8px',
              textAlign: 'center',
              borderBottom: '2px solid #1a3faa',
            }}>
              {/* Big store name */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <div style={{ lineHeight: 1 }}>
                  <div style={{
                    fontSize: 30, fontWeight: 900,
                    color: '#0f172a',
                    letterSpacing: '-1px',
                    lineHeight: 1,
                  }}>
                    {(() => {
                      const name = agentStoreName;
                      const mid = Math.ceil(name.length / 2);
                      return (
                        <>
                          <span style={{ color: '#0f172a' }}>{name.slice(0, mid)}</span>
                          <span style={{ color: '#3b82f6' }}>{name.slice(mid)}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {/* WiFi icon */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 1, paddingTop: 4,
                }}>
                  <svg width="28" height="22" viewBox="0 0 36 28" fill="none">
                    <path d="M18 22C19.657 22 21 23.343 21 25C21 26.657 19.657 28 18 28C16.343 28 15 26.657 15 25C15 23.343 16.343 22 18 22Z" fill="#3b82f6"/>
                    <path d="M8 14C10.652 11.348 14.12 10 18 10C21.88 10 25.348 11.348 28 14" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                    <path d="M2 8C6.418 3.582 11.91 1 18 1C24.09 1 29.582 3.582 34 8" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                    <path d="M13 19C14.326 17.674 16.08 17 18 17C19.92 17 21.674 17.674 23 19" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                  </svg>
                </div>
              </div>

              {/* Tagline */}
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#64748b',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                marginTop: 2, marginBottom: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ color: '#94a3b8' }}>——</span>
                <span>{agent.store_description || 'FAST • RELIABLE • AFFORDABLE'}</span>
                <span style={{ color: '#94a3b8' }}>——</span>
              </div>

              {/* DATA BUNDLES label */}
              <div style={{
                display: 'inline-block',
                background: '#1a3faa',
                color: '#ffffff',
                fontSize: 11, fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '4px 20px',
                borderRadius: 4,
                marginBottom: 8,
              }}>
                {agent.store_banner_text || 'DATA BUNDLES'}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                NETWORK COLUMNS
            ══════════════════════════════════════════════════ */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${networks.length}, 1fr)`,
              borderBottom: '2px solid #1a3faa',
            }}>
              {networks.map(({ key }, colIndex) => {

                // Per-network styling matching the reference flyer
                const NS: Record<string, {
                  headerBg: string; headerText: string; headerBorder: string;
                  colBg: string; labelBg: string; labelText: string;
                  priceColor: string; colBorder: string;
                  logoSrc: string; logoLabel: string;
                }> = {
                  mtn: {
                    headerBg: '#FFCB05',
                    headerText: '#1a0a00',
                    headerBorder: '#e6b800',
                    colBg: '#ffffff',
                    labelBg: '#FFCB05',
                    labelText: '#1a0a00',
                    priceColor: '#1a0a00',
                    colBorder: '#e2e8f0',
                    logoSrc: '/mtn.png',
                    logoLabel: 'MTN',
                  },
                  at: {
                    headerBg: '#E52020',
                    headerText: '#ffffff',
                    headerBorder: '#cc1a1a',
                    colBg: '#ffffff',
                    labelBg: '#E52020',
                    labelText: '#ffffff',
                    priceColor: '#991b1b',
                    colBorder: '#e2e8f0',
                    logoSrc: '/at.jpg',
                    logoLabel: 'airtel tigo',
                  },
                  telecel: {
                    headerBg: '#ffffff',
                    headerText: '#0f172a',
                    headerBorder: '#e2e8f0',
                    colBg: '#ffffff',
                    labelBg: '#E52020',
                    labelText: '#ffffff',
                    priceColor: '#1a3faa',
                    colBorder: '#e2e8f0',
                    logoSrc: '/telecel.png',
                    logoLabel: 'telecel',
                  },
                };

                const ns = NS[key] ?? NS.mtn;
                const bundles = BUNDLES[key] || [];
                const isLast = colIndex === networks.length - 1;

                return (
                  <div key={key} style={{
                    background: ns.colBg,
                    borderRight: isLast ? 'none' : `1px solid #d1d5db`,
                    display: 'flex', flexDirection: 'column',
                  }}>

                    {/* Network logo header */}
                    <div style={{
                      background: ns.headerBg,
                      borderBottom: `2px solid ${ns.headerBorder}`,
                      padding: '5px 4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ns.logoSrc}
                        alt={NET_NAMES[key]}
                        style={{
                          maxHeight: 24, maxWidth: '90%',
                          objectFit: 'contain',
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>

                    {/* DATA | PRICE column headers */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      background: ns.labelBg,
                    }}>
                      <div style={{
                        padding: '3px 3px',
                        textAlign: 'center',
                        fontSize: 8, fontWeight: 800,
                        color: ns.labelText,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderRight: `1px solid rgba(0,0,0,0.12)`,
                      }}>DATA</div>
                      <div style={{
                        padding: '3px 3px',
                        textAlign: 'center',
                        fontSize: 8, fontWeight: 800,
                        color: ns.labelText,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}>PRICE (₵)</div>
                    </div>

                    {/* Bundle rows */}
                    <div style={{ flex: 1 }}>
                      {bundles.map((b, idx) => (
                        <div key={b.key} className="flyer-col-row" style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr',
                          background: idx % 2 === 0 ? '#f8fafc' : '#ffffff',
                        }}>
                          <div style={{
                            padding: '2px 3px',
                            textAlign: 'center',
                            fontSize: 9, fontWeight: 700,
                            color: '#0f172a',
                            borderRight: '1px solid #e2e8f0',
                          }}>
                            {b.size}
                          </div>
                          <div style={{
                            padding: '2px 3px',
                            textAlign: 'center',
                            fontSize: 9, fontWeight: 700,
                            color: ns.priceColor,
                          }}>
                            {fmt(getPrice(b.key, b.cost)).replace('₵', '₵')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* ══ end network columns ══ */}

            {/* ── FEATURES ROW ── */}
            <div style={{
              display: 'flex',
              borderBottom: '2px solid #1a3faa',
              background: '#ffffff',
            }}>
              {[
                { icon: '⚡', label: 'FAST\nBROWSING' },
                { icon: '🛡', label: 'RELIABLE\nCONNECTION' },
                { icon: '👍', label: 'BEST\nPRICES' },
              ].map((feat, i) => (
                <div key={i} style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 5px',
                  borderRight: i < 2 ? '1px solid #e2e8f0' : 'none',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: '#1a3faa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, flexShrink: 0,
                  }}>
                    {feat.icon}
                  </div>
                  <div style={{
                    fontSize: 7, fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '0.04em',
                    lineHeight: 1.3,
                    whiteSpace: 'pre-line',
                  }}>
                    {feat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* ── CONTACT FOOTER ── */}
            <div style={{
              background: '#0f172a',
              padding: '8px 10px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                borderRadius: 6,
                overflow: 'hidden',
              }}>
                {/* Left: phone */}
                <div style={{
                  flex: 1,
                  background: '#1a3faa',
                  padding: '8px 10px',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: '#ffffff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="13" height="13" fill="none" stroke="#1a3faa" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>
                      CONTACT US
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em', lineHeight: 1 }}>
                      {agent.whatsapp || agent.phone || '0540705130'}
                    </div>
                  </div>
                </div>

                {/* Right: tagline */}
                <div style={{
                  background: '#0f172a',
                  padding: '8px 10px',
                  minWidth: 90,
                  textAlign: 'right',
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#ffffff', lineHeight: 1.3 }}>
                    STAY CONNECTED.
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#3b82f6', lineHeight: 1.3 }}>
                    STAY AHEAD.
                  </div>
                </div>
              </div>
            </div>

            {/* ── BOTTOM TAGLINE ── */}
            <div style={{
              background: '#1a3faa',
              padding: '4px 16px',
              textAlign: 'center',
            }}>
              <span style={{
                fontSize: 7, fontWeight: 700,
                color: 'rgba(255,255,255,0.7)',
                letterSpacing: '0.2em', textTransform: 'uppercase',
              }}>
                CONNECT MORE. ACHIEVE MORE.
              </span>
            </div>

          </div>
          {/* ═══ end flyer ═══ */}
        </>
      ) : (
        /* ════════════════════════════════════════════════════
           NORMAL STORE MODE (unchanged)
        ════════════════════════════════════════════════════ */
        <>
          {/* Flyer-mode banner style override */}
          {flyerMode && (
            <style>{`
              .store-header { display: none !important; }
              .store-hero { padding-top: 28px !important; }
              body { background: var(--bg); }
            `}</style>
          )}

          {/* Banner text */}
          {agent.store_banner_text && (
            <div style={{ maxWidth: 600, margin: '16px auto 0', padding: '0 16px' }}>
              <div style={{
                background: `${accentColor}15`, border: `1px solid ${accentColor}40`,
                borderRadius: 'var(--radius)', padding: '12px 18px', textAlign: 'center',
                fontSize: 14, fontWeight: 700, color: accentColor,
              }}>
                ✨ {agent.store_banner_text}
              </div>
            </div>
          )}

          {/* HERO */}
          <section className="store-hero">
            <div className="store-hero-glow" />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 14px 6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 20 }}>
              <span className="live-dot" />
              {todaySales !== null && todaySales > 0
                ? `${todaySales} bundle${todaySales === 1 ? '' : 's'} sold today`
                : agentStoreName}
            </div>
            <h1>Instant Data<br /><span className="hero-accent" style={{ background: `linear-gradient(90deg, ${accentColor}, var(--accent2))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Delivered Fast</span></h1>
            <p style={{ color: 'var(--text2)', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>
              {agent.store_description || 'MTN · AirtelTigo · Telecel bundles at the best rates. Delivered in 5–60 minutes, 24/7.'}
            </p>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12 }}>
              Powered by <a href="/" style={{ color: accentColor, textDecoration: 'none' }}>{storeName}</a>
            </div>
          </section>

          {/* Contact bar */}
          {(agent.phone || agent.whatsapp) && (
            <div style={{ maxWidth: 600, margin: '0 auto 8px', padding: '0 16px' }}>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Contact {agentStoreName}</div>
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

          {/* Network cards */}
          <div className="store-networks">
            {networks.map(({ key, sub }) => (
              <button key={key} className="net-card" onClick={() => openNetwork(key)}>
                <NetworkLogo network={key} size={52} />
                <div>
                  <div className="net-card-name">{NET_NAMES[key]}</div>
                  <div className="net-card-sub">{sub}</div>
                </div>
                <svg className="net-card-arrow" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
              </button>
            ))}
          </div>

          {/* Bundle panel overlay */}
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

          {/* Order flow overlay */}
          {/* PAYMENT RECOVERY — shown if payment was confirmed by Paystack but our
              poll/verify calls failed afterward. Takes priority over the normal
              order overlay so the reference is never missed. */}
          {paymentRecoveryRef && (
            <div className="overlay open">
              <div className="sheet" style={{ maxWidth: 480 }}>
                <div className="sheet-body" style={{ textAlign: 'center', padding: '32px 20px' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                  <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
                    Payment may have been taken
                  </h3>
                  <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                    We lost connection right after Paystack confirmed your payment. Please check your mobile money balance.
                    If you were charged, your order is safe — use the reference below to track it or contact support.
                  </p>
                  <div className="ref-box">
                    <span className="ref-val">{paymentRecoveryRef}</span>
                    <button className="copy-btn" onClick={() => copyRef(paymentRecoveryRef)}>Copy</button>
                  </div>
                  <button
                    className="btn btn-full"
                    style={{ background: 'linear-gradient(135deg,#00d4aa,#00b894)', color: '#060910', marginTop: 14, justifyContent: 'center', fontWeight: 700 }}
                    onClick={() => { setTrackRef(paymentRecoveryRef); setTrackResult(null); setTrackOpen(true); }}
                  >
                    🔍 Track This Order
                  </button>
                  {agent?.whatsapp && (
                    <a
                      href={`https://wa.me/233${agent.whatsapp.replace(/^0/, '')}?text=${encodeURIComponent(`Hi, I need help with a payment that may not have completed. Reference: ${paymentRecoveryRef}`)}`}
                      className="btn btn-full"
                      style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', marginTop: 8, justifyContent: 'center' }}
                      target="_blank" rel="noopener noreferrer"
                    >
                      💬 Contact Agent on WhatsApp
                    </a>
                  )}
                  <button
                    className="btn btn-secondary btn-full"
                    style={{ marginTop: 8 }}
                    onClick={() => { setPaymentRecoveryRef(''); setOrderOpen(false); setOrderStep(1); clearPendingRef(); }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

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

                  {orderStep === 1 && (
                    <div>
                      <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800 }}>{selectedBundle.size}</div>
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{NET_NAMES[currentNet]}{selectedBundle.type ? ' · ' + selectedBundle.type : ''} · {selectedBundle.validity}</div>
                          </div>
                          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                            {fmt(getPrice(selectedBundle.key, selectedBundle.cost))}
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Recipient Phone Number</label>
                        <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={phone} onChange={e => onPhoneChange(e.target.value)} />
                        {phoneHint && <div className="form-hint" style={{ color: phoneHint.ok ? 'var(--ok)' : 'var(--warn)' }}>{phoneHint.text}</div>}
                      </div>
                      <button className="btn btn-primary btn-full btn-lg" onClick={goStep2}>Continue</button>
                    </div>
                  )}

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

                  {orderStep === 3 && (
                    <div className="success-anim">
                      <div className="success-check">✓</div>
                      <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Order Placed!</h3>
                      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Your data will arrive within 5–60 minutes. Save your reference:</p>
                      <div className="ref-box">
                        <span className="ref-val">{successRef}</span>
                        <button className="copy-btn" onClick={() => copyRef(successRef)}>Copy</button>
                      </div>
                      <a href={`/receipt/${successRef}`} className="btn btn-full" style={{ background: 'linear-gradient(135deg,#00d4aa,#00b894)', color: '#060910', marginTop: 12, justifyContent: 'center', fontWeight: 700 }}>
                        🧾 View Full Receipt
                      </a>
                      {agent?.whatsapp && (
                        <a href={waLink(successRef)} className="btn btn-full" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', marginTop: 8, justifyContent: 'center' }} target="_blank" rel="noopener noreferrer">
                          WhatsApp Support
                        </a>
                      )}
                      <button className="btn btn-secondary btn-full" style={{ marginTop: 8 }} onClick={() => { setOrderOpen(false); setOrderStep(1); }}>Buy Another</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Track order overlay */}
          {trackOpen && (
            <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) setTrackOpen(false); }}>
              <div className="sheet">
                <div className="sheet-header">
                  <div className="sheet-title">Track Order</div>
                  <button className="close-btn" onClick={() => setTrackOpen(false)}>✕</button>
                </div>
                <div className="sheet-body">
                  {/* Mode toggle */}
                  <div className="tab-nav" style={{ marginBottom: 16 }}>
                    <button className={`tab-btn${trackMode === 'ref' ? ' active' : ''}`} onClick={() => { setTrackMode('ref'); setTrackResult(null); }}>By Reference</button>
                    <button className={`tab-btn${trackMode === 'phone' ? ' active' : ''}`} onClick={() => { setTrackMode('phone'); setPhoneOrders(null); }}>By Phone</button>
                  </div>

                  {trackMode === 'ref' ? (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Enter your transaction reference to check delivery status.</p>
                      <div className="form-group">
                        <label className="form-label">Transaction Reference</label>
                        <input className="form-input" placeholder="e.g. DF-XXXX-XXXX" value={trackRef} onChange={e => setTrackRef(e.target.value)} />
                      </div>
                      {trackResult && !trackResult.found && (
                        <div className="alert alert-error" style={{ marginBottom: 12 }}>{trackResult.msg}</div>
                      )}
                      {trackResult && trackResult.found && (() => {
                        const o = trackResult.order;
                        const payOk = o.status === 'success';
                        const dlv = o.delivery_status || 'pending';
                        const dlvMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
                          delivered:  { label: 'Delivered',  color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✓' },
                          pending:    { label: 'Processing',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
                          processing: { label: 'Processing',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
                          failed:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳', label: 'Placed' },
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
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Enter the phone number you bought data for to see all your orders.</p>
                      <div className="form-group">
                        <label className="form-label">Phone Number</label>
                        <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={trackPhone} onChange={e => setTrackPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && trackByPhone()} />
                      </div>
                      {phoneOrders !== null && phoneOrders.length === 0 && (
                        <div className="alert alert-error" style={{ marginBottom: 12 }}>No orders found for this number.</div>
                      )}
                      {phoneOrders && phoneOrders.length > 0 && (
                        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {phoneOrders.map(o => {
                            const dlvColors: Record<string, { color: string; label: string }> = {
                              delivered:  { color: '#10b981', label: '✓ Delivered' },
                              processing: { color: '#f59e0b', label: '⏳ Processing' },
                              pending:    { color: '#f59e0b', label: '⏳ Processing' },
                              failed:     { color: '#f59e0b', label: '⏳ Placed' },
                            };
                            const dlv = dlvColors[o.delivery_status] || dlvColors.pending;
                            return (
                              <a key={o.reference} href={`/receipt/${o.reference}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--surface2)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 14 }}>{o.size} · {NET_NAMES[o.network] || o.network}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{new Date(o.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: dlv.color }}>{dlv.label}</div>
                                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>View Receipt →</div>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      )}
                      <button className="btn btn-primary btn-full" onClick={trackByPhone}>Find My Orders</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
	  <ServiceBanner />
          <ToastContainer />
        </>
      )}
    </>
  );
}
