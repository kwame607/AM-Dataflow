// components/QuickOrderModal.tsx — NEW FILE
// Lets an agent place an order paid directly from their wallet balance,
// without leaving the dashboard or going through Paystack. Useful for
// agents who keep a wallet balance and want instant checkout for
// customers who pay them in cash/MoMo directly.
'use client';

import React, { useState } from 'react';
import { BUNDLES, NET_NAMES } from '@/lib/bundles';
import { detectNetwork, fmt } from '@/lib/utils';
import type { Wallet } from '@/types/wallet';

interface QuickOrderModalProps {
  agent: { id: string; slug: string };
  wallet: Wallet | null;
  agentPrices: Record<string, number>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
  onClose: () => void;
  onOrderPlaced: () => void;
}

export function QuickOrderModal({ agent, wallet, agentPrices, authFetch, toast, onClose, onOrderPlaced }: QuickOrderModalProps) {
  const [network, setNetwork] = useState('mtn');
  const [bundleKey, setBundleKey] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successRef, setSuccessRef] = useState('');

  const bundle = BUNDLES[network]?.find(b => b.key === bundleKey);
  const price  = bundle ? (agentPrices[bundle.key] ?? bundle.cost) : 0;
  const insufficientBalance = wallet ? price > wallet.balance : true;

  async function submit() {
    if (!bundle) { toast('Select a bundle', 'warn'); return; }
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
          bundleKey: bundle.key,
          source: 'agent',
          agentSlug: agent.slug,
          agentPrice: price,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Order failed', 'error'); return; }
      setSuccessRef(d.reference);
      toast('Order placed from wallet!', 'success');
      onOrderPlaced();
    } catch { toast('Network error', 'error'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="modal open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="modal-title" style={{ margin: 0 }}>⚡ Quick Order (Wallet)</div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {successRef ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Order Placed!</div>
            <div className="ref-box" style={{ marginBottom: 16 }}>
              <span className="ref-val">{successRef}</span>
            </div>
            <button className="btn btn-primary btn-full" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Wallet Balance</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, color: 'var(--accent)' }}>{fmt(wallet?.balance || 0)}</span>
            </div>

            <div className="form-group">
              <label className="form-label">Network</label>
              <select className="form-input" value={network} onChange={e => { setNetwork(e.target.value); setBundleKey(''); }}>
                <option value="mtn">MTN</option>
                <option value="at">AirtelTigo</option>
                <option value="telecel">Telecel</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Bundle</label>
              <select className="form-input" value={bundleKey} onChange={e => setBundleKey(e.target.value)}>
                <option value="">Select a bundle…</option>
                {(BUNDLES[network] || []).map(b => (
                  <option key={b.key} value={b.key}>{b.size} — {fmt(agentPrices[b.key] ?? b.cost)}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Recipient Phone Number</label>
              <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={phone} onChange={e => setPhone(e.target.value)} />
              {phone.length === 10 && detectNetwork(phone) && detectNetwork(phone) !== network && (
                <div className="form-hint" style={{ color: 'var(--warn)' }}>
                  Detected: {NET_NAMES[detectNetwork(phone) as string]} — sending {NET_NAMES[network]} data to this number
                </div>
              )}
            </div>

            {bundle && (
              <div className="order-summary" style={{ marginBottom: 16 }}>
                <div className="order-summary-row total"><span>Total (from wallet)</span><span>{fmt(price)}</span></div>
              </div>
            )}

            {insufficientBalance && bundle && (
              <div className="alert alert-error" style={{ marginBottom: 14, fontSize: 12 }}>
                <span>⚠</span><span>Insufficient wallet balance for this bundle.</span>
              </div>
            )}

            <button className="btn btn-primary btn-full" onClick={submit} disabled={submitting || !bundle || insufficientBalance}>
              {submitting ? <><span className="spinner" /> Processing…</> : `Pay ${bundle ? fmt(price) : ''} from Wallet`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
