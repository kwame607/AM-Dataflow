// ─────────────────────────────────────────────────────────────
// IMPROVED FINANCE TAB — drop-in replacement for components/FinanceTab.tsx
//
// NEW vs old:
//  ✅ "Yesterday" period added
//  ✅ Period-over-period growth % badges (▲/▼)
//  ✅ Business Health Score (0-100)
//  ✅ Bundle Performance table with loss/low-margin flags
//  ✅ Top Agents leaderboard ranked by revenue
//  ✅ Last 7-day daily revenue mini-bar chart (pure CSS)
//  ✅ Loss Detection alerts (bundle-level, period-level)
//  ✅ Liabilities dashboard (pending WDs, outstanding balances)
//  ✅ Order Success Rate card
//  ✅ Avg order value card
//  ✅ Yesterday vs Today comparison panel
//  ✅ Full CSV export of all finance data for the period
//
// No external chart libs needed — all CSS bars.
// ─────────────────────────────────────────────────────────────

import type { Order, Withdrawal, Agent } from '@/types';
import { fmt } from '@/lib/utils';
import React, { useState, useMemo, useCallback } from 'react';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'alltime';

interface FinanceTabProps {
  orders: Order[];
  withdrawals: Withdrawal[];
  agents: Agent[];
  hubBalance: number | null;
}

// ── helpers ──────────────────────────────────────────────────
function pct(val: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((val - prev) / prev) * 100;
}

function GrowthBadge({ current, previous }: { current: number; previous: number }) {
  const p = pct(current, previous);
  if (p === null) return null;
  const up = p >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
      background: up ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
      color: up ? '#10b981' : '#f43f5e', marginLeft: 8,
    }}>
      {up ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%
    </span>
  );
}

