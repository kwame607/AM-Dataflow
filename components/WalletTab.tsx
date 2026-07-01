// components/WalletTab.tsx — NEW FILE
// Drop inside app/dashboard/page.tsx as a new tab.
// Add 'wallet' and 'transactions' to the Tab type and navItems array.
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Wallet, WalletTransaction, DepositClaim } from '@/types/wallet';
import { WALLET_TXN_LABELS, COLLECTION_ACCOUNTS } from '@/types/wallet';
import { fmt, fmtDate } from '@/lib/utils';
import { openPaystack } from '@/lib/paystack';

interface WalletTabProps {
  agent: { id: string; name: string; email?: string; slug: string };
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
  onWalletUpdate?: (wallet: Wallet) => void;
}

const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '';

export function WalletTab({ agent, authFetch, toast, onWalletUpdate }: WalletTabProps) {
  const [wallet, setWallet]       = useState<Wallet | null>(null);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<'overview' | 'fund' | 'claim' | 'history'>('overview');

  // Fund via Paystack
  const [fundAmount, setFundAmount] = useState('');
  const [funding, setFunding]       = useState(false);

  // Claim deposit form
  const [claimNetwork, setClaimNetwork] = useState('mtn');
  const [claimSender, setClaimSender]   = useState('');
  const [claimTxnId, setClaimTxnId]     = useState('');
  const [claimAmount, setClaimAmount]   = useState('');
  const [claimProof, setClaimProof]     = useState<{ url: string; preview: string } | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // History
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [claims, setClaims]             = useState<DepositClaim[]>([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const r = await authFetch(`/api/wallet?agentId=${agent.id}`);
      const d = await r.json();
      if (d.wallet) {
        setWallet(d.wallet);
        onWalletUpdate?.(d.wallet);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [agent.id, authFetch, onWalletUpdate]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams({ agentId: agent.id, limit: '100' });
      if (historyFilter !== 'all') qs.set('type', historyFilter);
      const [txnRes, claimRes] = await Promise.all([
        authFetch(`/api/wallet/transactions?${qs}`).then(r => r.json()),
        authFetch(`/api/wallet/claims?agentId=${agent.id}`).then(r => r.json()),
      ]);
      setTransactions(Array.isArray(txnRes.transactions) ? txnRes.transactions : []);
      setClaims(Array.isArray(claimRes) ? claimRes : []);
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
  }, [agent.id, authFetch, historyFilter]);

  useEffect(() => { loadWallet(); }, [loadWallet]);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  async function fundWithPaystack() {
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount < 10) { toast('Minimum top-up is GHS 10', 'warn'); return; }
    if (!PAYSTACK_KEY) { toast('Payment not configured. Contact support.', 'error'); return; }
    setFunding(true);
    try {
      const initRes = await authFetch('/api/wallet/fund/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, email: agent.email || `${agent.slug}@admunz.com`, amount }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) { toast(initData.error || 'Could not start payment', 'error'); setFunding(false); return; }

      await openPaystack({
        key: PAYSTACK_KEY,
        email: agent.email || `${agent.slug}@admunz.com`,
        amount: Math.round(amount * 100),
        currency: 'GHS',
        access_code: initData.access_code,
        reference: initData.reference,
        callback: async (_ps: { reference: string }) => {
          try {
            const verifyRes = await authFetch('/api/wallet/fund/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: _ps.reference, agentId: agent.id }),
            });
            const result = await verifyRes.json();
            if (result.success) {
              toast(`Wallet funded with ${fmt(result.amount || amount)}!`, 'success');
              setFundAmount('');
              setView('overview');
              await loadWallet();
            } else {
              toast(result.error || 'Funding verification failed', 'error');
            }
          } catch {
            toast('Payment received — refresh to see updated balance', 'info');
          } finally {
            setFunding(false);
          }
        },
        onClose: () => { setFunding(false); toast('Payment cancelled', 'info'); },
      });
    } catch (e) {
      toast('Payment error: ' + (e instanceof Error ? e.message : String(e)), 'error');
      setFunding(false);
    }
  }

  async function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('agentId', agent.id);
      const r = await fetch('/api/wallet/claims/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Upload failed', 'error'); return; }
      setClaimProof({ url: d.url, preview: URL.createObjectURL(file) });
      toast('Proof uploaded!', 'success');
    } catch { toast('Upload error', 'error'); }
    finally { setUploadingProof(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function submitClaim() {
    if (!claimSender.trim() || !claimTxnId.trim() || !claimAmount) {
      toast('Fill in all required fields', 'warn');
      return;
    }
    const amount = parseFloat(claimAmount);
    if (isNaN(amount) || amount <= 0) { toast('Enter a valid amount', 'warn'); return; }

    setSubmittingClaim(true);
    try {
      const r = await authFetch('/api/wallet/claims', {
        method: 'POST',
        body: JSON.stringify({
          agentId: agent.id,
          network: claimNetwork,
          senderNumber: claimSender.trim(),
          transactionId: claimTxnId.trim(),
          amount,
          proofUrl: claimProof?.url,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to submit claim', 'error'); return; }
      toast('Deposit claim submitted! We\'ll review it shortly.', 'success');
      setClaimSender(''); setClaimTxnId(''); setClaimAmount(''); setClaimProof(null);
      setView('overview');
    } catch { toast('Network error', 'error'); }
    finally { setSubmittingClaim(false); }
  }

  const isLowBalance = wallet && wallet.balance < (wallet.low_balance_threshold || 50);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
      </div>
    );
  }

  // ── OVERVIEW ──────────────────────────────────────────────
  if (view === 'overview') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Wallet</div>
          <div className="page-subtitle">Fund your wallet to pay for orders instantly</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setView('history')}>📜 Transaction History</button>
      </div>

      {wallet?.is_frozen && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>🔒</span><span>Your wallet is frozen. Contact support for assistance.</span>
        </div>
      )}

      {isLowBalance && !wallet?.is_frozen && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          <span>⚠</span><span>Your wallet balance is low. Top up to avoid order interruptions.</span>
        </div>
      )}

      <div className="withdraw-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <svg width="18" height="18" fill="none" stroke="var(--accent)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Wallet Balance</span>
        </div>
        <div className="earn-bal">{fmt(wallet?.balance || 0)}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setView('fund')}>💳 Fund via Paystack</button>
          <button className="btn btn-secondary" onClick={() => setView('claim')}>📤 Send & Claim Deposit</button>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Total Deposited', val: fmt(wallet?.total_deposited || 0), icon: '⬇', bg: 'rgba(16,185,129,0.12)', color: 'var(--ok)' },
          { label: 'Total Spent',     val: fmt(wallet?.total_spent || 0),     icon: '📦', bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
          { label: 'Pending',        val: fmt(wallet?.pending_balance || 0), icon: '⏳', bg: 'rgba(245,158,11,0.12)', color: 'var(--warn)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val">{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── FUND VIA PAYSTACK ────────────────────────────────────
  if (view === 'fund') return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setView('overview')}>← Back</button>
        <div className="page-title" style={{ fontSize: 18 }}>Fund via Paystack</div>
      </div>
      <div className="card">
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Amount (GHS)</label>
            <input className="form-input" type="number" min="10" placeholder="Min: 10.00" value={fundAmount} onChange={e => setFundAmount(e.target.value)} />
            <div className="form-hint">Minimum top-up is GHS 10.00</div>
          </div>
          <button className="btn btn-primary btn-full btn-lg" onClick={fundWithPaystack} disabled={funding}>
            {funding ? <><span className="spinner" /> Processing…</> : `Pay ${fundAmount ? fmt(parseFloat(fundAmount) || 0) : ''}`}
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Secured by Paystack · Instant credit</p>
        </div>
      </div>
    </div>
  );

  // ── CLAIM DEPOSIT ─────────────────────────────────────────
  if (view === 'claim') return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setView('overview')}>← Back</button>
        <div className="page-title" style={{ fontSize: 18 }}>Send & Claim Deposit</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">1. Send Money To</div></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COLLECTION_ACCOUNTS.map(acc => (
            <div key={acc.network} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>{acc.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{acc.number}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{acc.name}</div>
              </div>
              <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(acc.number); toast('Number copied!', 'success', 1500); }}>Copy</button>
            </div>
          ))}
          <div className="alert alert-info" style={{ marginTop: 4 }}>
            <span>ℹ</span><span>Minimum deposit is GHS 100. After sending, fill out the claim form below.</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">2. Claim Your Deposit</div></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Network Sent From</label>
            <select className="form-input" value={claimNetwork} onChange={e => setClaimNetwork(e.target.value)}>
              <option value="mtn">MTN MoMo</option>
              <option value="telecel">Telecel Cash</option>
              <option value="at">AirtelTigo Money</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Your Number (sender)</label>
            <input className="form-input" type="tel" placeholder="0241234567" value={claimSender} onChange={e => setClaimSender(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Transaction ID</label>
            <input className="form-input" placeholder="e.g. from your MoMo SMS confirmation" value={claimTxnId} onChange={e => setClaimTxnId(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Amount Sent (GHS)</label>
            <input className="form-input" type="number" min="1" placeholder="100.00" value={claimAmount} onChange={e => setClaimAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Screenshot Proof (optional)</label>
            {claimProof ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={claimProof.preview} alt="proof" style={{ height: 100, borderRadius: 8, border: '1px solid var(--border)' }} />
                <button onClick={() => setClaimProof(null)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: 'var(--err)', color: '#fff', fontSize: 12, border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProofUpload} />
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploadingProof} style={{ width: 'fit-content' }}>
                  {uploadingProof ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Uploading…</> : '📎 Attach Screenshot'}
                </button>
              </>
            )}
          </div>
          <button className="btn btn-primary btn-full" onClick={submitClaim} disabled={submittingClaim}>
            {submittingClaim ? <><span className="spinner" /> Submitting…</> : 'Submit Claim'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── HISTORY ───────────────────────────────────────────────
  if (view === 'history') {
    const filters = ['all', 'deposit', 'purchase', 'refund', 'bonus'];
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setView('overview')}>← Back</button>
          <div className="page-title" style={{ fontSize: 18 }}>Transaction History</div>
        </div>

        <div className="tab-nav">
          {filters.map(f => (
            <button key={f} className={`tab-btn${historyFilter === f ? ' active' : ''}`} onClick={() => setHistoryFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {claims.filter(c => c.status === 'pending').length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-title">⏳ Pending Claims</div></div>
            <div style={{ padding: '0 0 4px' }}>
              {claims.filter(c => c.status === 'pending').map(c => (
                <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(c.amount)} · {c.network.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.sender_number} · {fmtDate(c.created_at)}</div>
                  </div>
                  <span className="badge badge-pending">Pending Review</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : transactions.length === 0 ? (
            <div className="empty"><div className="empty-icon">💳</div><div className="empty-title">No transactions yet</div></div>
          ) : (
            transactions.map(t => {
              const cfg = WALLET_TXN_LABELS[t.type];
              const isCredit = ['deposit', 'refund', 'bonus'].includes(t.type);
              return (
                <div key={t.id} style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cfg.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{cfg.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.description || cfg.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(t.created_at)} · {t.reference}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: isCredit ? 'var(--ok)' : 'var(--err)' }}>
                      {isCredit ? '+' : '-'}{fmt(t.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bal: {fmt(t.balance_after)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return null;
}
