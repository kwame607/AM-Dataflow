// components/RevenueChart.tsx
// 7-day revenue bar chart for the agent dashboard. Mirrors the pattern used in the
// admin FinanceTab's `last7` memo, scoped down to a single agent's own order history.
// Pure client-side derivation from the orders array already loaded in dashboard state.
'use client';

import React, { useMemo } from 'react';
import type { Order } from '@/types';
import { fmt } from '@/lib/utils';

interface RevenueChartProps {
  orders: Order[];
  /** Which dollar field to chart — agent's own earnings (profit) or full sale price. Defaults to profit. */
  metric?: 'profit' | 'revenue';
  title?: string;
}

export function RevenueChart({ orders, metric = 'profit', title = '7-Day Earnings' }: RevenueChartProps) {
  const now = useMemo(() => new Date(), []); // eslint-disable-line
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const dayOrders = orders.filter(o => o.status === 'success' && o.created_at?.slice(0, 10) === ds);
      const value = dayOrders.reduce((s, o) => {
        if (metric === 'profit') return s + (o.agent_profit || 0);
        return s + (o.agent_price || o.admin_price || 0);
      }, 0);
      return {
        label: d.toLocaleDateString('en-GH', { weekday: 'short' }),
        ds,
        value,
        count: dayOrders.length,
      };
    });
  }, [orders, now, metric]); // eslint-disable-line

  const todayVal = last7.find(d => d.ds === todayStr)?.value || 0;
  const yesterdayVal = last7.find(d => d.ds === yesterdayStr)?.value || 0;
  const change = yesterdayVal > 0 ? ((todayVal - yesterdayVal) / yesterdayVal) * 100 : null;

  const maxVal = Math.max(...last7.map(d => d.value), 1);
  const bestDay = last7.reduce((best, d) => (d.value > best.value ? d : best), last7[0]);
  const weekTotal = last7.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
      <div className="card-header">
        <div className="card-title">📊 {title}</div>
        {change !== null && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 100,
            background: change >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
            color: change >= 0 ? '#10b981' : '#f43f5e',
          }}>
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% vs yesterday
          </span>
        )}
      </div>

      <div className="card-body">
        <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>This Week</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{fmt(weekTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Today</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{fmt(todayVal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Best Day</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{bestDay.label}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 110 }}>
          {last7.map((d, i) => {
            const isToday = d.ds === todayStr;
            const isYesterday = d.ds === yesterdayStr;
            const isBest = d.ds === bestDay.ds && d.value > 0;
            const barColor = isToday ? 'var(--accent)' : isYesterday ? '#7dd3fc' : 'rgba(100,116,139,0.5)';
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: isToday ? 'var(--accent)' : 'var(--text3)', fontWeight: isToday ? 700 : 500, whiteSpace: 'nowrap' }}>
                  {d.value > 0 ? fmt(d.value).replace('₵', '') : ''}
                </div>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 64, justifyContent: 'center' }}>
                  <div
                    title={`${d.label}: ${fmt(d.value)} · ${d.count} order${d.count !== 1 ? 's' : ''}`}
                    style={{
                      width: '70%',
                      height: `${Math.max(4, (d.value / maxVal) * 100)}%`,
                      background: barColor,
                      borderRadius: '4px 4px 0 0',
                      boxShadow: isBest ? `0 0 0 1px ${barColor}` : 'none',
                      transition: 'height .5s ease',
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: isToday ? 'var(--accent)' : 'var(--text3)', fontWeight: isToday ? 700 : 500 }}>{d.label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { c: 'var(--accent)', l: 'Today' },
            { c: '#7dd3fc', l: 'Yesterday' },
            { c: 'rgba(100,116,139,0.5)', l: 'Earlier' },
          ].map(x => (
            <span key={x.l} style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: x.c, display: 'inline-block' }} />{x.l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