function HealthRing({ score }: { score: number }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#f43f5e';
  const label = score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : score >= 30 ? 'Warning' : 'Critical';
  const r = 40, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800"
          fontFamily="Syne,sans-serif" fill={color}>{score}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="9" fontWeight="600"
          fontFamily="DM Sans,sans-serif" fill="rgba(255,255,255,0.4)">/100</text>
      </svg>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const h = max > 0 ? Math.max(4, (value / max) * 56) : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{ height: 56, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
        <div style={{
          width: '70%', height: h, borderRadius: '3px 3px 0 0',
          background: color, opacity: 0.85,
          transition: 'height 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────
export function FinanceTab({ orders, withdrawals, agents, hubBalance }: FinanceTabProps) {
  const [period, setPeriod] = useState<Period>('today');
  const [showBundles, setShowBundles] = useState(false);
  const [showAgents, setShowAgents] = useState(false);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const inPeriod = useCallback((dateStr: string, p: Period): boolean => {
    const d = new Date(dateStr);
    const ds = d.toISOString().slice(0, 10);
    if (p === 'today')     return ds === todayStr;
    if (p === 'yesterday') return ds === yesterdayStr;
    if (p === 'week') {
      const cutoff = new Date(now); cutoff.setDate(now.getDate() - 7);
      return d >= cutoff;
    }
    if (p === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, yesterdayStr]);

  // ── compute stats for a given period ────────────────────────
  function computeStats(p: Period) {
    const succ = orders.filter(o => o.status === 'success' && inPeriod(o.created_at, p));
    const fail = orders.filter(o => o.status === 'failed'  && inPeriod(o.created_at, p));
    const allSucc = orders.filter(o => o.status === 'success');

    const grossRevenue     = succ.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0);
    const providerCost     = succ.reduce((s, o) => s + (o.hubnet_cost || 0), 0);
    const agentComm        = succ.reduce((s, o) => s + (o.agent_profit || 0), 0);
    const adminProfit      = succ.reduce((s, o) => s + (o.admin_profit || 0), 0);
    const netProfit        = grossRevenue - providerCost - agentComm;
    const margin           = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const avgOrderValue    = succ.length > 0 ? grossRevenue / succ.length : 0;
    const avgProfitPerOrder = succ.length > 0 ? netProfit / succ.length : 0;
    const successRate      = orders.length > 0 ? (allSucc.length / orders.length) * 100 : 0;

    const totalAgentEarnings = allSucc.reduce((s, o) => s + (o.agent_profit || 0), 0);
    const paidOut   = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
    const pendingWd = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
    const outstanding = Math.max(0, totalAgentEarnings - paidOut - pendingWd);
    const totalLiabilities = pendingWd + outstanding;

    // Networks
    const byNetwork = (['mtn','at','telecel'] as const).map(net => {
      const n = succ.filter(o => o.network === net);
      const rev  = n.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0);
      const cost = n.reduce((s, o) => s + (o.hubnet_cost || 0), 0);
      const pft  = n.reduce((s, o) => s + (o.admin_profit || 0), 0);
      return { net, count: n.length, revenue: rev, cost, profit: pft };
    });

    // Bundle performance
    const bundleMap: Record<string, {
      key: string; size: string; network: string;
      count: number; revenue: number; cost: number;
      agentComm: number; profit: number;
    }> = {};
    succ.forEach(o => {
      const k = o.bundle_key || `${o.network}_${o.size}`;
      if (!bundleMap[k]) bundleMap[k] = { key: k, size: o.size, network: o.network, count: 0, revenue: 0, cost: 0, agentComm: 0, profit: 0 };
      bundleMap[k].count++;
      bundleMap[k].revenue  += o.agent_price || o.admin_price || 0;
      bundleMap[k].cost     += o.hubnet_cost || 0;
      bundleMap[k].agentComm += o.agent_profit || 0;
      bundleMap[k].profit   += o.admin_profit || 0;
    });
    const bundles = Object.values(bundleMap).sort((a, b) => b.revenue - a.revenue);

    // Agents leaderboard
    const agentStats = agents.filter(a => a.status === 'active').map(a => {
      const ao = succ.filter(o => o.agent_id === a.id);
      const rev  = ao.reduce((s, o) => s + (o.agent_price || 0), 0);
      const comm = ao.reduce((s, o) => s + (o.agent_profit || 0), 0);
      const wdPaid = withdrawals.filter(w => w.agent_id === a.id && w.status === 'paid').reduce((s, w) => s + w.amount, 0);
      const wdPend = withdrawals.filter(w => w.agent_id === a.id && w.status === 'pending').reduce((s, w) => s + w.amount, 0);
      return { agent: a, orders: ao.length, revenue: rev, commission: comm, paidOut: wdPaid, pending: wdPend, outstanding: Math.max(0, comm - wdPaid - wdPend) };
    }).sort((a, b) => b.revenue - a.revenue);

    return {
      succ, fail,
      grossRevenue, providerCost, agentComm, adminProfit, netProfit,
      margin, avgOrderValue, avgProfitPerOrder, successRate,
      totalAgentEarnings, paidOut, pendingWd, outstanding, totalLiabilities,
      byNetwork, bundles, agentStats,
    };
  }

  const stats = useMemo(() => computeStats(period),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, withdrawals, agents, period]);

  // Previous period for growth comparison
  const prevPeriod: Period = period === 'today' ? 'yesterday' :
    period === 'yesterday' ? 'week' : period === 'week' ? 'month' : 'alltime';
  const prevStats = useMemo(() => computeStats(prevPeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, withdrawals, agents, prevPeriod]);

  // ── Last 7 days daily data ───────────────────────────────────
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const day = orders.filter(o => o.status === 'success' && o.created_at?.slice(0, 10) === ds);
      return {
        label: d.toLocaleDateString('en-GH', { weekday: 'short' }),
        ds,
        revenue: day.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0),
        profit:  day.reduce((s, o) => s + (o.admin_profit || 0), 0),
        count:   day.length,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const maxRev = Math.max(...last7.map(d => d.revenue), 1);

  // ── Business Health Score ─────────────────────────────────────
  const healthScore = useMemo(() => {
    const allSucc = orders.filter(o => o.status === 'success');
    const allFail = orders.filter(o => o.status === 'failed');
    const successRate = orders.length > 0 ? allSucc.length / orders.length : 1;
    const margin = stats.grossRevenue > 0 ? stats.netProfit / stats.grossRevenue : 0;
    const totalEarned = allSucc.reduce((s, o) => s + (o.agent_profit || 0), 0);
    const paidOut = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
    const pend = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
    const liabRatio = totalEarned > 0 ? (pend / totalEarned) : 0;
    const delivFailRate = orders.length > 0
      ? orders.filter(o => o.delivery_status === 'failed').length / orders.length : 0;
    const walletOk = hubBalance !== null ? (hubBalance >= 500 ? 1 : hubBalance >= 100 ? 0.5 : 0) : 0.5;

    let score = 0;
    score += successRate * 25;
    score += Math.max(0, Math.min(margin, 0.3)) / 0.3 * 25;
    score += Math.max(0, 1 - liabRatio) * 15;
    score += Math.max(0, 1 - delivFailRate * 5) * 20;
    score += walletOk * 15;

    return Math.round(Math.min(100, Math.max(0, score)));
  }, [orders, withdrawals, hubBalance, stats]);

  // ── Loss detection ───────────────────────────────────────────
  const lossAlerts = useMemo(() => {
    const alerts: { severity: 'error' | 'warn'; msg: string }[] = [];
    if (stats.netProfit < 0) alerts.push({ severity: 'error', msg: `Running at a LOSS of ${fmt(Math.abs(stats.netProfit))} for ${periodLabel}` });
    if (stats.margin < 0.05 && stats.margin >= 0 && stats.grossRevenue > 0) alerts.push({ severity: 'warn', msg: `Very thin margin: ${stats.margin.toFixed(1)}% — consider adjusting prices` });
    const lossBundles = stats.bundles.filter(b => b.profit < 0);
    if (lossBundles.length > 0) alerts.push({ severity: 'error', msg: `${lossBundles.length} bundle(s) selling at a loss: ${lossBundles.map(b => b.size).join(', ')}` });
    if (hubBalance !== null && hubBalance < 100) alerts.push({ severity: 'error', msg: `XpresPortal balance critically low: ${fmt(hubBalance)}` });
    if (stats.pendingWd > stats.adminProfit * 0.8 && stats.adminProfit > 0) alerts.push({ severity: 'warn', msg: `Pending withdrawals (${fmt(stats.pendingWd)}) are eating most of your profit` });
    if (stats.fail.length > stats.succ.length * 0.2 && stats.fail.length > 0) alerts.push({ severity: 'warn', msg: `High failure rate: ${stats.fail.length} failed vs ${stats.succ.length} successful orders` });
    return alerts;
  }, [stats, hubBalance]);

  // ── CSV export ───────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Metric', 'Value'],
      ['Period', periodLabel],
      ['Gross Revenue', stats.grossRevenue.toFixed(2)],
      ['Provider Cost', stats.providerCost.toFixed(2)],
      ['Agent Commissions', stats.agentComm.toFixed(2)],
      ['Net Profit', stats.netProfit.toFixed(2)],
      ['Profit Margin %', stats.margin.toFixed(2)],
      ['Successful Orders', stats.succ.length],
      ['Failed Orders', stats.fail.length],
      ['Avg Order Value', stats.avgOrderValue.toFixed(2)],
      ['Pending Withdrawals', stats.pendingWd.toFixed(2)],
      ['Total Liabilities', stats.totalLiabilities.toFixed(2)],
      [],
      ['--- Network Breakdown ---'],
      ['Network', 'Orders', 'Revenue', 'Cost', 'Profit'],
      ...stats.byNetwork.map(n => [n.net, n.count, n.revenue.toFixed(2), n.cost.toFixed(2), n.profit.toFixed(2)]),
      [],
      ['--- Bundle Performance ---'],
      ['Bundle', 'Network', 'Orders', 'Revenue', 'Cost', 'Profit', 'Margin%'],
      ...stats.bundles.map(b => {
        const m = b.revenue > 0 ? ((b.profit / b.revenue) * 100).toFixed(1) : '0';
        return [b.size, b.network, b.count, b.revenue.toFixed(2), b.cost.toFixed(2), b.profit.toFixed(2), m];
      }),
      [],
      ['--- Top Agents ---'],
      ['Agent', 'Orders', 'Revenue', 'Commission', 'Outstanding'],
      ...stats.agentStats.slice(0, 20).map(a => [a.agent.name, a.orders, a.revenue.toFixed(2), a.commission.toFixed(2), a.outstanding.toFixed(2)]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = `finance-${period}-${Date.now()}.csv`;
    a.click();
  }

  const periodLabels: Record<Period, string> = {
    today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month', alltime: 'All Time',
  };
  const periodLabel = periodLabels[period];

  // ── sub-components ────────────────────────────────────────────
  function StatRow({ label, value, sub, color, bold }: { label: string; value: string; sub?: string; color?: string; bold?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ fontFamily: bold ? 'Syne,sans-serif' : undefined, fontSize: bold ? 16 : 14, fontWeight: bold ? 800 : 600, color: color || 'var(--text)' }}>{value}</div>
      </div>
    );
  }

  function SectionHeader({ title, icon }: { title: string; icon: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700 }}>{title}</div>
      </div>
    );
  }

  const netNames: Record<string, string> = { mtn: 'MTN', at: 'AirtelTigo', telecel: 'Telecel' };
  const netColors: Record<string, string> = { mtn: '#f59e0b', at: '#3b82f6', telecel: '#ef4444' };

  // ── render ────────────────────────────────────────────────────
  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Finance</div>
          <div className="page-subtitle">Full breakdown of revenue, costs & profit</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="tab-nav">
            {(['today','yesterday','week','month','alltime'] as Period[]).map(p => (
              <button key={p} className={`tab-btn${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
                {periodLabels[p]}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Loss & Alert banners */}
      {lossAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {lossAlerts.map((a, i) => (
            <div key={i} className={`alert alert-${a.severity === 'error' ? 'error' : 'warn'}`}>
              <span>{a.severity === 'error' ? '🚨' : '⚠️'}</span>
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* TODAY vs YESTERDAY comparison strip — only when in today/yesterday view */}
      {(period === 'today' || period === 'yesterday') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {(['today','yesterday'] as Period[]).map(p => {
            const s = computeStats(p);
            const isActive = period === p;
            return (
              <button key={p} onClick={() => setPeriod(p)} style={{
                background: isActive ? 'linear-gradient(135deg,rgba(0,212,170,.12),rgba(14,165,233,.07))' : 'var(--surface)',
                border: `1px solid ${isActive ? 'rgba(0,212,170,.35)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)', padding: '18px 20px',
                textAlign: 'left', cursor: 'pointer', transition: 'all .2s',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                  {p === 'today' ? '📅 Today' : '📆 Yesterday'}
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: isActive ? 'var(--accent)' : 'var(--text)', marginBottom: 4 }}>
                  {fmt(s.grossRevenue)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Revenue · {s.succ.length} orders</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Profit</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: s.netProfit >= 0 ? 'var(--ok)' : 'var(--err)' }}>{fmt(s.netProfit)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Margin</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: s.margin >= 10 ? 'var(--ok)' : s.margin >= 0 ? 'var(--warn)' : 'var(--err)' }}>{s.margin.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Cost</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>{fmt(s.providerCost)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* KPI cards row */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          {
            label: 'Gross Revenue', val: fmt(stats.grossRevenue), sub: `${stats.succ.length} orders`,
            icon: '💰', bg: 'var(--accent-dim)', color: 'var(--accent)', accent: true,
            prev: prevStats.grossRevenue,
          },
          {
            label: 'Provider Cost', val: fmt(stats.providerCost), sub: 'XpresPortal / Hubnet',
            icon: '📡', bg: 'rgba(239,68,68,0.12)', color: '#f87171',
            prev: prevStats.providerCost, invertGrowth: true,
          },
          {
            label: 'Agent Commissions', val: fmt(stats.agentComm), sub: 'Paid to resellers',
            icon: '👥', bg: 'rgba(245,158,11,0.12)', color: 'var(--warn)',
            prev: prevStats.agentComm, invertGrowth: true,
          },
          {
            label: 'Net Profit', val: fmt(stats.netProfit), sub: `${stats.margin.toFixed(1)}% margin`,
            icon: '📈', bg: 'rgba(16,185,129,0.12)', color: stats.netProfit < 0 ? 'var(--err)' : 'var(--ok)', accent: stats.netProfit >= 0,
            prev: prevStats.netProfit,
          },
        ].map(s => (
          <div key={s.label} className={`stat-card${s.accent ? ' accent' : ''}`}>
            <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18, width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <span className="stat-sub">{s.sub}</span>
              <GrowthBadge current={s.prev != null ? stats.grossRevenue : stats.netProfit} previous={s.prev ?? 0} />
            </div>
          </div>
        ))}
      </div>

      {/* Secondary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Avg Order Value', val: fmt(stats.avgOrderValue), color: 'var(--accent2)' },
          { label: 'Avg Profit / Order', val: fmt(stats.avgProfitPerOrder), color: 'var(--ok)' },
          { label: 'Success Rate', val: `${stats.successRate.toFixed(1)}%`, color: stats.successRate >= 90 ? 'var(--ok)' : 'var(--warn)' },
          { label: 'Failed Orders', val: String(stats.fail.length), color: stats.fail.length > 0 ? 'var(--err)' : 'var(--text3)' },
          { label: 'Total Liabilities', val: fmt(stats.totalLiabilities), color: 'var(--warn)' },
          { label: 'XpresPortal Wallet', val: hubBalance !== null ? fmt(hubBalance) : '—', color: hubBalance !== null && hubBalance < 100 ? 'var(--err)' : 'var(--ok)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Charts row: 7-day bar + health score */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, marginBottom: 16, alignItems: 'stretch' }}>

        {/* 7-day daily revenue */}
        <div className="card">
          <div className="card-header"><SectionHeader title="Last 7 Days — Daily Revenue" icon="📊" /></div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
              {last7.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: d.ds === todayStr ? 'var(--accent)' : d.ds === yesterdayStr ? '#7dd3fc' : 'var(--text3)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {fmt(d.revenue).replace('₵','')}</div>
                  <MiniBar value={d.revenue} max={maxRev} color={d.ds === todayStr ? 'var(--accent)' : d.ds === yesterdayStr ? '#7dd3fc' : 'rgba(100,116,139,0.6)'} />
                  <div style={{ fontSize: 9, color: d.ds === todayStr ? 'var(--accent)' : 'var(--text3)', fontWeight: d.ds === todayStr ? 700 : 400 }}>{d.label}</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>{d.count}×</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} /> Today
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#7dd3fc', display: 'inline-block' }} /> Yesterday
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(100,116,139,0.6)', display: 'inline-block' }} /> Earlier
              </span>
            </div>
          </div>
        </div>

        {/* Health score */}
        <div className="card" style={{ minWidth: 160 }}>
          <div className="card-header"><SectionHeader title="Health" icon="❤️" /></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 12 }}>
            <HealthRing score={healthScore} />
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
              Based on margin, success rate, liabilities & wallet balance
            </div>
          </div>
        </div>
      </div>

      {/* Revenue breakdown card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14, marginBottom: 16 }}>

        <div className="card">
          <div className="card-header">
            <SectionHeader title="Revenue Breakdown" icon="📋" />
          </div>
          <div className="card-body">
            <StatRow label="Gross Revenue"       value={fmt(stats.grossRevenue)}  color="var(--accent)" bold />
            <StatRow label="− Provider Cost"     value={`−${fmt(stats.providerCost)}`}  color="#f87171" />
            <StatRow label="− Agent Commissions" value={`−${fmt(stats.agentComm)}`}     color="var(--warn)" />
            <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', marginTop: 4, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>= Net Profit</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: stats.netProfit < 0 ? 'var(--err)' : 'var(--ok)' }}>{fmt(stats.netProfit)}</span>
                <GrowthBadge current={stats.netProfit} previous={prevStats.netProfit} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Margin</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: stats.margin < 0 ? 'var(--err)' : stats.margin < 5 ? 'var(--warn)' : 'var(--ok)' }}>{stats.margin.toFixed(1)}%</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Avg/Order</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{fmt(stats.avgProfitPerOrder)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Liabilities */}
        <div className="card">
          <div className="card-header"><SectionHeader title="Liabilities & Payouts" icon="💸" /></div>
          <div className="card-body">
            <StatRow label="Total Agent Earnings (all time)" value={fmt(stats.totalAgentEarnings)} color="var(--accent)" bold />
            <StatRow label="Already Paid Out"         value={fmt(stats.paidOut)}       color="var(--ok)" />
            <StatRow label="Pending Withdrawal Reqs"  value={fmt(stats.pendingWd)}     color={stats.pendingWd > 0 ? 'var(--warn)' : 'var(--text3)'} sub={`${withdrawals.filter(w => w.status === 'pending').length} requests`} />
            <StatRow label="Earned But Not Requested" value={fmt(stats.outstanding)}   color="var(--text3)" sub="Sitting in agent balances" />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total Liability</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--warn)' }}>{fmt(stats.totalLiabilities)}</span>
            </div>
          </div>
        </div>

        {/* Paystack */}
        <div className="card">
          <div className="card-header"><SectionHeader title="Paystack" icon="💳" /></div>
          <div className="card-body">
            <StatRow label="Total Processed"  value={fmt(stats.grossRevenue)} sub="All customer payments" color="var(--accent)" bold />
            <StatRow label="Failed Orders"    value={String(stats.fail.length)} color={stats.fail.length > 0 ? 'var(--err)' : 'var(--text3)'} />
            <StatRow label="Success Rate"     value={`${stats.successRate.toFixed(1)}%`} sub={`${stats.succ.length} of ${orders.length} orders`} color="var(--ok)" />
            <div className="alert alert-info" style={{ marginTop: 14, fontSize: 12 }}>
              <span>ℹ</span>
              <span>Actual settlement timing depends on your Paystack plan. Check Paystack dashboard for settlement status.</span>
            </div>
          </div>
        </div>

        {/* XpresPortal wallet */}
        <div className="card">
          <div className="card-header"><SectionHeader title="XpresPortal Wallet" icon="📡" /></div>
          <div className="card-body">
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 36, fontWeight: 800, color: hubBalance !== null && hubBalance < 100 ? 'var(--err)' : 'var(--accent)', marginBottom: 4 }}>
              {hubBalance !== null ? fmt(hubBalance) : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Current wallet balance</div>
            <StatRow label="Spent This Period"  value={fmt(stats.providerCost)} color="#f87171" />
            <StatRow label="Orders Delivered"   value={String(orders.filter(o => o.delivery_status === 'delivered').length)} color="var(--ok)" />
            <StatRow label="Delivery Failures"  value={String(orders.filter(o => o.delivery_status === 'failed').length)} color={orders.filter(o => o.delivery_status === 'failed').length > 0 ? 'var(--err)' : 'var(--text3)'} />
            {hubBalance !== null && hubBalance < 100 && (
              <div className="alert alert-error" style={{ marginTop: 12, fontSize: 12 }}>
                <span>⚠</span><span>Balance critically low. Top up now.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Network breakdown */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><SectionHeader title="Revenue by Network" icon="📶" /></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
            {stats.byNetwork.map(n => {
              const nMargin = n.revenue > 0 ? (n.profit / n.revenue) * 100 : 0;
              return (
                <div key={n.net} style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, border: `1px solid ${netColors[n.net]}30` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: netColors[n.net] }} />
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700 }}>{netNames[n.net]}</div>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{n.count}×</div>
                  </div>
                  {[
                    { l: 'Revenue', v: fmt(n.revenue), c: netColors[n.net] },
                    { l: 'Cost', v: fmt(n.cost), c: '#f87171' },
                    { l: 'Profit', v: fmt(n.profit), c: n.profit < 0 ? 'var(--err)' : 'var(--ok)' },
                    { l: 'Margin', v: `${nMargin.toFixed(1)}%`, c: nMargin < 0 ? 'var(--err)' : nMargin < 5 ? 'var(--warn)' : 'var(--ok)' },
                  ].map(row => (
                    <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text3)' }}>{row.l}</span>
                      <span style={{ fontWeight: 700, color: row.c }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bundle performance */}
      {stats.bundles.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <SectionHeader title="Bundle Performance" icon="📦" />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBundles(v => !v)}>
              {showBundles ? 'Collapse' : `Show All (${stats.bundles.length})`}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bundle</th><th>Network</th><th>Orders</th>
                  <th>Revenue</th><th>Cost</th><th>Agent Comm</th><th>Profit</th><th>Margin</th><th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {stats.bundles.slice(0, showBundles ? 999 : 8).map(b => {
                  const m = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0;
                  const isLoss = b.profit < 0;
                  const isLow  = !isLoss && m < 5;
                  return (
                    <tr key={b.key} style={{ background: isLoss ? 'rgba(244,63,94,0.04)' : isLow ? 'rgba(245,158,11,0.03)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{b.size}</td>
                      <td><span className={`badge badge-${b.network}`}>{netNames[b.network] || b.network}</span></td>
                      <td>{b.count}</td>
                      <td style={{ color: 'var(--accent)' }}>{fmt(b.revenue)}</td>
                      <td style={{ color: '#f87171' }}>{fmt(b.cost)}</td>
                      <td style={{ color: 'var(--warn)' }}>{fmt(b.agentComm)}</td>
                      <td style={{ color: isLoss ? 'var(--err)' : 'var(--ok)', fontWeight: 700 }}>{fmt(b.profit)}</td>
                      <td style={{ color: isLoss ? 'var(--err)' : isLow ? 'var(--warn)' : 'var(--ok)' }}>{m.toFixed(1)}%</td>
                      <td>
                        {isLoss && <span style={{ fontSize: 11, background: 'var(--err-dim)', color: '#fda4af', padding: '2px 7px', borderRadius: 100, fontWeight: 700 }}>🔴 LOSS</span>}
                        {isLow  && <span style={{ fontSize: 11, background: 'var(--warn-dim)', color: '#fcd34d', padding: '2px 7px', borderRadius: 100, fontWeight: 700 }}>⚠ LOW</span>}
                        {!isLoss && !isLow && <span style={{ fontSize: 11, background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', padding: '2px 7px', borderRadius: 100, fontWeight: 700 }}>✓ OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent leaderboard */}
      {stats.agentStats.length > 0 && (
        <div className="card">
          <div className="card-header">
            <SectionHeader title="Agent Leaderboard" icon="🏆" />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Ranked by revenue · {periodLabel}</span>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowAgents(v => !v)}>
              {showAgents ? 'Top 5' : 'Show All'}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Agent</th><th>Orders</th>
                  <th>Revenue</th><th>Commission</th><th>Paid Out</th><th>Pending</th><th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {stats.agentStats.slice(0, showAgents ? 999 : 5).map((a, i) => (
                  <tr key={a.agent.id}>
                    <td>
                      <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14,
                        color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'var(--text3)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.agent.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>/store/{a.agent.slug}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{a.orders}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(a.revenue)}</td>
                    <td style={{ color: 'var(--warn)', fontWeight: 600 }}>{fmt(a.commission)}</td>
                    <td style={{ color: 'var(--ok)' }}>{fmt(a.paidOut)}</td>
                    <td style={{ color: a.pending > 0 ? 'var(--warn)' : 'var(--text3)' }}>{fmt(a.pending)}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{fmt(a.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
