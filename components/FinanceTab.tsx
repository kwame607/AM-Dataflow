// components/FinanceTab.tsx — Finance Intelligence Dashboard V2
// Enhanced version of the original — all existing metrics preserved + new sections added.

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
        <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Syne,sans-serif" fill={color}>{score}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="9" fontWeight="600" fontFamily="DM Sans,sans-serif" fill="rgba(255,255,255,0.4)">/100</text>
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
        <div style={{ width: '70%', height: h, borderRadius: '3px 3px 0 0', background: color, opacity: 0.85, transition: 'height 0.4s ease' }} />
      </div>
    </div>
  );
}

function AlertBanner({ level, msg }: { level: 'error' | 'warn' | 'info'; msg: string }) {
  return (
    <div className={`alert alert-${level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'}`}>
      <span>{level === 'error' ? '🚨' : level === 'warn' ? '⚠️' : 'ℹ️'}</span>
      <span>{msg}</span>
    </div>
  );
}

export function FinanceTab({ orders, withdrawals, agents, hubBalance }: FinanceTabProps) {
  const [period, setPeriod] = useState<Period>('today');
  const [showBundles, setShowBundles] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7);
  const [agentView, setAgentView] = useState<'revenue' | 'profit' | 'inactive'>('revenue');
  const [showSection, setShowSection] = useState<Record<string, boolean>>({
    executive: true, position: true, trends: false, network: true,
    agents: true, bundles: true, failures: false,
    forecast: false, health: true, alerts: true,
  });

  function toggleSection(key: string) {
    setShowSection(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function SectionToggle({ id, title, icon }: { id: string; title: string; icon: string }) {
    return (
      <button
        onClick={() => toggleSection(id)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '0 0 12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span> {title}
        </div>
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>{showSection[id] ? '▲ collapse' : '▼ expand'}</span>
      </button>
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const inPeriod = useCallback((dateStr: string, p: Period): boolean => {
    const d = new Date(dateStr);
    const ds = d.toISOString().slice(0, 10);
    if (p === 'today')     return ds === todayStr;
    if (p === 'yesterday') return ds === yesterdayStr;
    if (p === 'week')  { const c = new Date(now); c.setDate(now.getDate() - 7); return d >= c; }
    if (p === 'month') { return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, yesterdayStr]);

  // Fallback: if agent_profit is NULL/0 but prices differ, derive from price gap.
  // This fixes old orders where agent_profit was never written to the DB.
  function realAgentProfit(o: Order): number {
    if (o.agent_profit !== null && o.agent_profit !== undefined && o.agent_profit > 0) {
      return o.agent_profit;
    }
    const derived = (o.agent_price ?? 0) - (o.admin_price ?? 0);
    return derived > 0 ? derived : 0;
  }

  function computeStats(p: Period) {
    const succ    = orders.filter(o => o.status === 'success' && inPeriod(o.created_at, p));
    const fail    = orders.filter(o => o.status === 'failed'  && inPeriod(o.created_at, p));
    const allSucc = orders.filter(o => o.status === 'success');

    const grossRevenue      = succ.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0);
    const providerCost      = succ.reduce((s, o) => s + (o.hubnet_cost || 0), 0);
    const agentComm         = succ.reduce((s, o) => s + realAgentProfit(o), 0);
    const adminProfit       = succ.reduce((s, o) => s + (o.admin_profit || 0), 0);
    const netProfit         = grossRevenue - providerCost - agentComm;
    const margin            = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const avgOrderValue     = succ.length > 0 ? grossRevenue / succ.length : 0;
    const avgProfitPerOrder = succ.length > 0 ? netProfit / succ.length : 0;
    const successRate       = orders.length > 0 ? (allSucc.length / orders.length) * 100 : 0;

    const totalAgentEarnings = allSucc.reduce((s, o) => s + realAgentProfit(o), 0);
    const paidOut            = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
    const pendingWd          = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
    const outstanding        = Math.max(0, totalAgentEarnings - paidOut - pendingWd);
    const totalLiabilities   = pendingWd + outstanding;

    const byNetwork = (['mtn','at','telecel'] as const).map(net => {
      const n     = succ.filter(o => o.network === net);
      const nAll  = orders.filter(o => o.network === net);
      const nFail = orders.filter(o => o.network === net && o.status === 'failed');
      const rev   = n.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0);
      const cost  = n.reduce((s, o) => s + (o.hubnet_cost || 0), 0);
      const pft   = n.reduce((s, o) => s + (o.admin_profit || 0), 0);
      const sr    = nAll.length > 0 ? (n.length / nAll.length) * 100 : 0;
      return { net, count: n.length, revenue: rev, cost, profit: pft, successRate: sr, failures: nFail.length, total: nAll.length };
    });

    const bundleMap: Record<string, { key: string; size: string; network: string; count: number; revenue: number; cost: number; agentComm: number; profit: number }> = {};
    succ.forEach(o => {
      const k = o.bundle_key || `${o.network}_${o.size}`;
      if (!bundleMap[k]) bundleMap[k] = { key: k, size: o.size, network: o.network, count: 0, revenue: 0, cost: 0, agentComm: 0, profit: 0 };
      bundleMap[k].count++;
      bundleMap[k].revenue   += o.agent_price || o.admin_price || 0;
      bundleMap[k].cost      += o.hubnet_cost || 0;
      bundleMap[k].agentComm += realAgentProfit(o);
      bundleMap[k].profit    += o.admin_profit || 0;
    });
    const bundles = Object.values(bundleMap).sort((a, b) => b.revenue - a.revenue);

    const agentStats = agents.filter(a => a.status === 'active').map(a => {
      const ao     = succ.filter(o => o.agent_id === a.id);
      const rev    = ao.reduce((s, o) => s + (o.agent_price || 0), 0);
      const comm   = ao.reduce((s, o) => s + realAgentProfit(o), 0);
      const wdPaid = withdrawals.filter(w => w.agent_id === a.id && w.status === 'paid').reduce((s, w) => s + w.amount, 0);
      const wdPend = withdrawals.filter(w => w.agent_id === a.id && w.status === 'pending').reduce((s, w) => s + w.amount, 0);
      const wkCutoff  = new Date(now); wkCutoff.setDate(now.getDate() - 7);
      const prevCutoff = new Date(now); prevCutoff.setDate(now.getDate() - 14);
      const wkOrders   = orders.filter(o => o.agent_id === a.id && o.status === 'success' && new Date(o.created_at) >= wkCutoff);
      const prevOrders = orders.filter(o => o.agent_id === a.id && o.status === 'success' && new Date(o.created_at) >= prevCutoff && new Date(o.created_at) < wkCutoff);
      const wkRev   = wkOrders.reduce((s, o) => s + (o.agent_price || 0), 0);
      const prevRev = prevOrders.reduce((s, o) => s + (o.agent_price || 0), 0);
      const growth  = prevRev > 0 ? ((wkRev - prevRev) / prevRev) * 100 : null;
      const allAo   = orders.filter(o => o.agent_id === a.id && o.status === 'success').sort((x,y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
      const daysSince = allAo[0] ? Math.floor((Date.now() - new Date(allAo[0].created_at).getTime()) / 86400000) : null;
      return { agent: a, orders: ao.length, revenue: rev, commission: comm, paidOut: wdPaid, pending: wdPend, outstanding: Math.max(0, comm - wdPaid - wdPend), growth, daysSince, wkRev };
    }).sort((a, b) => b.revenue - a.revenue);

    return {
      succ, fail, grossRevenue, providerCost, agentComm, adminProfit, netProfit,
      margin, avgOrderValue, avgProfitPerOrder, successRate,
      totalAgentEarnings, paidOut, pendingWd, outstanding, totalLiabilities,
      byNetwork, bundles, agentStats,
    };
  }

  const stats      = useMemo(() => computeStats(period),      [orders, withdrawals, agents, period]);       // eslint-disable-line
  const prevPeriod: Period = period === 'today' ? 'yesterday' : period === 'yesterday' ? 'week' : period === 'week' ? 'month' : 'alltime';
  const prevStats  = useMemo(() => computeStats(prevPeriod),  [orders, withdrawals, agents, prevPeriod]);   // eslint-disable-line
  const todayStats  = useMemo(() => computeStats('today'),    [orders, withdrawals, agents]);                // eslint-disable-line
  const weekStats   = useMemo(() => computeStats('week'),     [orders, withdrawals, agents]);                // eslint-disable-line
  const monthStats  = useMemo(() => computeStats('month'),    [orders, withdrawals, agents]);                // eslint-disable-line
  const alltimeStats = useMemo(() => computeStats('alltime'), [orders, withdrawals, agents]);                // eslint-disable-line

  // ── Net Capital ───────────────────────────────────────────────
  const allSuccOrders     = orders.filter(o => o.status === 'success');
  const totalAdminProfit  = allSuccOrders.reduce((s, o) => s + (o.admin_profit || 0), 0);
  const agentPaidOut      = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
  const agentPendingWd    = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
  const totalPaidOut      = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
  const pendingWdAll      = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
  const totalAgentEarnedAll = allSuccOrders.reduce((s, o) => s + realAgentProfit(o), 0);
  const agentLiability    = Math.max(0, totalAgentEarnedAll - agentPaidOut - agentPendingWd);
  const netCapital        = totalAdminProfit;
  const platformCash      = hubBalance ?? 0;

  // ── Last 7 days ───────────────────────────────────────────────
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const day = orders.filter(o => o.status === 'success' && o.created_at?.slice(0, 10) === ds);
      return {
        label: d.toLocaleDateString('en-GH', { weekday: 'short' }), ds,
        revenue: day.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0),
        profit:  day.reduce((s, o) => s + (o.admin_profit || 0), 0),
        count:   day.length,
      };
    });
  }, [orders]); // eslint-disable-line
  const maxRev = Math.max(...last7.map(d => d.revenue), 1);

  // ── Trend data ────────────────────────────────────────────────
  const trendData = useMemo(() => {
    return Array.from({ length: trendDays }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (trendDays - 1 - i));
      const ds = d.toISOString().slice(0, 10);
      const dayO = orders.filter(o => o.status === 'success' && o.created_at?.slice(0, 10) === ds);
      const rev  = dayO.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0);
      const cost = dayO.reduce((s, o) => s + (o.hubnet_cost || 0), 0);
      const comm = dayO.reduce((s, o) => s + realAgentProfit(o), 0);
      const prof = dayO.reduce((s, o) => s + (o.admin_profit || 0), 0);
      return { ds, label: d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' }), rev, cost, comm, prof };
    });
  }, [orders, trendDays]); // eslint-disable-line
  const maxTrendRev = Math.max(...trendData.map(d => d.rev), 1);

  // ── Failure stats ─────────────────────────────────────────────
  const failStats = useMemo(() => {
    const failed = orders.filter(o => o.status === 'failed');
    const byNet  = ['mtn','at','telecel'].map(net => ({
      net, count: failed.filter(o => o.network === net).length,
      total: orders.filter(o => o.network === net).length,
    }));
    const last7f = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      return { label: d.toLocaleDateString('en-GH', { weekday: 'short' }), count: failed.filter(o => o.created_at?.slice(0, 10) === ds).length };
    });
    const rate     = orders.length > 0 ? (failed.length / orders.length) * 100 : 0;
    const todayFail = failed.filter(o => o.created_at?.slice(0, 10) === todayStr).length;
    return { failed, byNet, last7f, rate, todayFail };
  }, [orders]); // eslint-disable-line

  // ── Forecast ──────────────────────────────────────────────────
  const forecast = useMemo(() => {
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (29 - i));
      const ds = d.toISOString().slice(0, 10);
      const dayO = orders.filter(o => o.status === 'success' && o.created_at?.slice(0, 10) === ds);
      return {
        rev:  dayO.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0),
        prof: dayO.reduce((s, o) => s + (o.admin_profit || 0), 0),
      };
    });
    const avgDailyRev  = last30.reduce((s, d) => s + d.rev, 0) / 30;
    const avgDailyProf = last30.reduce((s, d) => s + d.prof, 0) / 30;
    const last7Rev  = last30.slice(-7).reduce((s, d) => s + d.rev, 0) / 7;
    const prev7Rev  = last30.slice(0, 7).reduce((s, d) => s + d.rev, 0) / 7;
    const growthRate = prev7Rev > 0 ? ((last7Rev - prev7Rev) / prev7Rev) * 100 : 0;
    return { projRev: avgDailyRev * 30, projProf: avgDailyProf * 30, growthRate, avgDailyRev, avgDailyProf };
  }, [orders]); // eslint-disable-line

  // ── Health score ──────────────────────────────────────────────
  const healthData = useMemo(() => {
    const allSucc     = orders.filter(o => o.status === 'success');
    const successRate = orders.length > 0 ? allSucc.length / orders.length : 1;
    const margin      = stats.grossRevenue > 0 ? stats.netProfit / stats.grossRevenue : 0;
    const totalEarned = allSucc.reduce((s, o) => s + realAgentProfit(o), 0);
    const paidOut     = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
    const pend        = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
    const liabRatio   = totalEarned > 0 ? (pend / totalEarned) : 0;
    const delivFailRate = orders.length > 0
      ? orders.filter(o => o.delivery_status === 'failed').length / orders.length : 0;
    const walletOk    = hubBalance !== null ? (hubBalance >= 500 ? 1 : hubBalance >= 100 ? 0.5 : 0) : 0.5;

    let score = 0;
    score += successRate * 25;
    score += Math.max(0, Math.min(margin, 0.3)) / 0.3 * 25;
    score += Math.max(0, 1 - liabRatio) * 15;
    score += Math.max(0, 1 - delivFailRate * 5) * 20;
    score += walletOk * 15;

    const reasons: string[] = [];
    if (successRate < 0.8) reasons.push('Low payment success rate');
    if (stats.margin < 5) reasons.push('Thin profit margin');
    if (failStats.rate > 15) reasons.push('High order failure rate');
    if (hubBalance !== null && hubBalance < 100) reasons.push('Provider wallet critically low');
    if (pend > totalEarned * 0.5 && totalEarned > 0) reasons.push('High pending withdrawal burden');

    return { score: Math.round(Math.min(100, Math.max(0, score))), reasons };
  }, [orders, withdrawals, hubBalance, stats, failStats]); // eslint-disable-line

  // ── Intelligent alerts ────────────────────────────────────────
  const intelligentAlerts = useMemo(() => {
    const list: { level: 'error' | 'warn' | 'info'; title: string; detail: string; action: string }[] = [];
    if (alltimeStats.netProfit < 0) list.push({ level: 'error', title: 'Negative Profit', detail: `Running at a ${fmt(Math.abs(alltimeStats.netProfit))} overall loss.`, action: 'Review bundle pricing and provider costs immediately.' });
    if (failStats.rate > 20) list.push({ level: 'error', title: 'Critical Failure Rate', detail: `${failStats.rate.toFixed(1)}% of orders are failing.`, action: 'Contact provider and pause high-failure bundles.' });
    else if (failStats.rate > 10) list.push({ level: 'warn', title: 'Elevated Failure Rate', detail: `${failStats.rate.toFixed(1)}% failure rate detected.`, action: 'Monitor closely and investigate failing networks.' });
    if (hubBalance !== null && hubBalance < 50) list.push({ level: 'error', title: 'Provider Balance Critical', detail: `Only ${fmt(hubBalance)} remaining in XpresPortal.`, action: 'Top up immediately to prevent order failures.' });
    else if (hubBalance !== null && hubBalance < 150) list.push({ level: 'warn', title: 'Provider Balance Low', detail: `${fmt(hubBalance)} remaining.`, action: 'Schedule a top-up soon.' });
    if (pendingWdAll > 200) list.push({ level: 'warn', title: 'High Pending Withdrawals', detail: `${fmt(pendingWdAll)} awaiting approval.`, action: 'Process pending withdrawal requests.' });
    if (netCapital < 50 && netCapital >= 0) list.push({ level: 'warn', title: 'Low Capital Position', detail: `Net capital is only ${fmt(netCapital)}.`, action: 'Increase sales or reduce pending liabilities.' });
    if (todayStats.netProfit < 0 && todayStats.grossRevenue > 0) list.push({ level: 'warn', title: "Today's Loss", detail: `Running at a ${fmt(Math.abs(todayStats.netProfit))} loss today.`, action: 'Check if provider costs have increased.' });
    if (list.length === 0) list.push({ level: 'info', title: 'All Systems Healthy', detail: 'No critical issues detected at this time.', action: 'Continue monitoring daily.' });
    return list;
  }, [alltimeStats, failStats, hubBalance, pendingWdAll, netCapital, todayStats]); // eslint-disable-line

  // ── Loss alerts (period-based) ────────────────────────────────
  const periodLabels: Record<Period, string> = { today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month', alltime: 'All Time' };
  const periodLabel = periodLabels[period];

  const lossAlerts = useMemo(() => {
    const alerts: { severity: 'error' | 'warn'; msg: string }[] = [];
    if (stats.netProfit < 0) alerts.push({ severity: 'error', msg: `Running at a LOSS of ${fmt(Math.abs(stats.netProfit))} for ${periodLabel}` });
    if (stats.margin < 0.05 && stats.margin >= 0 && stats.grossRevenue > 0) alerts.push({ severity: 'warn', msg: `Very thin margin: ${stats.margin.toFixed(1)}% — consider adjusting prices` });
    const lossBundles = stats.bundles.filter(b => b.profit < 0);
    if (lossBundles.length > 0) alerts.push({ severity: 'error', msg: `${lossBundles.length} bundle(s) selling at a loss: ${lossBundles.map(b => b.size).join(', ')}` });
    if (hubBalance !== null && hubBalance < 100) alerts.push({ severity: 'error', msg: `XpresPortal balance critically low: ${fmt(hubBalance)}` });
    if (stats.fail.length > stats.succ.length * 0.2 && stats.fail.length > 0) alerts.push({ severity: 'warn', msg: `High failure rate: ${stats.fail.length} failed vs ${stats.succ.length} successful orders` });
    return alerts;
  }, [stats, hubBalance]); // eslint-disable-line

  // ── CSV export ────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['FINANCE INTELLIGENCE REPORT — ADMUNZ'],
      ['Generated', new Date().toISOString()],
      ['Period', periodLabel],
      [],
      ['=== EXECUTIVE SUMMARY ==='],
      ['', 'Today', 'This Week', 'This Month', 'All Time'],
      ['Revenue', todayStats.grossRevenue.toFixed(2), weekStats.grossRevenue.toFixed(2), monthStats.grossRevenue.toFixed(2), alltimeStats.grossRevenue.toFixed(2)],
      ['Admin Profit', todayStats.adminProfit.toFixed(2), weekStats.adminProfit.toFixed(2), monthStats.adminProfit.toFixed(2), alltimeStats.adminProfit.toFixed(2)],
      ['Net Profit', todayStats.netProfit.toFixed(2), weekStats.netProfit.toFixed(2), monthStats.netProfit.toFixed(2), alltimeStats.netProfit.toFixed(2)],
      [],
      ['=== PLATFORM POSITION ==='],
      ['Net Capital (Admin Profit All-Time)', netCapital.toFixed(2)],
      ['Platform Cash (XpresPortal)', platformCash.toFixed(2)],
      ['Agent Liability', agentLiability.toFixed(2)],
      ['Pending Withdrawals', pendingWdAll.toFixed(2)],
      [],
      ['=== SELECTED PERIOD ==='],
      ['Gross Revenue', stats.grossRevenue.toFixed(2)],
      ['Provider Cost', stats.providerCost.toFixed(2)],
      ['Agent Commissions', stats.agentComm.toFixed(2)],
      ['Admin Profit', stats.adminProfit.toFixed(2)],
      ['Net Profit', stats.netProfit.toFixed(2)],
      ['Margin %', stats.margin.toFixed(2)],
      ['Successful Orders', stats.succ.length],
      ['Failed Orders', stats.fail.length],
      [],
      ['=== NETWORK BREAKDOWN ==='],
      ['Network', 'Orders', 'Revenue', 'Cost', 'Profit', 'Success Rate', 'Failures'],
      ...stats.byNetwork.map(n => [n.net, n.count, n.revenue.toFixed(2), n.cost.toFixed(2), n.profit.toFixed(2), n.successRate.toFixed(1)+'%', n.failures]),
      [],
      ['=== BUNDLE PERFORMANCE ==='],
      ['Bundle', 'Network', 'Orders', 'Revenue', 'Cost', 'Agent Comm', 'Profit', 'Margin%'],
      ...stats.bundles.map(b => {
        const m = b.revenue > 0 ? ((b.profit / b.revenue) * 100).toFixed(1) : '0';
        return [b.size, b.network, b.count, b.revenue.toFixed(2), b.cost.toFixed(2), b.agentComm.toFixed(2), b.profit.toFixed(2), m];
      }),
      [],
      ['=== TOP AGENTS ==='],
      ['Agent', 'Slug', 'Orders', 'Revenue', 'Commission', 'Paid Out', 'Outstanding'],
      ...stats.agentStats.slice(0, 30).map(a => [a.agent.name, a.agent.slug, a.orders, a.revenue.toFixed(2), a.commission.toFixed(2), a.paidOut.toFixed(2), a.outstanding.toFixed(2)]),
      [],
      ['=== HEALTH SCORE ==='],
      ['Score', healthData.score],
      ['Issues', healthData.reasons.join('; ') || 'None'],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = `admunz-finance-${todayStr}.csv`;
    a.click();
  }

  const netNames:  Record<string, string> = { mtn: 'MTN', at: 'AirtelTigo', telecel: 'Telecel' };
  const netColors: Record<string, string> = { mtn: '#f59e0b', at: '#3b82f6', telecel: '#ef4444' };

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

  return (
    <div>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Finance Intelligence</div>
          <div className="page-subtitle">Business intelligence · {new Date().toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {intelligentAlerts.filter(a => a.level === 'error').length > 0 && (
            <span style={{ fontSize: 12, background: 'rgba(244,63,94,0.15)', color: '#f43f5e', padding: '5px 12px', borderRadius: 100, fontWeight: 700 }}>
              🚨 {intelligentAlerts.filter(a => a.level === 'error').length} Critical
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: `1px solid ${healthData.score >= 75 ? '#10b981' : healthData.score >= 50 ? '#f59e0b' : '#f43f5e'}40`, borderRadius: 10, padding: '5px 12px' }}>
            <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 800, color: healthData.score >= 75 ? '#10b981' : healthData.score >= 50 ? '#f59e0b' : '#f43f5e' }}>{healthData.score}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Health</span>
          </div>
          <div className="tab-nav">
            {(['today','yesterday','week','month','alltime'] as Period[]).map(p => (
              <button key={p} className={`tab-btn${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>{periodLabels[p]}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      {/* LOSS ALERTS */}
      {lossAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {lossAlerts.map((a, i) => <AlertBanner key={i} level={a.severity} msg={a.msg} />)}
        </div>
      )}

      {/* ── SECTION 1: EXECUTIVE COMMAND CENTER ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><SectionToggle id="executive" title="Executive Command Center" icon="🎯" /></div>
        {showSection.executive && (
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Revenue</div>
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {[
                { label: 'Today', val: fmt(todayStats.grossRevenue), sub: `${todayStats.succ.length} orders`, curr: todayStats.grossRevenue, prev: prevStats.grossRevenue },
                { label: 'This Week', val: fmt(weekStats.grossRevenue), sub: `${weekStats.succ.length} orders`, curr: weekStats.grossRevenue, prev: 0 },
                { label: 'This Month', val: fmt(monthStats.grossRevenue), sub: `${monthStats.succ.length} orders`, curr: monthStats.grossRevenue, prev: 0 },
              ].map(s => (
                <div key={s.label} className="stat-card accent">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-val">{s.val}</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                    <span className="stat-sub">{s.sub}</span>
                    <GrowthBadge current={s.curr} previous={s.prev} />
                  </div>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 24, marginTop: 8 }}>
                    {last7.map((v, i) => { const mx = Math.max(...last7.map(x=>x.revenue),1); return <div key={i} style={{ flex:1, height:`${Math.max(10,(v.revenue/mx)*100)}%`, background: i===6?'var(--accent)':'rgba(0,212,170,.3)', borderRadius:'2px 2px 0 0' }} />; })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Admin Profit vs Net Profit</div>
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {[
                { label: 'Admin Today', val: fmt(todayStats.adminProfit), color: 'var(--ok)', sub: 'Your margin only' },
                { label: 'Net Today', val: fmt(todayStats.netProfit), color: todayStats.netProfit>=0?'var(--ok)':'var(--err)', sub: `${todayStats.margin.toFixed(1)}% margin` },
                { label: 'Admin — Week', val: fmt(weekStats.adminProfit), color: 'var(--ok)', sub: 'Your margin only' },
                { label: 'Net — Week', val: fmt(weekStats.netProfit), color: weekStats.netProfit>=0?'var(--ok)':'var(--err)', sub: `${weekStats.margin.toFixed(1)}% margin` },
                { label: 'Admin — Month', val: fmt(monthStats.adminProfit), color: 'var(--ok)', sub: 'Your margin only' },
                { label: 'Net — Month', val: fmt(monthStats.netProfit), color: monthStats.netProfit>=0?'var(--ok)':'var(--err)', sub: `${monthStats.margin.toFixed(1)}% margin` },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-val" style={{ color: s.color, fontSize: 20 }}>{s.val}</div>
                  <div className="stat-sub">{s.sub}</div>
                </div>
              ))}
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Overall Success Rate</div>
                <div className="stat-val" style={{ color: alltimeStats.successRate>=90?'var(--ok)':alltimeStats.successRate>=75?'var(--warn)':'var(--err)' }}>{alltimeStats.successRate.toFixed(1)}%</div>
                <div className="stat-sub">{alltimeStats.succ.length} of {orders.length} orders</div>
              </div>
              <div className="stat-card accent" style={{ borderColor: netCapital<50?'rgba(244,63,94,.3)':'rgba(0,212,170,.2)' }}>
                <div className="stat-label">Net Capital (Admin)</div>
                <div className="stat-val" style={{ color: netCapital<50?'var(--err)':'var(--accent)' }}>{fmt(netCapital)}</div>
                <div className="stat-sub">All-time admin profit earned</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: PLATFORM POSITION ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><SectionToggle id="position" title="Platform Position" icon="🏦" /></div>
        {showSection.position && (
          <div style={{ padding: '0 24px 20px' }}>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              {[
                { label: 'Platform Cash', val: fmt(platformCash), color: platformCash<100?'var(--err)':'var(--accent)', sub: 'XpresPortal wallet' },
                { label: 'Agent Liability', val: fmt(agentLiability), color: 'var(--warn)', sub: 'Earned but not withdrawn' },
                { label: 'Pending Withdrawals', val: fmt(pendingWdAll), color: pendingWdAll>200?'var(--err)':'var(--text2)', sub: `${withdrawals.filter(w=>w.status==='pending').length} requests` },
              ].map(c => (
                <div key={c.label} className="stat-card">
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-val" style={{ color: c.color }}>{c.val}</div>
                  <div className="stat-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ background: netCapital>=0?'linear-gradient(135deg,rgba(0,212,170,.12),rgba(14,165,233,.08))':'rgba(244,63,94,.08)', border:`1px solid ${netCapital>=0?'rgba(0,212,170,.3)':'rgba(244,63,94,.3)'}`, borderRadius:'var(--radius-lg)', padding:'20px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing:'.08em', marginBottom: 4 }}>Net Available Capital (Admin Profit)</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 40, fontWeight: 800, color: netCapital>=0?'var(--accent)':'var(--err)' }}>{fmt(netCapital)}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Your accumulated admin earnings. Agent liabilities are tracked separately.</div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 3: PROFIT TRENDS ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><SectionToggle id="trends" title="Profit Trends" icon="📈" /></div>
        {showSection.trends && (
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {([7,30,90] as const).map(d => (
                <button key={d} className={`btn btn-sm ${trendDays===d?'btn-primary':'btn-secondary'}`} onClick={() => setTrendDays(d)}>Last {d} Days</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { l: 'Revenue', v: fmt(trendData.reduce((s,d)=>s+d.rev,0)), c: 'var(--accent)' },
                { l: 'Provider Cost', v: fmt(trendData.reduce((s,d)=>s+d.cost,0)), c: '#f87171' },
                { l: 'Agent Comm.', v: fmt(trendData.reduce((s,d)=>s+d.comm,0)), c: 'var(--warn)' },
                { l: 'Admin Profit', v: fmt(trendData.reduce((s,d)=>s+d.prof,0)), c: 'var(--ok)' },
              ].map(c => (
                <div key={c.l} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', marginBottom:4 }}>{c.l}</div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:800, color:c.c }}>{c.v}</div>
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: trendDays*20, display:'flex', alignItems:'flex-end', gap:3, height:100 }}>
                {trendData.map((d, i) => (
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, height:'100%', justifyContent:'flex-end' }}>
                    <div style={{ width:'80%', height:`${Math.max(2,(d.prof/maxTrendRev)*70)}px`, background:d.prof>=0?'var(--ok)':'var(--err)', borderRadius:'2px 2px 0 0', opacity:0.9 }} />
                    <div style={{ width:'100%', height:`${Math.max(2,(d.rev/maxTrendRev)*70)}px`, background:'var(--accent)', borderRadius:'2px 2px 0 0', opacity:0.3 }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:16, marginTop:8 }}>
              <span style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:5 }}><span style={{ width:8, height:8, borderRadius:2, background:'rgba(0,212,170,.35)', display:'inline-block' }} /> Revenue</span>
              <span style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:5 }}><span style={{ width:8, height:8, borderRadius:2, background:'var(--ok)', display:'inline-block' }} /> Admin Profit</span>
            </div>
          </div>
        )}
      </div>

      {/* ── TODAY vs YESTERDAY (existing) ── */}
      {(period === 'today' || period === 'yesterday') && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          {(['today','yesterday'] as Period[]).map(p => {
            const s = computeStats(p);
            const isActive = period === p;
            return (
              <button key={p} onClick={() => setPeriod(p)} style={{ background: isActive?'linear-gradient(135deg,rgba(0,212,170,.12),rgba(14,165,233,.07))':'var(--surface)', border:`1px solid ${isActive?'rgba(0,212,170,.35)':'var(--border)'}`, borderRadius:'var(--radius-lg)', padding:'18px 20px', textAlign:'left', cursor:'pointer', transition:'all .2s' }}>
                <div style={{ fontSize:11, fontWeight:700, color:isActive?'var(--accent)':'var(--text3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>{p==='today'?'📅 Today':'📆 Yesterday'}</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:24, fontWeight:800, color:isActive?'var(--accent)':'var(--text)', marginBottom:4 }}>{fmt(s.grossRevenue)}</div>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:8 }}>Revenue · {s.succ.length} orders</div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  {[
                    { l:'Admin Profit', v:fmt(s.adminProfit), c:s.adminProfit>=0?'var(--ok)':'var(--err)' },
                    { l:'Net Profit', v:fmt(s.netProfit), c:s.netProfit>=0?'var(--ok)':'var(--err)' },
                    { l:'Margin', v:`${s.margin.toFixed(1)}%`, c:s.margin>=10?'var(--ok)':s.margin>=0?'var(--warn)':'var(--err)' },
                    { l:'Cost', v:fmt(s.providerCost), c:'#f87171' },
                  ].map(x => (
                    <div key={x.l}>
                      <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase' }}>{x.l}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:x.c }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── EXISTING KPI CARDS ── */}
      <div className="stats-grid" style={{ marginBottom:20 }}>
        {[
          { label:'Gross Revenue', val:fmt(stats.grossRevenue), sub:`${stats.succ.length} orders`, icon:'💰', bg:'var(--accent-dim)', color:'var(--accent)', accent:true, curr:stats.grossRevenue, prev:prevStats.grossRevenue },
          { label:'Provider Cost', val:fmt(stats.providerCost), sub:'XpresPortal', icon:'📡', bg:'rgba(239,68,68,0.12)', color:'#f87171', curr:stats.providerCost, prev:prevStats.providerCost },
          { label:'Agent Commissions', val:fmt(stats.agentComm), sub:'Paid to resellers', icon:'👥', bg:'rgba(245,158,11,0.12)', color:'var(--warn)', curr:stats.agentComm, prev:prevStats.agentComm },
          { label:'Admin Profit', val:fmt(stats.adminProfit), sub:'Your margin', icon:'🏦', bg:'rgba(16,185,129,0.12)', color:'var(--ok)', accent:true, curr:stats.adminProfit, prev:prevStats.adminProfit },
          { label:'Net Profit', val:fmt(stats.netProfit), sub:`${stats.margin.toFixed(1)}% margin`, icon:'📈', bg:'rgba(16,185,129,0.08)', color:stats.netProfit<0?'var(--err)':'var(--ok)', curr:stats.netProfit, prev:prevStats.netProfit },
        ].map(s => (
          <div key={s.label} className={`stat-card${s.accent?' accent':''}`}>
            <div className="stat-icon" style={{ background:s.bg, color:s.color, fontSize:18, width:38, height:38, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color:s.color }}>{s.val}</div>
            <div style={{ display:'flex', alignItems:'center', marginTop:4, flexWrap:'wrap' }}>
              <span className="stat-sub">{s.sub}</span>
              <GrowthBadge current={s.curr} previous={s.prev} />
            </div>
          </div>
        ))}
      </div>

      {/* ── EXISTING secondary KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:20 }}>
        {[
          { label:'Avg Order Value', val:fmt(stats.avgOrderValue), color:'var(--accent2)' },
          { label:'Avg Profit / Order', val:fmt(stats.avgProfitPerOrder), color:'var(--ok)' },
          { label:'Success Rate', val:`${stats.successRate.toFixed(1)}%`, color:stats.successRate>=90?'var(--ok)':'var(--warn)' },
          { label:'Failed Orders', val:String(stats.fail.length), color:stats.fail.length>0?'var(--err)':'var(--text3)' },
          { label:'Total Liabilities', val:fmt(stats.totalLiabilities), color:'var(--warn)' },
          { label:'XpresPortal Wallet', val:hubBalance!==null?fmt(hubBalance):'—', color:hubBalance!==null&&hubBalance<100?'var(--err)':'var(--ok)' },
        ].map(c => (
          <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{c.label}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:800, color:c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* ── EXISTING: 7-day chart + health ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:14, marginBottom:16, alignItems:'stretch' }}>
        <div className="card">
          <div className="card-header"><div style={{ display:'flex', alignItems:'center', gap:8 }}><span>📊</span><div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>Last 7 Days — Daily Revenue</div></div></div>
          <div className="card-body">
            <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:80 }}>
              {last7.map((d,i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:9, color:d.ds===todayStr?'var(--accent)':d.ds===yesterdayStr?'#7dd3fc':'var(--text3)', fontWeight:700, textAlign:'center', whiteSpace:'nowrap' }}>{fmt(d.revenue).replace('₵','')}</div>
                  <MiniBar value={d.revenue} max={maxRev} color={d.ds===todayStr?'var(--accent)':d.ds===yesterdayStr?'#7dd3fc':'rgba(100,116,139,0.6)'} />
                  <div style={{ fontSize:9, color:d.ds===todayStr?'var(--accent)':'var(--text3)', fontWeight:d.ds===todayStr?700:400 }}>{d.label}</div>
                  <div style={{ fontSize:9, color:'var(--text3)' }}>{d.count}×</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
              {[{c:'var(--accent)',l:'Today'},{c:'#7dd3fc',l:'Yesterday'},{c:'rgba(100,116,139,0.6)',l:'Earlier'}].map(x=>(
                <span key={x.l} style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:5 }}><span style={{ width:8, height:8, borderRadius:2, background:x.c, display:'inline-block' }} />{x.l}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="card" style={{ minWidth:160 }}>
          <div className="card-header"><div style={{ display:'flex', alignItems:'center', gap:8 }}><span>❤️</span><div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>Health</div></div></div>
          <div className="card-body" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, paddingTop:12 }}>
            <HealthRing score={healthData.score} />
            <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', lineHeight:1.5 }}>Margin · success rate · liabilities · wallet</div>
            {healthData.reasons.map((r,i) => (
              <div key={i} style={{ fontSize:10, color:'var(--warn)', display:'flex', gap:4 }}><span>⚠</span><span>{r}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* ── EXISTING: Revenue breakdown cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14, marginBottom:16 }}>
        <div className="card">
          <div className="card-header"><div style={{ display:'flex', alignItems:'center', gap:8 }}><span>📋</span><div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>Revenue Breakdown</div></div></div>
          <div className="card-body">
            <StatRow label="Gross Revenue" value={fmt(stats.grossRevenue)} color="var(--accent)" bold />
            <StatRow label="− Provider Cost" value={`−${fmt(stats.providerCost)}`} color="#f87171" />
            <StatRow label="− Agent Commissions" value={`−${fmt(stats.agentComm)}`} color="var(--warn)" />
            <StatRow label="= Admin Profit" value={fmt(stats.adminProfit)} color="var(--ok)" bold />
            <div style={{ borderTop:'2px solid rgba(255,255,255,0.1)', marginTop:4, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'var(--text3)' }}>Net Profit (Rev − Cost − Comm)</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:800, color:stats.netProfit<0?'var(--err)':'var(--ok)' }}>{fmt(stats.netProfit)}</span>
                <GrowthBadge current={stats.netProfit} previous={prevStats.netProfit} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14 }}>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 14px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', marginBottom:4 }}>Margin</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800, color:stats.margin<0?'var(--err)':stats.margin<5?'var(--warn)':'var(--ok)' }}>{stats.margin.toFixed(1)}%</div>
              </div>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 14px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', marginBottom:4 }}>Avg/Order</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800, color:'var(--accent)' }}>{fmt(stats.avgProfitPerOrder)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div style={{ display:'flex', alignItems:'center', gap:8 }}><span>💸</span><div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>Liabilities & Payouts</div></div></div>
          <div className="card-body">
            <StatRow label="Total Agent Earnings (all time)" value={fmt(stats.totalAgentEarnings)} color="var(--accent)" bold />
            <StatRow label="Already Paid Out" value={fmt(stats.paidOut)} color="var(--ok)" />
            <StatRow label="Pending Withdrawal Reqs" value={fmt(stats.pendingWd)} color={stats.pendingWd>0?'var(--warn)':'var(--text3)'} sub={`${withdrawals.filter(w=>w.status==='pending').length} requests`} />
            <StatRow label="Earned But Not Requested" value={fmt(stats.outstanding)} color="var(--text3)" sub="Sitting in agent balances" />
            <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:8, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, color:'var(--text2)' }}>Total Liability</span>
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:800, color:'var(--warn)' }}>{fmt(stats.totalLiabilities)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div style={{ display:'flex', alignItems:'center', gap:8 }}><span>💳</span><div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>Paystack</div></div></div>
          <div className="card-body">
            <StatRow label="Total Processed" value={fmt(stats.grossRevenue)} sub="All customer payments" color="var(--accent)" bold />
            <StatRow label="Failed Orders" value={String(stats.fail.length)} color={stats.fail.length>0?'var(--err)':'var(--text3)'} />
            <StatRow label="Success Rate" value={`${stats.successRate.toFixed(1)}%`} sub={`${stats.succ.length} of ${orders.length} orders`} color="var(--ok)" />
            <div className="alert alert-info" style={{ marginTop:14, fontSize:12 }}><span>ℹ</span><span>Check Paystack dashboard for settlement timing.</span></div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div style={{ display:'flex', alignItems:'center', gap:8 }}><span>📡</span><div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>XpresPortal Wallet</div></div></div>
          <div className="card-body">
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:36, fontWeight:800, color:hubBalance!==null&&hubBalance<100?'var(--err)':'var(--accent)', marginBottom:4 }}>{hubBalance!==null?fmt(hubBalance):'—'}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:14 }}>Current wallet balance</div>
            <StatRow label="Spent This Period" value={fmt(stats.providerCost)} color="#f87171" />
            <StatRow label="Orders Delivered" value={String(orders.filter(o=>o.delivery_status==='delivered').length)} color="var(--ok)" />
            <StatRow label="Delivery Failures" value={String(orders.filter(o=>o.delivery_status==='failed').length)} color={orders.filter(o=>o.delivery_status==='failed').length>0?'var(--err)':'var(--text3)'} />
            {hubBalance!==null&&hubBalance<100&&<div className="alert alert-error" style={{ marginTop:12, fontSize:12 }}><span>⚠</span><span>Balance critically low. Top up now.</span></div>}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: NETWORK INTELLIGENCE ── */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header"><SectionToggle id="network" title="Network Intelligence" icon="📶" /></div>
        {showSection.network && (
          <>
            <div className="card-body" style={{ paddingBottom:0 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:14 }}>
                {[...stats.byNetwork].sort((a,b)=>b.profit-a.profit).map((n,rank) => {
                  const nMargin = n.revenue>0?(n.profit/n.revenue)*100:0;
                  return (
                    <div key={n.net} style={{ background:'var(--surface2)', borderRadius:12, padding:16, border:`1px solid ${netColors[n.net]}30`, position:'relative' }}>
                      <div style={{ position:'absolute', top:10, right:12, fontSize:10, fontWeight:800, color:rank===0?'#f59e0b':'var(--text3)' }}>#{rank+1}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:netColors[n.net] }} />
                        <div style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>{netNames[n.net]}</div>
                        <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)' }}>{n.count}×</div>
                      </div>
                      {[
                        { l:'Revenue', v:fmt(n.revenue), c:netColors[n.net] },
                        { l:'Cost', v:fmt(n.cost), c:'#f87171' },
                        { l:'Profit', v:fmt(n.profit), c:n.profit<0?'var(--err)':'var(--ok)' },
                        { l:'Margin', v:`${nMargin.toFixed(1)}%`, c:nMargin<0?'var(--err)':nMargin<5?'var(--warn)':'var(--ok)' },
                        { l:'Success', v:`${n.successRate.toFixed(1)}%`, c:n.successRate>=90?'var(--ok)':'var(--warn)' },
                        { l:'Failures', v:String(n.failures), c:n.failures>5?'var(--err)':'var(--text3)' },
                      ].map(row=>(
                        <div key={row.l} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                          <span style={{ color:'var(--text3)' }}>{row.l}</span>
                          <span style={{ fontWeight:700, color:row.c }}>{row.v}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Network</th><th>Orders</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th><th>Success</th><th>Failures</th></tr></thead>
                <tbody>
                  {[...stats.byNetwork].sort((a,b)=>b.profit-a.profit).map(n => {
                    const m = n.revenue>0?(n.profit/n.revenue)*100:0;
                    return (
                      <tr key={n.net}>
                        <td><div style={{ display:'flex', alignItems:'center', gap:6 }}><span style={{ width:8, height:8, borderRadius:'50%', background:netColors[n.net], display:'inline-block' }} /><strong>{netNames[n.net]}</strong></div></td>
                        <td>{n.count}</td>
                        <td style={{ color:'var(--accent)' }}>{fmt(n.revenue)}</td>
                        <td style={{ color:'#f87171' }}>{fmt(n.cost)}</td>
                        <td style={{ color:n.profit>=0?'var(--ok)':'var(--err)', fontWeight:700 }}>{fmt(n.profit)}</td>
                        <td style={{ color:m<0?'var(--err)':'var(--ok)' }}>{m.toFixed(1)}%</td>
                        <td style={{ color:n.successRate>=90?'var(--ok)':'var(--warn)' }}>{n.successRate.toFixed(1)}%</td>
                        <td style={{ color:n.failures>5?'var(--err)':'var(--text3)' }}>{n.failures}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── EXISTING: Bundle performance ── */}
      {stats.bundles.length > 0 && (
        <div className="card" style={{ marginBottom:14 }}>
          <div className="card-header">
            <SectionToggle id="bundles" title="Bundle Performance" icon="📦" />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBundles(v=>!v)}>{showBundles?'Collapse':`Show All (${stats.bundles.length})`}</button>
          </div>
          {showSection.bundles && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Bundle</th><th>Network</th><th>Orders</th><th>Revenue</th><th>Cost</th><th>Agent Comm</th><th>Profit</th><th>Margin</th><th>Flag</th></tr></thead>
                <tbody>
                  {stats.bundles.slice(0, showBundles?999:8).map(b => {
                    const m = b.revenue>0?(b.profit/b.revenue)*100:0;
                    const isLoss = b.profit<0;
                    const isLow  = !isLoss && m<5;
                    return (
                      <tr key={b.key} style={{ background:isLoss?'rgba(244,63,94,0.04)':isLow?'rgba(245,158,11,0.03)':undefined }}>
                        <td style={{ fontWeight:600 }}>{b.size}</td>
                        <td><span className={`badge badge-${b.network}`}>{netNames[b.network]||b.network}</span></td>
                        <td>{b.count}</td>
                        <td style={{ color:'var(--accent)' }}>{fmt(b.revenue)}</td>
                        <td style={{ color:'#f87171' }}>{fmt(b.cost)}</td>
                        <td style={{ color:'var(--warn)' }}>{fmt(b.agentComm)}</td>
                        <td style={{ color:isLoss?'var(--err)':'var(--ok)', fontWeight:700 }}>{fmt(b.profit)}</td>
                        <td style={{ color:isLoss?'var(--err)':isLow?'var(--warn)':'var(--ok)' }}>{m.toFixed(1)}%</td>
                        <td>
                          {isLoss&&<span style={{ fontSize:11, background:'var(--err-dim)', color:'#fda4af', padding:'2px 7px', borderRadius:100, fontWeight:700 }}>🔴 LOSS</span>}
                          {isLow&&<span style={{ fontSize:11, background:'var(--warn-dim)', color:'#fcd34d', padding:'2px 7px', borderRadius:100, fontWeight:700 }}>⚠ LOW</span>}
                          {!isLoss&&!isLow&&<span style={{ fontSize:11, background:'rgba(16,185,129,0.1)', color:'#6ee7b7', padding:'2px 7px', borderRadius:100, fontWeight:700 }}>✓ OK</span>}
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

      {/* ── SECTION 5: AGENT INTELLIGENCE ── */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header">
          <SectionToggle id="agents" title="Agent Intelligence" icon="👥" />
          <div style={{ display:'flex', gap:6 }}>
            {(['revenue','profit','inactive'] as const).map(v => (
              <button key={v} className={`btn btn-sm ${agentView===v?'btn-primary':'btn-secondary'}`} onClick={() => setAgentView(v)}>
                {v==='revenue'?'🏆 Revenue':v==='profit'?'💰 Profit':'💤 Inactive'}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAgents(v=>!v)}>{showAgents?'Top 5':'Show All'}</button>
        </div>
        {showSection.agents && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Agent</th><th>Orders</th><th>Revenue</th><th>Commission</th><th>Paid Out</th><th>Pending</th><th>Outstanding</th><th>{agentView==='inactive'?'Last Sale':agentView==='profit'?'W/W Growth':'This Week'}</th></tr></thead>
              <tbody>
                {(agentView==='inactive'
                  ? stats.agentStats.filter(a=>a.daysSince===null||a.daysSince>7).sort((a,b)=>(b.daysSince??999)-(a.daysSince??999))
                  : agentView==='profit'
                  ? stats.agentStats.sort((a,b)=>b.commission-a.commission)
                  : stats.agentStats
                ).slice(0, showAgents?999:5).map((a,i) => (
                  <tr key={a.agent.id}>
                    <td style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:14, color:i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#b45309':'var(--text3)' }}>
                      {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                    </td>
                    <td><div style={{ fontWeight:600 }}>{a.agent.name}</div><div style={{ fontSize:11, color:'var(--text3)' }}>/store/{a.agent.slug}</div></td>
                    <td style={{ fontWeight:600 }}>{a.orders}</td>
                    <td style={{ color:'var(--accent)', fontWeight:600 }}>{fmt(a.revenue)}</td>
                    <td style={{ color:'var(--warn)', fontWeight:600 }}>{fmt(a.commission)}</td>
                    <td style={{ color:'var(--ok)' }}>{fmt(a.paidOut)}</td>
                    <td style={{ color:a.pending>0?'var(--warn)':'var(--text3)' }}>{fmt(a.pending)}</td>
                    <td style={{ color:'var(--text3)', fontSize:12 }}>{fmt(a.outstanding)}</td>
                    <td style={{ fontSize:12 }}>
                      {agentView==='inactive'
                        ? <span style={{ color:a.daysSince!==null&&a.daysSince>14?'var(--err)':'var(--warn)' }}>{a.daysSince!==null?`${a.daysSince}d ago`:'Never'}</span>
                        : agentView==='profit'
                        ? a.growth!==null?<span style={{ color:a.growth>=0?'var(--ok)':'var(--err)', fontWeight:700 }}>{a.growth>=0?'▲':'▼'} {Math.abs(a.growth).toFixed(1)}%</span>:<span style={{ color:'var(--text3)' }}>—</span>
                        : <span style={{ color:'var(--text)' }}>{fmt(a.wkRev)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION 6: FAILURE INTELLIGENCE ── */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header"><SectionToggle id="failures" title="Failure Intelligence" icon="❌" /></div>
        {showSection.failures && (
          <div style={{ padding:'0 24px 20px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:16 }}>
              {[
                { l:'Total Failures', v:failStats.failed.length, c:failStats.failed.length>20?'var(--err)':'var(--text)' },
                { l:'Failure Rate', v:`${failStats.rate.toFixed(1)}%`, c:failStats.rate>15?'var(--err)':failStats.rate>5?'var(--warn)':'var(--ok)' },
                { l:'Today Failures', v:failStats.todayFail, c:failStats.todayFail>5?'var(--err)':'var(--warn)' },
              ].map(c => (
                <div key={c.l} style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', marginBottom:4 }}>{c.l}</div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontSize:24, fontWeight:800, color:c.c }}>{c.v}</div>
                </div>
              ))}
            </div>
            {failStats.rate>10&&<AlertBanner level="error" msg={`Failure rate ${failStats.rate.toFixed(1)}% exceeds 10% threshold — immediate investigation recommended.`} />}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:14 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', marginBottom:10 }}>By Network</div>
                {failStats.byNet.map(n => {
                  const rate = n.total>0?(n.count/n.total)*100:0;
                  return (
                    <div key={n.net} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                        <span style={{ fontWeight:600 }}>{netNames[n.net]}</span>
                        <span style={{ color:rate>15?'var(--err)':'var(--text3)' }}>{n.count} ({rate.toFixed(1)}%)</span>
                      </div>
                      <div style={{ height:5, background:'var(--surface3)', borderRadius:100, overflow:'hidden' }}>
                        <div style={{ width:`${Math.min(100,rate)}%`, height:'100%', background:rate>15?'var(--err)':netColors[n.net], borderRadius:100 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', marginBottom:10 }}>Last 7 Days</div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:70 }}>
                  {failStats.last7f.map((d,i) => {
                    const mx = Math.max(...failStats.last7f.map(x=>x.count),1);
                    return (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                        <div style={{ width:'100%', height:`${Math.max(3,(d.count/mx)*52)}px`, background:d.count>3?'var(--err)':'var(--warn)', borderRadius:'3px 3px 0 0' }} />
                        <div style={{ fontSize:9, color:'var(--text3)' }}>{d.label}</div>
                        <div style={{ fontSize:9, fontWeight:700, color:d.count>0?'var(--err)':'var(--text3)' }}>{d.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 7: FORECASTING ── */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header"><SectionToggle id="forecast" title="Forecasting" icon="🔮" /></div>
        {showSection.forecast && (
          <div style={{ padding:'0 24px 20px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:14 }}>
              {[
                { l:'Projected Monthly Revenue', v:fmt(forecast.projRev), c:'var(--accent)', sub:`${fmt(forecast.avgDailyRev)}/day avg` },
                { l:'Projected Monthly Profit', v:fmt(forecast.projProf), c:forecast.projProf>=0?'var(--ok)':'var(--err)', sub:`${fmt(forecast.avgDailyProf)}/day avg` },
                { l:'7-Day Growth Rate', v:`${forecast.growthRate>=0?'+':''}${forecast.growthRate.toFixed(1)}%`, c:forecast.growthRate>=0?'var(--ok)':'var(--err)', sub:'vs previous 7 days' },
              ].map(c => (
                <div key={c.l} className="stat-card accent">
                  <div className="stat-label">{c.l}</div>
                  <div className="stat-val" style={{ color:c.c, fontSize:22 }}>{c.v}</div>
                  <div className="stat-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div className="alert alert-info" style={{ fontSize:12 }}><span>ℹ</span><span>Projections based on your last 30 days of order data. Actual results may vary.</span></div>
          </div>
        )}
      </div>

      {/* ── SECTION 8: INTELLIGENT ALERTS ── */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header"><SectionToggle id="alerts" title="Intelligent Alerts & Recommendations" icon="🔔" /></div>
        {showSection.alerts && (
          <div style={{ padding:'0 24px 20px', display:'flex', flexDirection:'column', gap:10 }}>
            {intelligentAlerts.map((a,i) => (
              <div key={i} style={{ background:a.level==='error'?'rgba(244,63,94,.06)':a.level==='warn'?'rgba(245,158,11,.06)':'rgba(14,165,233,.06)', border:`1px solid ${a.level==='error'?'rgba(244,63,94,.25)':a.level==='warn'?'rgba(245,158,11,.25)':'rgba(14,165,233,.25)'}`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:10, fontWeight:800, padding:'2px 6px', borderRadius:4, background:a.level==='error'?'rgba(244,63,94,.2)':a.level==='warn'?'rgba(245,158,11,.2)':'rgba(14,165,233,.2)', color:a.level==='error'?'#f43f5e':a.level==='warn'?'#f59e0b':'#0ea5e9', letterSpacing:'.06em' }}>
                    {a.level==='error'?'CRITICAL':a.level==='warn'?'WARNING':'INFO'}
                  </span>
                  <span style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700 }}>{a.title}</span>
                </div>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:4 }}>{a.detail}</div>
                <div style={{ fontSize:12, color:'var(--text3)' }}>→ <em>{a.action}</em></div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
