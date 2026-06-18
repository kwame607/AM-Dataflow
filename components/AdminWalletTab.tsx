// components/AdminWalletTab.tsx — NEW FILE
// Drop inside app/xena-173424/page.tsx as a new tab.
// Add 'wallets' to the admin Tab type and navItems array.
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Agent } from '@/types';
import type { Wallet, DepositClaim } from '@/types/wallet';
import { fmt, fmtDate } from '@/lib/utils';

interface AdminWalletTabProps {
  agents: Agent[];
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
}

export function AdminWalletTab({ agents, authFetch, toast }: AdminWalletTabProps) {
  const [view, setView] = useState<'wallets' | 'claims'>('claims');
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [claims, setClaims]   = useState<DepositClaim[]>([]);
  const [claimFilter, setClaimFilter] = useState('pending');
  const [loading, setLoading] = useState(true);

  // Adjust modal
  const [adjustAgent, setAdjustAgent] = useState<Agent | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'bonus' | 'adjustment'>('adjustment');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Claim review modal
  const [reviewClaim, setReviewClaim] = useState<DepositClaim | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const loadClaims = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ admin: '1' });
      if (claimFilter !== 'all') qs.set('status', claimFilter);
      const r = await authFetch(`/api/wallet/claims?${qs}`);
      const d = await r.json();
      setClaims(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
  }, [authFetch, claimFilter]);

  const loadWallets = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        agents.map(a => authFetch(`/api/wallet?agentId=${a.id}`).then(r => r.json()).catch(() => null))
      );
      const map: Record<string, Wallet> = {};
      results.forEach((res, i) => { if (res?.wallet) map[agents[i].id] = res.wallet; });
      setWallets(map);
    } finally { setLoading(false); }
  }, [agents, authFetch]);

  useEffect(() => { loadClaims(); }, [loadClaims]);
  useEffect(() => { if (view === 'wallets' && agents.length > 0) loadWallets(); }, [view, agents, loadWallets]);

  async function submitAdjustment() {
    if (!adjustAgent) return;
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount === 0) { toast('Enter a valid amount', 'warn'); return; }

    setAdjusting(true);
    try {
      const r = await authFetch('/api/wallet', {
        method: 'POST',
        body: JSON.stringify({ agentId: adjustAgent.id, amount, type: adjustType, description: adjustNote || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed', 'error'); return; }
      toast(`Wallet ${amount > 0 ? 'credited' : 'debited'} successfully`, 'success');
      setAdjustAgent(null);
      setAdjustAmount('');
      setAdjustNote('');
      await loadWallets();
    } catch { toast('Network error', 'error'); }
    finally { setAdjusting(false); }
  }

  async function toggleFreeze(agentId: string, frozen: boolean) {
    try {
      const r = await authFetch('/api/wallet', {
        method: 'PATCH',
        body: JSON.stringify({ agentId, frozen }),
      });
      if (!r.ok) { toast('Failed to update', 'error'); return; }
      toast(frozen ? 'Wallet frozen' : 'Wallet unfrozen', 'success');
      await loadWallets();
    } catch { toast('Network error', 'error'); }
  }

  async function reviewClaimSubmit(status: 'approved' | 'rejected') {
    if (!reviewClaim) return;
    setReviewing(true);
    try {
      const r = await authFetch('/api/wallet/claims', {
        method: 'PATCH',
        body: JSON.stringify({ claimId: reviewClaim.id, status, adminNote: reviewNote || undefined, reviewedBy: 'admin' }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed', 'error'); return; }
      toast(`Claim ${status}`, 'success');
      setReviewClaim(null);
      setReviewNote('');
      await loadClaims();
    } catch { toast('Network error', 'error'); }
    finally { setReviewing(false); }
  }

  const claimStatusCounts = {
    pending:  claims.filter(c => c.status === 'pending').length,
    approved: claims.filter(c => c.status === 'approved').length,
    rejected: claims.filter(c => c.status === 'rejected').length,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Wallet Management</div>
          <div className="page-subtitle">Manage agent wallets and review deposit claims</div>
        </div>
        <div className="tab-nav" style={{ marginBottom: 0 }}>
          <button className={`tab-btn${view === 'claims' ? ' active' : ''}`} onClick={() => setView('claims')}>
            Deposit Claims {claimStatusCounts.pending > 0 && <span style={{ marginLeft: 6, background: 'var(--err)', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 6px' }}>{claimStatusCounts.pending}</span>}
          </button>
          <button className={`tab-btn${view === 'wallets' ? ' active' : ''}`} onClick={() => setView('wallets')}>All Wallets</button>
        </div>
      </div>

      {/* ── DEPOSIT CLAIMS ── */}
      {view === 'claims' && (
        <div>
          <div className="tab-nav">
            {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
              <button key={f} className={`tab-btn${claimFilter === f ? ' active' : ''}`} onClick={() => setClaimFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="card">
            {claims.length === 0 ? (
              <div className="empty"><div className="empty-icon">💰</div><div className="empty-title">No claims found</div></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Agent</th><th>Network</th><th>Sender</th><th>Txn ID</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                  <tbody>
                    {claims.map((c: DepositClaim & { agent_name?: string }) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.agent_name || '—'}</td>
                        <td><span className={`badge badge-${c.network}`}>{c.network.toUpperCase()}</span></td>
                        <td className="mono">{c.sender_number}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{c.transaction_id}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(c.amount)}</td>
                        <td>
                          <span className={`badge badge-${c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'failed' : 'pending'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtDate(c.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {c.proof_url && (
                              <a href={c.proof_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">📷 Proof</a>
                            )}
                            {c.status === 'pending' && (
                              <button className="btn btn-sm btn-primary" onClick={() => setReviewClaim(c)}>Review</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ALL WALLETS ── */}
      {view === 'wallets' && (
        <div className="card">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Agent</th><th>Balance</th><th>Total Deposited</th><th>Total Spent</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {agents.map(a => {
                    const w = wallets[a.id];
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.name}<div style={{ fontSize: 11, color: 'var(--text3)' }}>/store/{a.slug}</div></td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(w?.balance || 0)}</td>
                        <td style={{ color: 'var(--ok)' }}>{fmt(w?.total_deposited || 0)}</td>
                        <td style={{ color: '#f87171' }}>{fmt(w?.total_spent || 0)}</td>
                        <td>{w?.is_frozen ? <span className="badge badge-failed">Frozen</span> : <span className="badge badge-success">Active</span>}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => setAdjustAgent(a)}>Adjust</button>
                            <button
                              className="btn btn-sm"
                              style={{ background: w?.is_frozen ? 'var(--ok-dim)' : 'var(--err-dim)', color: w?.is_frozen ? 'var(--ok)' : 'var(--err)', border: `1px solid ${w?.is_frozen ? 'var(--ok)' : 'var(--err)'}` }}
                              onClick={() => toggleFreeze(a.id, !w?.is_frozen)}
                            >
                              {w?.is_frozen ? 'Unfreeze' : 'Freeze'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ADJUST WALLET MODAL ── */}
      {adjustAgent && (
        <div className="modal open" onClick={e => { if (e.target === e.currentTarget) setAdjustAgent(null); }}>
          <div className="modal-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="modal-title" style={{ margin: 0 }}>Adjust Wallet — {adjustAgent.name}</div>
              <button className="close-btn" onClick={() => setAdjustAgent(null)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-input" value={adjustType} onChange={e => setAdjustType(e.target.value as 'bonus' | 'adjustment')}>
                <option value="adjustment">Manual Adjustment</option>
                <option value="bonus">Bonus Credit</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount (GHS) — use negative to debit</label>
              <input className="form-input" type="number" placeholder="e.g. 50 or -20" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input className="form-input" placeholder="Reason for adjustment" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-full" onClick={submitAdjustment} disabled={adjusting}>
              {adjusting ? <><span className="spinner" /> Processing…</> : 'Apply Adjustment'}
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW CLAIM MODAL ── */}
      {reviewClaim && (
        <div className="modal open" onClick={e => { if (e.target === e.currentTarget) setReviewClaim(null); }}>
          <div className="modal-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="modal-title" style={{ margin: 0 }}>Review Deposit Claim</div>
              <button className="close-btn" onClick={() => setReviewClaim(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: 'var(--text3)' }}>Network</span><strong>{reviewClaim.network.toUpperCase()}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: 'var(--text3)' }}>Sender</span><strong>{reviewClaim.sender_number}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: 'var(--text3)' }}>Transaction ID</span><strong>{reviewClaim.transaction_id}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Amount</span><strong style={{ color: 'var(--accent)' }}>{fmt(reviewClaim.amount)}</strong></div>
            </div>
            {reviewClaim.proof_url && (
              <a href={reviewClaim.proof_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-full" style={{ marginBottom: 16 }}>📷 View Proof Screenshot</a>
            )}
            <div className="form-group">
              <label className="form-label">Admin Note (optional)</label>
              <input className="form-input" placeholder="Reason for approval/rejection" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1, background: 'var(--err-dim)', color: 'var(--err)', border: '1px solid var(--err)', justifyContent: 'center' }} onClick={() => reviewClaimSubmit('rejected')} disabled={reviewing}>
                ✕ Reject
              </button>
              <button className="btn" style={{ flex: 1, background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)', justifyContent: 'center' }} onClick={() => reviewClaimSubmit('approved')} disabled={reviewing}>
                {reviewing ? <><span className="spinner" /></> : '✓ Approve & Credit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
