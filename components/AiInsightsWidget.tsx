// components/AiInsightsWidget.tsx
// Rule-based "insights engine" surfacing actionable observations from the agent's
// own order/pricing/wallet data — same deterministic approach as the admin FinanceTab's
// intelligentAlerts, scoped down to what's relevant for a single agent.
// No external AI API calls — fully derived client-side, instant, free.
'use client';

import React, { useMemo } from 'react';
import type { Order, Withdrawal } from '@/types';
import type { Wallet } from '@/types/wallet';
import { fmt } from '@/lib/utils';
import { BUNDLES, NET_NAMES, getDefaultAdminPrice } from '@/lib/bundles';

interface AiInsightsWidgetProps {
  orders: Order[];
  withdrawals: Withdrawal[];
  wallet: Wallet | null;
  agentPrices: Record<string, number>;
  adminPrices: Record<string, number>;
}

interface Insight {
  id: string;
  level: 'tip' | 'warn' | 'good';
  icon: string;
  title: string;
  detail: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildInsights(
  orders: Order[],
  withdrawals: Withdrawal[],
  wallet: Wallet | null,
  agentPrices: Record<string, number>,
  adminPrices: Record<string, number>
): Insight[] {
  const list: Insight[] = [];
  const success = orders.filter(o => o.status === 'success');

  if (success.length === 0) {
    list.push({
      id: 'no-sales',
      level: 'tip',
      icon: '🚀',
      title: 'Make your first sale',
      detail: 'Share your store link or use Quick Buy to place your first order and start earning.',
    });
    return list;
  }

  // ── Best-selling bundle ──────────────────────────────────────
  const bundleCounts: Record<string, number> = {};
  success.forEach(o => { bundleCounts[o.size + ' ' + o.network] = (bundleCounts[o.size + ' ' + o.network] || 0) + 1; });
  const topBundle = Object.entries(bundleCounts).sort((a, b) => b[1] - a[1])[0];
  if (topBundle && topBundle[1] >= 3) {
    list.push({
      id: 'top-bundle',
      level: 'good',
      icon: '⭐',
      title: `${topBundle[0]} is your best seller`,
      detail: `${topBundle[1]} orders so far. Consider promoting it more on WhatsApp or your store link.`,
    });
  }

  // ── Busiest day of week ──────────────────────────────────────
  if (success.length >= 7) {
    const dayCounts = new Array(7).fill(0);
    success.forEach(o => { dayCounts[new Date(o.created_at).getDay()]++; });
    const maxDay = dayCounts.indexOf(Math.max(...dayCounts));
    if (dayCounts[maxDay] >= 2) {
      list.push({
        id: 'busy-day',
        level: 'tip',
        icon: '📅',
        title: `${DAY_NAMES[maxDay]}s are your busiest`,
        detail: 'Consider posting reminders to your customers on this day each week.',
      });
    }
  }

  // ── Recent momentum: last 7 days vs prior 7 days ─────────────
  const now = Date.now();
  const last7 = success.filter(o => now - new Date(o.created_at).getTime() <= 7 * 86400000);
  const prior7 = success.filter(o => {
    const age = now - new Date(o.created_at).getTime();
    return age > 7 * 86400000 && age <= 14 * 86400000;
  });
  if (prior7.length > 0) {
    const change = ((last7.length - prior7.length) / prior7.length) * 100;
    if (change <= -30) {
      list.push({
        id: 'momentum-down',
        level: 'warn',
        icon: '📉',
        title: 'Sales have slowed down',
        detail: `${last7.length} orders this week vs ${prior7.length} last week. Try reaching out to past customers.`,
      });
    } else if (change >= 30) {
      list.push({
        id: 'momentum-up',
        level: 'good',
        icon: '📈',
        title: "You're on a roll",
        detail: `${last7.length} orders this week, up from ${prior7.length} last week. Keep it up!`,
      });
    }
  }

  // ── Pricing too close to / below floor ───────────────────────
  let thinMarginCount = 0;
  Object.keys(BUNDLES).forEach(net => {
    BUNDLES[net].forEach(b => {
      const floor = adminPrices[b.key] ?? getDefaultAdminPrice(b.cost);
      const mine = agentPrices[b.key];
      if (mine !== undefined && mine <= floor + 0.5) thinMarginCount++;
    });
  });
  if (thinMarginCount >= 3) {
    list.push({
      id: 'thin-margins',
      level: 'warn',
      icon: '💸',
      title: `${thinMarginCount} bundles priced near the floor`,
      detail: "You're earning very little profit on these. Check My Prices to adjust your margins.",
    });
  }

  // ── Wallet balance low relative to recent spend ──────────────
  if (wallet) {
    const avgOrderValue = success.length > 0
      ? success.reduce((s, o) => s + (o.agent_price || 0), 0) / success.length
      : 0;
    if (avgOrderValue > 0 && wallet.balance < avgOrderValue) {
      list.push({
        id: 'low-wallet',
        level: 'warn',
        icon: '⚠️',
        title: 'Wallet balance is low',
        detail: `${fmt(wallet.balance)} left — that's below your average order value of ${fmt(avgOrderValue)}. Fund your wallet to avoid missing a sale.`,
      });
    }
  }

  // ── Delivery failures needing attention ───────────────────────
  const failedDeliveries = orders.filter(o => o.status === 'success' && o.delivery_status === 'failed');
  if (failedDeliveries.length > 0) {
    list.push({
      id: 'failed-deliveries',
      level: 'warn',
      icon: '🔧',
      title: `${failedDeliveries.length} order${failedDeliveries.length !== 1 ? 's' : ''} need attention`,
      detail: 'These were paid for but delivery failed. Reach out to support if they remain stuck.',
    });
  }

  // ── Withdrawal cadence ─────────────────────────────────────────
  const paidOut = withdrawals.filter(w => w.status === 'paid');
  if (success.length >= 10 && paidOut.length === 0) {
    list.push({
      id: 'never-withdrawn',
      level: 'tip',
      icon: '💰',
      title: "You haven't withdrawn any earnings yet",
      detail: 'Head to the Earnings tab to cash out your available balance to MoMo.',
    });
  }

  // Fallback if nothing notable triggered
  if (list.length === 0) {
    list.push({
      id: 'steady',
      level: 'good',
      icon: '✅',
      title: 'Everything looks steady',
      detail: 'No urgent issues detected. Keep selling and check back for new insights.',
    });
  }

  return list;
}

const LEVEL_STYLES: Record<Insight['level'], { bg: string; border: string; color: string }> = {
  tip:  { bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.25)',  color: '#38bdf8' },
  warn: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  color: '#f59e0b' },
  good: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  color: '#10b981' },
};

export function AiInsightsWidget({ orders, withdrawals, wallet, agentPrices, adminPrices }: AiInsightsWidgetProps) {
  const insights = useMemo(
    () => buildInsights(orders, withdrawals, wallet, agentPrices, adminPrices),
    [orders, withdrawals, wallet, agentPrices, adminPrices]
  );

  return (
    <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
      <div className="card-header">
        <div className="card-title">✨ Insights</div>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Based on your activity</span>
      </div>
      <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {insights.map(ins => {
          const s = LEVEL_STYLES[ins.level];
          return (
            <div key={ins.id} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              borderRadius: 'var(--radius-sm)', background: s.bg, border: `1px solid ${s.border}`,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{ins.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{ins.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{ins.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
