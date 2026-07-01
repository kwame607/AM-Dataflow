// components/AdminDepositClaims.tsx
// Admin panel for reviewing and approving/rejecting agent MoMo deposit claims.
// Wire in as a new tab in app/xena-173424/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { fmt, fmtDate } from '@/lib/utils';

interface Claim {
  id:             string;
  agent_id:       string;
  agent_name?:    string;
  agent_slug?:    string;
  network:        string;
  sender_number:  string;
  transaction_id: string;
  amount:         number;
  proof_url?:     string;
  status:         string;
  admin_note?:    string;
  reviewed_at?:   string;
  created_at:     string;
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const NET_LABELS: Record<string, string> = {
  mtn:     'MTN MoMo',
  telecel: 'Telecel Cash',
  at:      'AirtelTigo Money',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  rejected: { label: 'Rejected', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)'  },
  expired:  { label: 'Expired',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'},
};

export function AdminDepositClaims({ authFetch, toast }: Props) {
  const [claims,       setClaims]       = useState<Claim[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [activeClaim,  setActiveClaim]  = useState<Claim | null>(null);
  const [note,         setNote]         = useState('');
  const [processing,   setProcessing]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ admin: '1' });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const r = await authFetch(`/api/wallet/claims?${qs}`);
      const d = await r.json();
      setClaims(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [authFetch, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = claims.filter(c => c.status === 'pending').length;

  async function review(claimId: string, status: 'approved' | 'rejected') {
    setProcessing(claimId);
    try {
      const r = await authFetch('/api/wallet/claims', {
        method: 'PATCH',
        body:   JSON.stringify({ claimId, status, adminNote: note.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed', 'error'); return; }
      toast(
        status === 'approved'
          ? `Claim approved — wallet credited ${fmt(activeClaim?.amount || 0)}`
          : 'Claim rejected',
        status === 'approved' ? 'success' : 'warn'
      );
      setActiveClaim(null);
      setNote('');
      await load();
    } catch { toast('Network error', 'error'); }
    finally { setProcessing(null); }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Deposit Claims</div>
          <div className="page-subtitle">Review and approve agent MoMo deposit claims</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pendingCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 100, background: 'var(--warn-dim)', color: 'var(--warn)' }}>
              {pendingCount} pending
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="tab-nav" style={{ marginBottom: 20 }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
          <button
            key={s}
            className={`tab-btn${statusFilter === s ? ' active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Claims list + detail panel side by side on wider screens */}
      <div style={{ display: 'grid', gridTemplateColumns: activeClaim ? '1fr 380px' : '1fr', gap: 16, alignItems: 'start' }}>

        {/* Claims table */}
        <div className="card">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : claims.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">💸</div>
              <div className="empty-title">No {statusFilter !== 'all' ? statusFilter : ''} claims</div>
              <div className="empty-text">
                {statusFilter === 'pending' ? 'No claims waiting for review right now' : 'Nothing to show'}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Agent</th>
                    <th>Network</th>
                    <th>Sender</th>
                    <th>Txn ID</th>
                    <th>Amount</th>
                    <th>Proof</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map(c => {
                    const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
                    const isActive = activeClaim?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        style={{ background: isActive ? 'var(--accent-dim)' : undefined, cursor: 'pointer' }}
                        onClick={() => { setActiveClaim(isActive ? null : c); setNote(''); }}
                      >
                        <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c.agent_name || '—'}</div>
                          {c.agent_slug && <div style={{ fontSize: 11, color: 'var(--text3)' }}>/store/{c.agent_slug}</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>{NET_LABELS[c.network] || c.network}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.sender_number}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.transaction_id}</td>
                        <td style={{ fontWeight: 700, color: 'var(--ok)' }}>{fmt(c.amount)}</td>
                        <td>
                          {c.proof_url
                            ? <a href={c.proof_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }} onClick={e => e.stopPropagation()}>View</a>
                            : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                          }
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td>
                          {c.status === 'pending' && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={e => { e.stopPropagation(); setActiveClaim(c); setNote(''); }}
                              style={{ fontSize: 11 }}
                            >
                              Review
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail / action panel */}
        {activeClaim && (
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <div className="card-header">
              <div className="card-title">Review Claim</div>
              <button className="close-btn" onClick={() => { setActiveClaim(null); setNote(''); }}>✕</button>
            </div>
            <div className="card-body">

              {/* Claim details */}
              {[
                { label: 'Agent',          val: activeClaim.agent_name || '—' },
                { label: 'Network',        val: NET_LABELS[activeClaim.network] || activeClaim.network },
                { label: 'Sender Number',  val: activeClaim.sender_number },
                { label: 'Transaction ID', val: activeClaim.transaction_id },
                { label: 'Amount',         val: fmt(activeClaim.amount), highlight: true },
                { label: 'Submitted',      val: fmtDate(activeClaim.created_at) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                  <span style={{ fontWeight: 600, color: row.highlight ? 'var(--ok)' : 'var(--text)', fontFamily: row.label === 'Transaction ID' ? 'monospace' : undefined, fontSize: row.label === 'Transaction ID' ? 11 : undefined }}>{row.val}</span>
                </div>
              ))}

              {/* Proof image */}
              {activeClaim.proof_url && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Screenshot Proof</div>
                  <a href={activeClaim.proof_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={activeClaim.proof_url}
                      alt="proof"
                      style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
                    />
                  </a>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Click to open full size</div>
                </div>
              )}

              {/* Note */}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Admin Note (optional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Reason for rejection, or any note…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{ resize: 'none' }}
                />
              </div>

              {/* Actions */}
              {activeClaim.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn"
                    style={{ flex: 1, justifyContent: 'center', background: 'var(--err-dim)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--err)' }}
                    onClick={() => review(activeClaim.id, 'rejected')}
                    disabled={!!processing}
                  >
                    {processing === activeClaim.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✕ Reject'}
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => review(activeClaim.id, 'approved')}
                    disabled={!!processing}
                  >
                    {processing === activeClaim.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `✓ Approve ${fmt(activeClaim.amount)}`}
                  </button>
                </div>
              ) : (
                <div className="alert alert-info" style={{ fontSize: 12 }}>
                  <span>ℹ</span>
                  <span>This claim has already been {activeClaim.status}.</span>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
