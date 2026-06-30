// components/AdminReferralsTab.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';

interface EarningRow {
  id: string; created_at: string; status: string; skip_reason: string | null;
  referrer_name: string; referrer_slug: string;
  referred_name: string; referred_slug: string;
  referred_profit: number; pct: number; bonus_amount: number;
  order_reference: string; network: string; size: string;
}

interface TopReferrer { name: string; slug: string; total: number; count: number }

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  credited: { label: 'Credited', color: 'var(--ok)',   bg: 'var(--ok-dim)' },
  skipped:  { label: 'Skipped',  color: 'var(--text3)',bg: 'var(--surface2)' },
  reversed: { label: 'Reversed', color: 'var(--err)',  bg: 'var(--err-dim)' },
  frozen:   { label: 'Frozen',   color: 'var(--warn)', bg: 'var(--warn-dim)' },
};

export function AdminReferralsTab({ authFetch }: Props) {
  const [earnings, setEarnings]       = useState<EarningRow[]>([]);
  const [topReferrers, setTop]        = useState<TopReferrer[]>([]);
  const [totalPaid, setTotalPaid]     = useState(0);
  const [loading, setLoading]         = useState(true);
  const [referrerFilter, setReferrerFilter] = useState('');
  const [search, setSearch]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (referrerFilter) qs.set('referrerId', referrerFilter);
      const r = await authFetch(`/api/admin/referral-earnings?${qs}`);
      const d = await r.json();
      setEarnings(d.earnings || []);
      setTop(d.topReferrers || []);
      setTotalPaid(d.totalPaid || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [authFetch, referrerFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = earnings.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.referrer_name?.toLowerCase().includes(q) ||
      e.referred_name?.toLowerCase().includes(q) ||
      e.order_reference?.toLowerCase().includes(q)
    );
  });

  const credited = filtered.filter(e => e.status === 'credited');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Referrals</div>
          <div className="page-subtitle">All referral commission activity across the platform</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Bonuses Paid', val: fmt(totalPaid), icon: '💰', color: 'var(--ok)' },
          { label: 'Total Entries',      val: String(earnings.length), icon: '📋', color: 'var(--accent2)' },
          { label: 'Top Referrers',      val: String(topReferrers.length), icon: '🏆', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--surface2)', fontSize: 18 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {topReferrers.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">🏆 Top Referrers</div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Agent</th><th>Bonus Earned</th><th>Referrals Credited</th></tr></thead>
              <tbody>
                {topReferrers.map((r, i) => (
                  <tr key={r.slug} style={{ cursor: 'pointer' }} onClick={() => setReferrerFilter(referrerFilter === r.slug ? '' : r.slug)}>
                    <td style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'var(--text3)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.name}<span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>/store/{r.slug}</span></td>
                    <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(r.total)}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="🔍 Search by agent name or order reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {referrerFilter && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '5px 12px', borderRadius: 100 }}>
            Filtered: {referrerFilter}
            <button onClick={() => setReferrerFilter('')} style={{ color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>✕</button>
          </span>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
          {filtered.length} of {earnings.length} entries · GHS {credited.reduce((s, e) => s + e.bonus_amount, 0).toFixed(2)} credited
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🎁</div>
            <div className="empty-title">No referral activity yet</div>
            <div className="empty-text">Earnings will appear here once referred agents start making sales</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Referrer</th><th>Sub-Agent</th><th>Order</th>
                  <th>Profit</th><th>%</th><th>Bonus</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const cfg = STATUS_CONFIG[e.status] || STATUS_CONFIG.credited;
                  return (
                    <tr key={e.id}>
                      <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(e.created_at)}</td>
                      <td style={{ fontWeight: 600 }}>{e.referrer_name}</td>
                      <td>{e.referred_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.order_reference}</td>
                      <td>{fmt(e.referred_profit)}</td>
                      <td>{e.pct}%</td>
                      <td style={{ color: e.status === 'credited' ? 'var(--ok)' : 'var(--text3)', fontWeight: 700 }}>{fmt(e.bonus_amount)}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: cfg.bg, color: cfg.color }} title={e.skip_reason || ''}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
