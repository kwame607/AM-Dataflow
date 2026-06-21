// components/AdminCustomerInsights.tsx
// Platform-wide customer insights for the admin dashboard — aggregates every order
// across all agents/stores by recipient phone number. Pure client-side derivation
// from the orders array already loaded in the admin dashboard state.
'use client';

import React, { useMemo, useState } from 'react';
import type { Order, Agent } from '@/types';
import { fmt, fmtDate } from '@/lib/utils';
import { NET_NAMES } from '@/lib/bundles';

interface AdminCustomerInsightsProps {
  orders: Order[];
  agents: Agent[];
}

interface CustomerStat {
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  favoriteNetwork: string;
  daysSinceLast: number;
  agentNames: string[];
  isAgentSourced: boolean;
}

function buildCustomerStats(orders: Order[], agents: Agent[]): CustomerStat[] {
  const success = orders.filter(o => o.status === 'success' && o.phone);
  const agentNameMap: Record<string, string> = {};
  agents.forEach(a => { agentNameMap[a.id] = a.name; });

  const map: Record<string, {
    orderCount: number; totalSpent: number; lastOrderAt: string;
    networkCounts: Record<string, number>; agentIds: Set<string>;
  }> = {};

  success.forEach(o => {
    if (!map[o.phone]) {
      map[o.phone] = { orderCount: 0, totalSpent: 0, lastOrderAt: o.created_at, networkCounts: {}, agentIds: new Set() };
    }
    const c = map[o.phone];
    c.orderCount++;
    c.totalSpent += o.admin_price || 0;
    if (new Date(o.created_at) > new Date(c.lastOrderAt)) c.lastOrderAt = o.created_at;
    c.networkCounts[o.network] = (c.networkCounts[o.network] || 0) + 1;
    if (o.agent_id) c.agentIds.add(o.agent_id);
  });

  const now = Date.now();
  return Object.entries(map).map(([phone, c]) => {
    const favoriteNetwork = Object.entries(c.networkCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return {
      phone,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      lastOrderAt: c.lastOrderAt,
      favoriteNetwork,
      daysSinceLast: Math.floor((now - new Date(c.lastOrderAt).getTime()) / 86400000),
      agentNames: Array.from(c.agentIds).map(id => agentNameMap[id]).filter(Boolean),
      isAgentSourced: c.agentIds.size > 0,
    };
  });
}

type SortMode = 'spend' | 'frequency' | 'dormant';

export function AdminCustomerInsights({ orders, agents }: AdminCustomerInsightsProps) {
  const [sortMode, setSortMode] = useState<SortMode>('spend');
  const [search, setSearch] = useState('');

  const stats = useMemo(() => buildCustomerStats(orders, agents), [orders, agents]);

  const repeatCustomers = useMemo(() => stats.filter(c => c.orderCount >= 2), [stats]);
  const totalUniqueCustomers = stats.length;
  const repeatRate = totalUniqueCustomers > 0 ? (repeatCustomers.length / totalUniqueCustomers) * 100 : 0;
  const totalCustomerRevenue = stats.reduce((s, c) => s + c.totalSpent, 0);
  const avgSpendPerCustomer = totalUniqueCustomers > 0 ? totalCustomerRevenue / totalUniqueCustomers : 0;

  const sorted = useMemo(() => {
    let list = [...stats];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.phone.includes(q) || c.agentNames.some(n => n.toLowerCase().includes(q)));
    }
    if (sortMode === 'spend') return list.sort((a, b) => b.totalSpent - a.totalSpent);
    if (sortMode === 'frequency') return list.sort((a, b) => b.orderCount - a.orderCount);
    return list
      .filter(c => c.orderCount >= 2 && c.daysSinceLast >= 14)
      .sort((a, b) => b.daysSinceLast - a.daysSinceLast);
  }, [stats, sortMode, search]);

  const visible = sorted.slice(0, 10);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">👥 Customer Insights</div>
        <div className="tab-nav" style={{ marginBottom: 0 }}>
          {([
            { id: 'spend', label: 'Top Spenders' },
            { id: 'frequency', label: 'Most Frequent' },
            { id: 'dormant', label: 'Win Back' },
          ] as const).map(m => (
            <button key={m.id} className={`tab-btn${sortMode === m.id ? ' active' : ''}`} onClick={() => setSortMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, padding: '16px 24px 0' }}>
        {[
          { label: 'Unique Customers', val: String(totalUniqueCustomers), color: 'var(--accent2)' },
          { label: 'Repeat Customers', val: String(repeatCustomers.length), color: 'var(--ok)' },
          { label: 'Repeat Rate', val: `${repeatRate.toFixed(0)}%`, color: repeatRate >= 30 ? 'var(--ok)' : 'var(--warn)' },
          { label: 'Avg Spend / Customer', val: fmt(avgSpendPerCustomer), color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '14px 24px 0' }}>
        <input
          className="form-input"
          placeholder="🔍 Search by phone number or agent name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        {visible.length === 0 ? (
          <div className="empty" style={{ padding: '32px 20px' }}>
            <div className="empty-icon">{sortMode === 'dormant' ? '👋' : '👥'}</div>
            <div className="empty-title">
              {sortMode === 'dormant' ? 'No customers to win back' : 'No customer data found'}
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Total Spent</th>
                <th>Network</th>
                <th>Source</th>
                <th>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => (
                <tr key={c.phone}>
                  <td style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, color: i < 3 ? '#f59e0b' : 'var(--text3)' }}>{i + 1}</td>
                  <td className="mono">{c.phone}</td>
                  <td>{c.orderCount}</td>
                  <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(c.totalSpent)}</td>
                  <td>{NET_NAMES[c.favoriteNetwork] || c.favoriteNetwork}</td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {c.isAgentSourced ? (c.agentNames[0] || 'Agent') + (c.agentNames.length > 1 ? ` +${c.agentNames.length - 1}` : '') : 'Main Store'}
                  </td>
                  <td style={{ fontSize: 12, color: sortMode === 'dormant' ? 'var(--warn)' : 'var(--text3)' }}>
                    {sortMode === 'dormant' ? `${c.daysSinceLast}d ago` : fmtDate(c.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
