// components/QuickBuyPanel.tsx — NEW FILE
// Full redesign of the self-service "Quick Buy" experience, replacing the
// plain QuickOrderModal with: network pills, clickable bundle cards with
// favoriting, a recipient field with recent-number suggestions, recent
// purchases with one-click repeat, and a smart "frequently bought" suggestion
// row. Still pays from the agent's wallet (same backend as QuickOrderModal —
// POST /api/wallet/purchase), so no new payment logic is introduced.
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BUNDLES, NET_NAMES } from '@/lib/bundles';
import { detectNetwork, fmt, fmtDate } from '@/lib/utils';
import type { Wallet } from '@/types/wallet';
import type { Order } from '@/types';

interface QuickBuyPanelProps {
  agent: { id: string; slug: string };
  wallet: Wallet | null;
  agentPrices: Record<string, number>;
  orders: Order[];
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
  onOrderPlaced: () => void;
}

const NET_COLORS: Record<string, string> = { mtn: '#f59e0b', at: '#3b82f6', telecel: '#ef4444' };

export function QuickBuyPanel({ agent, wallet, agentPrices, orders, authFetch, toast, onOrderPlaced }: QuickBuyPanelProps) {
  const [network, setNetwork] = useState('mtn');
  const [bundleKey, setBundleKey] = useState('');
  const [phone, setPhone] = useState('');
  const [showRecents, setShowRecents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successRef, setSuccessRef] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favsLoaded, setFavsLoaded] = useState(false);

  // ── Load favorites once ──────────────────────────────────────
  useEffect(() => {
    authFetch(`/api/agents/favorites?agentId=${agent.id}`)
      .then(r => r.json())
      .then(d => setFavorites(new Set(Array.isArray(d.favorites) ? d.favorites : [])))
      .catch(() => {})
      .finally(() => setFavsLoaded(true));
  }, [agent.id, authFetch]);

  async function toggleFavorite(key: string) {
    const isFav = favorites.has(key);
    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev);
      isFav ? next.delete(key) : next.add(key);
      return next;
    });
    try {
      const method = isFav ? 'DELETE' : 'POST';
      const r = await authFetch('/api/agents/favorites', { method, body: JSON.stringify({ agentId: agent.id, bundleKey: key }) });
      if (!r.ok) throw new Error();
    } catch {
      // Revert on failure
      setFavorites(prev => {
        const next = new Set(prev);
        isFav ? next.add(key) : next.delete(key);
        return next;
      });
      toast('Could not update favorite', 'error');
    }
  }

  // ── Recent numbers (from order history, this agent's orders only) ──
  const recentNumbers = useMemo(() => {
    const seen = new Map<string, string>(); // phone -> most recent created_at
    orders.forEach(o => {
      if (!o.phone) return;
      const existing = seen.get(o.phone);
      if (!existing || o.created_at > existing) seen.set(o.phone, o.created_at);
    });
    return Array.from(seen.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 6)
      .map(([phone]) => phone);
  }, [orders]);

  // ── Recent purchases (last 5 successful orders, for one-click repeat) ──
  const recentPurchases = useMemo(() => {
    return orders
      .filter(o => o.status === 'success')
      .slice(0, 5);
  }, [orders]);

  // ── Smart suggestions: bundles bought 2+ times, ranked by frequency ──
  const suggestedBundles = useMemo(() => {
    const counts = new Map<string, number>();
    orders.forEach(o => {
      if (o.status === 'success' && o.bundle_key) {
        counts.set(o.bundle_key, (counts.get(o.bundle_key) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key]) => key);
  }, [orders]);

  function findBundle(key: string) {
    for (const net of Object.keys(BUNDLES)) {
      const b = BUNDLES[net].find(x => x.key === key);
      if (b) return { ...b, network: net };
    }
    return null;
  }

  const currentBundle = BUNDLES[network]?.find(b => b.key === bundleKey);
  const price = currentBundle ? (agentPrices[currentBundle.key] ?? currentBundle.cost) : 0;
  const insufficientBalance = wallet ? price > wallet.balance : true;

  const detectedNet = phone.length === 10 ? detectNetwork(phone) : null;
  const networkMismatch = detectedNet && detectedNet !== network;

  function selectSuggested(key: string) {
    const found = findBundle(key);
    if (!found) return;
    setNetwork(found.network);
    setBundleKey(found.key);
  }

  function repeatOrder(o: Order) {
    setNetwork(o.network);
    setBundleKey(o.bundle_key);
    setPhone(o.phone);
  }

  const resetForm = useCallback(() => {
    setBundleKey('');
    setPhone('');
    setSuccessRef('');
  }, []);

  async function submit() {
    if (!currentBundle) { toast('Select a bundle', 'warn'); return; }
    if (phone.length !== 10) { toast('Enter a valid 10-digit phone number', 'warn'); return; }
    if (insufficientBalance) { toast('Insufficient wallet balance', 'error'); return; }

    setSubmitting(true);
    try {
      const r = await authFetch('/api/wallet/purchase', {
        method: 'POST',
        body: JSON.stringify({
          agentId: agent.id,
          phone,
          network,
          bundleKey: currentBundle.key,
          source: 'agent',
          agentSlug: agent.slug,
          agentPrice: price,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Order failed', 'error'); return; }
      setSuccessRef(d.reference);
      toast('Order placed!', 'success');
      onOrderPlaced();
    } catch { toast('Network error', 'error'); }
    finally { setSubmitting(false); }
  }

  // ── Success state ────────────────────────────────────────────
  if (successRef) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Order Placed!</div>
          <div className="ref-box" style={{ marginBottom: 16, maxWidth: 320, margin: '0 auto 16px' }}>
            <span className="ref-val">{successRef}</span>
          </div>
          <button className="btn btn-primary" onClick={resetForm}>Buy Another</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Wallet balance strip */}
      <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Wallet Balance</span>
        <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>{fmt(wallet?.balance || 0)}</span>
      </div>

      {/* Smart suggestions */}
      {suggestedBundles.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            ⚡ Frequently Bought
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {suggestedBundles.map(key => {
              const b = findBundle(key);
              if (!b) return null;
              const active = bundleKey === key;
              return (
                <button
                  key={key}
                  onClick={() => selectSuggested(key)}
                  style={{
                    flexShrink: 0, padding: '8px 14px', borderRadius: 10,
                    background: active ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    color: active ? 'var(--accent)' : 'var(--text)', fontSize: 12, fontWeight: 700,
                    whiteSpace: 'nowrap', cursor: 'pointer',
                  }}
                >
                  {b.size} {NET_NAMES[b.network]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Network pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['mtn', 'at', 'telecel'] as const).map(net => {
          const active = network === net;
          return (
            <button
              key={net}
              onClick={() => { setNetwork(net); setBundleKey(''); }}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, textAlign: 'center',
                background: active ? NET_COLORS[net] : 'var(--surface2)',
                border: `1px solid ${active ? NET_COLORS[net] : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--text)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all .15s',
              }}
            >
              {NET_NAMES[net]}
            </button>
          );
        })}
      </div>

      {/* Bundle cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8, marginBottom: 18, maxHeight: 280, overflowY: 'auto' }}>
        {(BUNDLES[network] || []).map(b => {
          const active = bundleKey === b.key;
          const isFav = favorites.has(b.key);
          const bPrice = agentPrices[b.key] ?? b.cost;
          return (
            <div
              key={b.key}
              onClick={() => setBundleKey(b.key)}
              style={{
                position: 'relative', cursor: 'pointer', textAlign: 'center',
                padding: '14px 8px 10px', borderRadius: 12,
                background: active ? 'var(--accent-dim)' : 'var(--surface2)',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all .15s',
              }}
            >
              <button
                onClick={e => { e.stopPropagation(); toggleFavorite(b.key); }}
                style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: isFav ? '#f59e0b' : 'var(--text3)', fontSize: 14,
                }}
                aria-label="Toggle favorite"
              >
                {isFav ? '★' : '☆'}
              </button>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 800, color: active ? 'var(--accent)' : 'var(--text)' }}>{b.size}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginTop: 2 }}>{fmt(bPrice)}</div>
            </div>
          );
        })}
      </div>

      {/* Recipient phone */}
      <div className="form-group">
        <label className="form-label">Recipient Phone Number</label>
        <div style={{ position: 'relative' }}>
          <input
            className="form-input"
            type="tel"
            placeholder="0241234567"
            maxLength={10}
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onFocus={() => setShowRecents(true)}
            onBlur={() => setTimeout(() => setShowRecents(false), 150)}
          />
          {showRecents && recentNumbers.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>
                Recent Numbers
              </div>
              {recentNumbers.map(n => (
                <button
                  key={n}
                  onMouseDown={() => setPhone(n)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  📱 {n}
                </button>
              ))}
            </div>
          )}
        </div>
        {networkMismatch && (
          <div className="form-hint" style={{ color: 'var(--warn)' }}>
            Detected: {NET_NAMES[detectedNet as string]} — sending {NET_NAMES[network]} data to this number
          </div>
        )}
      </div>

      {/* Order summary + submit */}
      {currentBundle && (
        <div className="order-summary" style={{ marginBottom: 16 }}>
          <div className="order-summary-row"><span>Bundle</span><span>{currentBundle.size} {NET_NAMES[network]}</span></div>
          <div className="order-summary-row total"><span>Pay from Wallet</span><span>{fmt(price)}</span></div>
        </div>
      )}

      {insufficientBalance && currentBundle && (
        <div className="alert alert-error" style={{ marginBottom: 14, fontSize: 12 }}>
          <span>⚠</span><span>Insufficient wallet balance for this bundle.</span>
        </div>
      )}

      <button className="btn btn-primary btn-full btn-lg" onClick={submit} disabled={submitting || !currentBundle || insufficientBalance || phone.length !== 10}>
        {submitting ? <><span className="spinner" /> Processing…</> : currentBundle ? `Pay ${fmt(price)} from Wallet` : 'Select a bundle'}
      </button>

      {/* Recent purchases — one-click repeat */}
      {recentPurchases.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Recent Purchases
          </div>
          <div className="card">
            {recentPurchases.map(o => (
              <div key={o.id} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{o.size} {NET_NAMES[o.network] || o.network}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{o.phone} · {fmtDate(o.created_at)}</div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => repeatOrder(o)} style={{ flexShrink: 0 }}>↻ Repeat</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
