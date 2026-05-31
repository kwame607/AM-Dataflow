// ─────────────────────────────────────────────────────────────
// FINANCE TAB — drop this inside app/xena-173424/page.tsx
// 1. Add `finance` to the Tab type
// 2. Add it to navItems array
// 3. Paste the <FinanceTab> component at the bottom of the file
// 4. Add {tab === 'finance' && <FinanceTab orders={orders} withdrawals={withdrawals} agents={agents} hubBalance={hubBalance} />}
//    inside the <main> alongside the other tabs
// ─────────────────────────────────────────────────────────────

import type { Order, Withdrawal, Agent } from '@/types';
import { fmt } from '@/lib/utils';
import React, { useState, useMemo } from 'react';

type Period = 'today' | 'week' | 'month' | 'alltime';

interface FinanceTabProps {
  orders: Order[];
  withdrawals: Withdrawal[];
  agents: Agent[];
  hubBalance: number | null;
}

export function FinanceTab({ orders, withdrawals, agents, hubBalance }: FinanceTabProps) {
  const [period, setPeriod] = useState<Period>('alltime');

  const now = new Date();

  function inPeriod(dateStr: string): boolean {
    const d = new Date(dateStr);
    if (period === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (period === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (period === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true; // alltime
  }

  const stats = useMemo(() => {
    const successOrders = orders.filter(o => o.status === 'success' && inPeriod(o.created_at));
    const failedOrders  = orders.filter(o => o.status === 'failed'  && inPeriod(o.created_at));
    const allSuccess    = orders.filter(o => o.status === 'success');

    // Revenue
    const grossRevenue     = successOrders.reduce((s, o) => s + (o.agent_price  || o.admin_price || 0), 0);
    const xpresportaCost   = successOrders.reduce((s, o) => s + (o.hubnet_cost  || 0), 0);
    const agentCommissions = successOrders.reduce((s, o) => s + (o.agent_profit || 0), 0);
    const adminProfit      = successOrders.reduce((s, o) => s + (o.admin_profit || 0), 0);
    const netProfit        = grossRevenue - xpresportaCost - agentCommissions;
    const profitMargin     = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100) : 0;
    const avgProfitPerOrder = successOrders.length > 0 ? netProfit / successOrders.length : 0;

    // Paystack
    const paystackTotal    = grossRevenue; // total processed through paystack
    // We can't know Paystack settlement status without their API,
    // so we show total processed and note settlement is external
    
    // Agent payouts
    const totalAgentEarnings   = allSuccess.reduce((s, o) => s + (o.agent_profit || 0), 0);
    const paidOut              = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
    const pendingWd            = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
    const outstandingUnrequested = totalAgentEarnings - paidOut - pendingWd;

    // Per network breakdown
    const networks = ['mtn', 'at', 'telecel'] as const;
    const byNetwork = networks.map(net => {
      const netOrders = successOrders.filter(o => o.network === net);
      const revenue   = netOrders.reduce((s, o) => s + (o.agent_price || o.admin_price || 0), 0);
      const cost      = netOrders.reduce((s, o) => s + (o.hubnet_cost || 0), 0);
      const profit    = netOrders.reduce((s, o) => s + (o.admin_profit || 0), 0);
      return { net, count: netOrders.length, revenue, cost, profit };
    });

    // Health indicators
    const isLoss = netProfit < 0;
    const lowBalance = hubBalance !== null && hubBalance < 100;
    const highPendingWd = pendingWd > adminProfit * 0.8;

    // Per agent breakdown (all time always)
    const agentBreakdown = agents.filter(a => a.status === 'active').map(a => {
      const agOrders  = allSuccess.filter(o => o.agent_id === a.id);
      const revenue   = agOrders.reduce((s, o) => s + (o.agent_price || 0), 0);
      const commission = agOrders.reduce((s, o) => s + (o.agent_profit || 0), 0);
      const agWd      = withdrawals.filter(w => w.agent_id === a.id && w.status === 'paid').reduce((s, w) => s + w.amount, 0);
      const agPending = withdrawals.filter(w => w.agent_id === a.id && w.status === 'pending').reduce((s, w) => s + w.amount, 0);
      const outstanding = commission - agWd - agPending;
      return { agent: a, orders: agOrders.length, revenue, commission, paidOut: agWd, pending: agPending, outstanding };
    }).sort((a, b) => b.commission - a.commission);

    return {
      successOrders, failedOrders,
      grossRevenue, xpresportaCost, agentCommissions, adminProfit, netProfit,
      profitMargin, avgProfitPerOrder, paystackTotal,
      totalAgentEarnings, paidOut, pendingWd, outstandingUnrequested,
      byNetwork, isLoss, lowBalance, highPendingWd, agentBreakdown,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, withdrawals, agents, hubBalance, period]);

  const periodLabels: Record<Period, string> = {
    today: 'Today', week: 'This Week', month: 'This Month', alltime: 'All Time',
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, marginTop: 4 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700 }}>{title}</div>
      </div>
    );
  }

  const netNames: Record<string, string> = { mtn: 'MTN', at: 'AirtelTigo', telecel: 'Telecel' };
  const netColors: Record<string, string> = { mtn: '#f59e0b', at: '#3b82f6', telecel: '#ef4444' };

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Finance</div>
          <div className="page-subtitle">Full breakdown of revenue, costs and profit</div>
        </div>
        <div className="tab-nav">
          {(['today','week','month','alltime'] as Period[]).map(p => (
            <button key={p} className={`tab-btn${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Health alerts */}
      {(stats.isLoss || stats.lowBalance || stats.highPendingWd) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {stats.isLoss && (
            <div className="alert alert-error">
              <span>⚠</span>
              <span><strong>Running at a loss!</strong> Your net profit is negative for {periodLabels[period].toLowerCase()}. Check your bundle prices vs XpresPortal costs.</span>
            </div>
          )}
          {stats.lowBalance && (
            <div className="alert alert-warn">
              <span>⚠</span>
              <span><strong>Low XpresPortal balance:</strong> {fmt(hubBalance!)} remaining. Top up to avoid failed deliveries.</span>
            </div>
          )}
          {stats.highPendingWd && (
            <div className="alert alert-warn">
              <span>⚠</span>
              <span><strong>High pending withdrawals:</strong> Agents are waiting for {fmt(stats.pendingWd)} which is most of your profit. Process payouts soon.</span>
            </div>
          )}
        </div>
      )}

      {/* Top KPI cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Gross Revenue',    val: fmt(stats.grossRevenue),     sub: `${stats.successOrders.length} successful orders`, accent: true,  icon: '💰', bg: 'var(--accent-dim)',           color: 'var(--accent)' },
          { label: 'XpresPortal Cost', val: fmt(stats.xpresportaCost),   sub: 'Data delivery cost',                              accent: false, icon: '📡', bg: 'rgba(239,68,68,0.12)',        color: '#f87171' },
          { label: 'Agent Commissions',val: fmt(stats.agentCommissions), sub: 'Paid to resellers',                               accent: false, icon: '👥', bg: 'rgba(245,158,11,0.12)',       color: 'var(--warn)' },
          { label: 'Your Net Profit',  val: fmt(stats.netProfit),        sub: `${stats.profitMargin.toFixed(1)}% margin`,        accent: true,  icon: '📈', bg: 'rgba(16,185,129,0.12)',       color: stats.netProfit < 0 ? 'var(--err)' : 'var(--ok)' },
        ].map(s => (
          <div key={s.label} className={`stat-card${s.accent ? ' accent' : ''}`}>
            <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>

        {/* Revenue Breakdown */}
        <div className="card">
          <div className="card-header"><SectionHeader title="Revenue Breakdown" icon="📊" /></div>
          <div className="card-body">
            <StatRow label="Gross Revenue"       value={fmt(stats.grossRevenue)}     color="var(--accent)" bold />
            <StatRow label="− XpresPortal Cost"  value={`−${fmt(stats.xpresportaCost)}`}   color="#f87171" />
            <StatRow label="− Agent Commissions" value={`−${fmt(stats.agentCommissions)}`} color="var(--warn)" />
            <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', marginTop: 4, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>= Your Net Profit</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: stats.netProfit < 0 ? 'var(--err)' : 'var(--ok)' }}>{fmt(stats.netProfit)}</span>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Margin</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: stats.profitMargin < 0 ? 'var(--err)' : 'var(--ok)' }}>{stats.profitMargin.toFixed(1)}%</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Avg / Order</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{fmt(stats.avgProfitPerOrder)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Paystack */}
        <div className="card">
          <div className="card-header"><SectionHeader title="Paystack" icon="💳" /></div>
          <div className="card-body">
            <StatRow
              label="Total Processed"
              value={fmt(stats.paystackTotal)}
              sub="All customer payments via Paystack"
              color="var(--accent)" bold
            />
            <StatRow
              label="Failed Orders"
              value={String(stats.failedOrders.length)}
              sub="Payment failed or not completed"
              color={stats.failedOrders.length > 0 ? 'var(--err)' : 'var(--text3)'}
            />
            <StatRow
              label="Success Rate"
              value={`${orders.length > 0 ? ((stats.successOrders.length / orders.length) * 100).toFixed(1) : '0'}%`}
              sub={`${stats.successOrders.length} of ${orders.length} orders`}
              color="var(--ok)"
            />
            <div className="alert alert-info" style={{ marginTop: 16, fontSize: 12 }}>
              <span>ℹ</span>
              <span>Paystack settlement schedule depends on your account type. Check your Paystack dashboard for settlement status.</span>
            </div>
          </div>
        </div>

        {/* Agent Payouts */}
        <div className="card">
          <div className="card-header"><SectionHeader title="Agent Payouts" icon="👥" /></div>
          <div className="card-body">
            <StatRow label="Total Agent Earnings" value={fmt(stats.totalAgentEarnings)} sub="All time" color="var(--accent)" bold />
            <StatRow label="Already Paid Out"      value={fmt(stats.paidOut)}            color="var(--ok)" />
            <StatRow label="Pending Requests"      value={fmt(stats.pendingWd)}          color={stats.pendingWd > 0 ? 'var(--warn)' : 'var(--text3)'} sub={`${withdrawals.filter(w => w.status === 'pending').length} withdrawal requests`} />
            <StatRow label="Earned But Not Requested" value={fmt(Math.max(0, stats.outstandingUnrequested))} sub="Sitting in agent balances" color="var(--text3)" />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Your liability to agents</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--warn)' }}>{fmt(stats.pendingWd + Math.max(0, stats.outstandingUnrequested))}</span>
            </div>
          </div>
        </div>

        {/* XpresPortal Wallet */}
        <div className="card">
          <div className="card-header"><SectionHeader title="XpresPortal Wallet" icon="📡" /></div>
          <div className="card-body">
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 36, fontWeight: 800, color: hubBalance !== null && hubBalance < 100 ? 'var(--err)' : 'var(--accent)', marginBottom: 6 }}>
              {hubBalance !== null ? fmt(hubBalance) : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Current wallet balance</div>
            <StatRow label="Spent This Period" value={fmt(stats.xpresportaCost)} sub="Data delivery cost" color="#f87171" />
            <StatRow label="Orders Delivered"  value={String(orders.filter(o => o.delivery_status === 'delivered').length)} color="var(--ok)" />
            <StatRow label="Delivery Failures" value={String(orders.filter(o => o.delivery_status === 'failed').length)}   color={orders.filter(o => o.delivery_status === 'failed').length > 0 ? 'var(--err)' : 'var(--text3)'} />
            {hubBalance !== null && hubBalance < 100 && (
              <div className="alert alert-error" style={{ marginTop: 12, fontSize: 12 }}>
                <span>⚠</span><span>Balance is critically low. Top up now to avoid failed orders.</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Network breakdown */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><SectionHeader title="Revenue by Network" icon="📶" /></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {stats.byNetwork.map(n => (
              <div key={n.net} style={{ background: 'var(--surface2)', borderRadius: 12, padding: '16px', border: `1px solid ${netColors[n.net]}30` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: netColors[n.net], flexShrink: 0 }} />
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700 }}>{netNames[n.net]}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{n.count} orders</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>Revenue</span>
                    <span style={{ fontWeight: 600, color: netColors[n.net] }}>{fmt(n.revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>Cost</span>
                    <span style={{ fontWeight: 600, color: '#f87171' }}>{fmt(n.cost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, marginTop: 2 }}>
                    <span style={{ color: 'var(--text3)' }}>Profit</span>
                    <span style={{ fontWeight: 700, color: n.profit < 0 ? 'var(--err)' : 'var(--ok)' }}>{fmt(n.profit)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per agent breakdown */}
      {stats.agentBreakdown.length > 0 && (
        <div className="card">
          <div className="card-header">
            <SectionHeader title="Agent Commission Breakdown" icon="🏪" />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>All time</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Orders</th>
                  <th>Their Revenue</th>
                  <th>Commission Earned</th>
                  <th>Paid Out</th>
                  <th>Pending</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {stats.agentBreakdown.map(a => (
                  <tr key={a.agent.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.agent.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>/store/{a.agent.slug}</div>
                    </td>
                    <td>{a.orders}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(a.revenue)}</td>
                    <td style={{ color: 'var(--warn)', fontWeight: 600 }}>{fmt(a.commission)}</td>
                    <td style={{ color: 'var(--ok)' }}>{fmt(a.paidOut)}</td>
                    <td style={{ color: a.pending > 0 ? 'var(--warn)' : 'var(--text3)' }}>{fmt(a.pending)}</td>
                    <td style={{ color: a.outstanding > 0 ? 'var(--text3)' : 'var(--ok)', fontSize: 12 }}>{fmt(Math.max(0, a.outstanding))}</td>
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
