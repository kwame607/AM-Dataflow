// components/AdminReferralPanel.tsx
// Drop into the admin Settings tab to manage the referral programme.
'use client';

import { useState, useEffect } from 'react';

interface ReferredAgent {
  id: string; name: string; slug: string; referred_by: string; status: string; created_at: string;
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;

export function AdminReferralPanel({ authFetch, toast }: Props) {
  const [pct, setPct]               = useState<number>(10);
  const [editPct, setEditPct]       = useState('10');
  const [savingPct, setSavingPct]   = useState(false);
  const [referredAgents, setAgents] = useState<ReferredAgent[]>([]);
  const [totalEarnings, setTotal]   = useState(0);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    authFetch('/api/referral?admin=1')
      .then(r => r.json())
      .then(d => {
        setPct(d.pct || 10);
        setEditPct(String(d.pct || 10));
        setAgents(d.referredAgents || []);
        const total = (d.earnings || []).reduce((s: number, e: { bonus_amount: number }) => s + (e.bonus_amount || 0), 0);
        setTotal(total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  async function savePct() {
    const val = parseFloat(editPct);
    if (isNaN(val) || val < 0 || val > 50) { toast('Enter a value between 0 and 50', 'warn'); return; }
    setSavingPct(true);
    try {
      const r = await authFetch('/api/referral', {
        method: 'PATCH',
        body:   JSON.stringify({ pct: val }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to save', 'error'); return; }
      setPct(val);
      toast(`Referral rate updated to ${val}%`, 'success');
    } catch { toast('Network error', 'error'); }
    finally { setSavingPct(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">🎁 Referral Programme</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Agents earn a % of profit from agents they refer
          </div>
        </div>
      </div>
      <div className="card-body">

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Current Rate',      val: `${pct}%`,                          color: 'var(--accent)' },
            { label: 'Total Referred',    val: String(referredAgents.length),       color: 'var(--accent2)' },
            { label: 'Total Bonuses Paid',val: loading ? '—' : fmt(totalEarnings), color: 'var(--ok)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Rate editor */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Referral Rate (%)</label>
          <input
            className="form-input"
            type="number" min={0} max={50} step={0.5}
            value={editPct}
            onChange={e => setEditPct(e.target.value)}
            style={{ width: 80 }}
          />
          <button className="btn btn-primary btn-sm" onClick={savePct} disabled={savingPct}>
            {savingPct ? <><span className="spinner" /> Saving…</> : 'Save Rate'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Applies to all future earnings (0–50%)</span>
        </div>

        {/* Referral relationships table */}
        {referredAgents.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Agent</th><th>Referred By</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>
                {referredAgents.map(a => (
                  <tr key={a.id}>
                    <td><div style={{ fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>/store/{a.slug}</div></td>
                    <td style={{ color: 'var(--accent)', fontSize: 13 }}>/store/{a.referred_by}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: a.status === 'active' ? 'var(--ok-dim)' : 'var(--warn-dim)', color: a.status === 'active' ? 'var(--ok)' : 'var(--warn)' }}>{a.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(a.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
            {loading ? 'Loading…' : 'No referrals yet — agents can share their referral link from their dashboard'}
          </div>
        )}
      </div>
    </div>
  );
}
