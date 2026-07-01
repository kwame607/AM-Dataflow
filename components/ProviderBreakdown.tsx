// components/ProviderBreakdown.tsx
// Drop into FinanceTab or admin Settings tab.
// Shows revenue, cost, profit and order count split by delivery provider.
'use client';

import type { Order } from '@/types';

const fmt = (n: number) => `₵${n.toFixed(2)}`;

const PROVIDERS: Array<{
  id:    string;
  name:  string;
  icon:  string;
  color: string;
  bg:    string;
}> = [
  { id: 'xpresportal', name: 'XpresPortal', icon: '⚡', color: '#00d4aa', bg: 'rgba(0,212,170,0.1)' },
  { id: 'hubnet',      name: 'Hubnet',       icon: '🌐', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)' },
  { id: 'myztadata',  name: 'MyZtaData',    icon: '🚀', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'unknown',    name: 'Unknown',       icon: '❓', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
];

interface Props {
  orders: Order[];
}

export function ProviderBreakdown({ orders }: Props) {
  const successOrders = orders.filter(o => o.status === 'success');

  const stats = PROVIDERS.map(p => {
    const provOrders = successOrders.filter(o => {
      const prov = (o.delivery_provider || 'unknown');
      return p.id === 'unknown'
        ? !['xpresportal', 'hubnet', 'myztadata'].includes(prov)
        : prov === p.id;
    });

    const revenue     = provOrders.reduce((s, o) => s + (o.admin_price    || 0), 0);
    const cost        = provOrders.reduce((s, o) => s + (o.hubnet_cost     || 0), 0);
    const adminProfit = provOrders.reduce((s, o) => s + (o.admin_profit    || 0), 0);
    const delivered   = provOrders.filter(o => o.delivery_status === 'delivered').length;
    const failed      = provOrders.filter(o => o.delivery_status === 'failed').length;
    const margin      = revenue > 0 ? (adminProfit / revenue) * 100 : 0;
    const avgCost     = provOrders.length > 0 ? cost / provOrders.length : 0;

    return { ...p, count: provOrders.length, revenue, cost, adminProfit, delivered, failed, margin, avgCost };
  }).filter(s => s.count > 0);

  if (stats.length === 0) {
    return null;
  }

  const totalOrders = stats.reduce((s, p) => s + p.count, 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">📡 Revenue by Delivery Provider</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{totalOrders} successful orders</div>
      </div>
      <div className="card-body">

        {/* Provider cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 20 }}>
          {stats.map(p => (
            <div key={p.id} style={{
              background: p.bg,
              border:     `1px solid ${p.color}40`,
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: p.color }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.count} orders · {p.margin.toFixed(1)}% margin</div>
                </div>
                {/* Share bar */}
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {((p.count / totalOrders) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              {[
                { label: 'Revenue',      val: fmt(p.revenue),     color: p.color },
                { label: 'Provider Cost',val: fmt(p.cost),        color: 'var(--err)' },
                { label: 'Avg Cost/Order',val: fmt(p.avgCost),    color: 'var(--text3)' },
                { label: 'Admin Profit', val: fmt(p.adminProfit), color: 'var(--ok)' },
                { label: 'Delivered',    val: String(p.delivered),color: 'var(--ok)' },
                { label: 'Failed',       val: String(p.failed),   color: p.failed > 0 ? 'var(--err)' : 'var(--text3)' },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, padding: '5px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: row.color }}>{row.val}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Orders</th>
                <th>Share</th>
                <th>Revenue</th>
                <th>Provider Cost</th>
                <th>Admin Profit</th>
                <th>Margin</th>
                <th>Avg Cost/Order</th>
                <th>Delivered</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(p => (
                <tr key={p.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{p.icon}</span>
                      <span style={{ fontWeight: 600, color: p.color }}>{p.name}</span>
                    </span>
                  </td>
                  <td>{p.count}</td>
                  <td style={{ color: 'var(--text3)' }}>{((p.count / totalOrders) * 100).toFixed(1)}%</td>
                  <td style={{ color: 'var(--accent)' }}>{fmt(p.revenue)}</td>
                  <td style={{ color: 'var(--err)' }}>{fmt(p.cost)}</td>
                  <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(p.adminProfit)}</td>
                  <td style={{ color: p.margin < 5 ? 'var(--err)' : 'var(--ok)' }}>{p.margin.toFixed(1)}%</td>
                  <td style={{ color: 'var(--text3)' }}>{fmt(p.avgCost)}</td>
                  <td style={{ color: 'var(--ok)' }}>{p.delivered}</td>
                  <td style={{ color: p.failed > 0 ? 'var(--err)' : 'var(--text3)' }}>{p.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cost comparison insight */}
        {stats.length > 1 && (() => {
          const sorted = [...stats].sort((a, b) => a.avgCost - b.avgCost);
          const cheapest = sorted[0];
          const priciest = sorted[sorted.length - 1];
          const diff = priciest.avgCost - cheapest.avgCost;
          if (diff < 0.01) return null;
          return (
            <div className="alert alert-info" style={{ marginTop: 14, fontSize: 12 }}>
              <span>💡</span>
              <span>
                <strong>{cheapest.name}</strong> is your cheapest provider at {fmt(cheapest.avgCost)} avg per order.
                {' '}<strong>{priciest.name}</strong> costs {fmt(diff)} more per order on average.
                Over {priciest.count} orders that's {fmt(diff * priciest.count)} extra cost.
              </span>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
