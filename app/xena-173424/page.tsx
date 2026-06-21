// components/CustomerInsights.tsx
// Surfaces top and frequent customers (by recipient phone number) from order history.
// Pure client-side derivation from the orders array already loaded in dashboard state —
// no new API routes or DB tables required.
'use client';

import React, { useMemo, useState } from 'react';
import type { Order } from '@/types';
import { fmt, fmtDate } from '@/lib/utils';
import { NET_NAMES } from '@/lib/bundles';

interface CustomerInsightsProps {
  orders: Order[];
}

interface CustomerStat {
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  favoriteNetwork: string;
  daysSinceLast: number;
}

function buildCustomerStats(orders: Order[]): CustomerStat[] {
  const success = orders.filter(o => o.status === 'success' && o.phone);
  const map: Record<string, {
    orderCount: number; totalSpent: number; lastOrderAt: string;
    networkCounts: Record<string, number>;
  }> = {};

  success.forEach(o => {
    if (!map[o.phone]) {
      map[o.phone] = { orderCount: 0, totalSpent: 0, lastOrderAt: o.created_at, networkCounts: {} };
    }
    const c = map[o.phone];
    c.orderCount++;
    c.totalSpent += o.agent_price || o.admin_price || 0;
    if (new Date(o.created_at) > new Date(c.lastOrderAt)) c.lastOrderAt = o.created_at;
    c.networkCounts[o.network] = (c.networkCounts[o.network] || 0) + 1;
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
    };
  });
}

type SortMode = 'spend' | 'frequency' | 'dormant';

export function CustomerInsights({ orders }: CustomerInsightsProps) {
  const [sortMode, setSortMode] = useState<SortMode>('spend');

  const stats = useMemo(() => buildCustomerStats(orders), [orders]);

  const repeatCustomers = useMemo(() => stats.filter(c => c.orderCount >= 2), [stats]);
  const totalUniqueCustomers = stats.length;
  const repeatRate = totalUniqueCustomers > 0
    ? (repeatCustomers.length / totalUniqueCustomers) * 100
    : 0;

  const sorted = useMemo(() => {
    const list = [...stats];
    if (sortMode === 'spend') return list.sort((a, b) => b.totalSpent - a.totalSpent);
    if (sortMode === 'frequency') return list.sort((a, b) => b.orderCount - a.orderCount);
    // dormant: customers who used to order regularly (2+) but haven't in 14+ days, longest gap first
    return list
      .filter(c => c.orderCount >= 2 && c.daysSinceLast >= 14)
      .sort((a, b) => b.daysSinceLast - a.daysSinceLast);
  }, [stats, sortMode]);

  const visible = sorted.slice(0, 8);

  return (
    <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, padding: '16px 24px 0' }}>
        {[
          { label: 'Unique Customers', val: String(totalUniqueCustomers), color: 'var(--accent2)' },
          { label: 'Repeat Customers', val: String(repeatCustomers.length), color: 'var(--ok)' },
          { label: 'Repeat Rate', val: `${repeatRate.toFixed(0)}%`, color: repeatRate >= 30 ? 'var(--ok)' : 'var(--warn)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 0 4px' }}>
        {visible.length === 0 ? (
          <div className="empty" style={{ padding: '32px 20px' }}>
            <div className="empty-icon">{sortMode === 'dormant' ? '👋' : '👥'}</div>
            <div className="empty-title">
              {sortMode === 'dormant' ? 'No customers to win back yet' : 'No customer data yet'}
            </div>
            <div className="empty-text">
              {sortMode === 'dormant'
                ? "Repeat customers who haven't ordered in 14+ days will show up here"
                : 'Make some sales to see your top customers'}
            </div>
          </div>
        ) : (
          visible.map((c, i) => (
            <div key={c.phone} style={{
              padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 12,
                color: i < 3 ? '#f59e0b' : 'var(--text3)',
                background: i < 3 ? 'rgba(245,158,11,0.12)' : 'var(--surface2)',
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
                  {c.phone}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {c.orderCount} order{c.orderCount !== 1 ? 's' : ''} · {NET_NAMES[c.favoriteNetwork] || c.favoriteNetwork} · last {fmtDate(c.lastOrderAt)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{fmt(c.totalSpent)}</div>
                {sortMode === 'dormant' && (
                  <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>{c.daysSinceLast}d ago</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
