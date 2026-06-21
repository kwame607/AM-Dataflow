// components/AdminAiInsights.tsx
// Rule-based insights engine for the admin dashboard — surfaces platform-wide signals
// derived from orders, agents, withdrawals, and wallet balance already loaded in admin
// dashboard state. Same deterministic approach as the agent-side AiInsightsWidget,
// scoped up to platform-level concerns: agent health, delivery failures, wallet risk,
// pricing anomalies, and revenue momentum.
'use client';

import React, { useMemo } from 'react';
import type { Order, Agent, Withdrawal } from '@/types';
import { fmt } from '@/lib/utils';
import { BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';

interface AdminAiInsightsProps {
  orders: Order[];
  agents: Agent[];
  withdrawals: Withdrawal[];
  hubBalance: number | null;
  adminPrices: Record<string, number>;
}

interface Insight {
  id: string;
  level: 'tip' | 'warn' | 'error' | 'good';
  icon: string;
  title: string;
  detail: string;
}

function buildInsights(
  orders: Order[],
  agents: Agent[],
  withdrawals: Withdrawal[],
  hubBalance: number | null,
  adminPrices: Record<string, number>
): Insight[] {
  const list: Insight[] = [];
  const success = orders.filter(o => o.status === 'success');
  const now = Date.now();

  if (orders.length === 0) {
    list.push({
      id: 'no-orders',
      level: 'tip',
      icon: '🚀',
      title: 'No orders yet on the platform',
      detail: 'Once agents start selling, performance insights will appear here.',
    });
    return list;
  }

  // ── Revenue momentum: last 7 days vs prior 7 days ────────────
  const last7 = success.filter(o => now - new Date(o.created_at).getTime() <= 7 * 86400000);
  const prior7 = success.filter(o => {
    const age = now - new Date(o.created_at).getTime();
    return age > 7 * 86400000 && age <= 14 * 86400000;
  });
  const last7Rev = last7.reduce((s, o) => s + (o.admin_price || 0), 0);
  const prior7Rev = prior7.reduce((s, o) => s + (o.admin_price || 0), 0);
  if (prior7Rev > 0) {
    const change = ((last7Rev - prior7Rev) / prior7Rev) * 100;
    if (change <= -25) {
      list.push({
        id: 'revenue-down',
        level: 'warn',
        icon: '📉',
        title: 'Platform revenue has slowed',
        detail: `${fmt(last7Rev)} this week vs ${fmt(prior7Rev)} last week (${change.toFixed(0)}%). Check agent activity and wallet balance.`,
      });
    } else if (change >= 25) {
      list.push({
        id: 'revenue-up',
        level: 'good',
        icon: '📈',
        title: 'Platform revenue is climbing',
        detail: `${fmt(last7Rev)} this week vs ${fmt(prior7Rev)} last week, up ${change.toFixed(0)}%.`,
      });
    }
  }

  // ── Delivery failure rate ─────────────────────────────────────
  const failed = orders.filter(o => o.delivery_status === 'failed');
  const failRate = orders.length > 0 ? (failed.length / orders.length) * 100 : 0;
  if (failRate > 15) {
    list.push({
      id: 'high-fail-rate',
      level: 'error',
      icon: '🚨',
      title: `Delivery failure rate is ${failRate.toFixed(1)}%`,
      detail: `${failed.length} of ${orders.length} orders failed to deliver. Investigate provider connectivity or wallet balance.`,
    });
  } else if (failRate > 7) {
    list.push({
      id: 'elevated-fail-rate',
      level: 'warn',
      icon: '⚠️',
      title: `Delivery failure rate elevated at ${failRate.toFixed(1)}%`,
      detail: `${failed.length} orders failed. Monitor closely — may indicate a network or provider issue.`,
    });
  }

  // ── Provider wallet balance ───────────────────────────────────
  if (hubBalance !== null) {
    if (hubBalance < 50) {
      list.push({
        id: 'wallet-critical',
        level: 'error',
        icon: '💸',
        title: 'Provider wallet critically low',
        detail: `Only ${fmt(hubBalance)} left in XpresPortal. New orders will start failing — top up immediately.`,
      });
    } else if (hubBalance < 150) {
      list.push({
        id: 'wallet-low',
        level: 'warn',
        icon: '💰',
        title: 'Provider wallet running low',
        detail: `${fmt(hubBalance)} remaining. Schedule a top-up soon to avoid service interruption.`,
      });
    }
  }

  // ── Pending agent approvals ───────────────────────────────────
  const pendingAgents = agents.filter(a => a.status === 'pending').length;
  if (pendingAgents > 0) {
    list.push({
      id: 'pending-agents',
      level: 'tip',
      icon: '👥',
      title: `${pendingAgents} agent${pendingAgents !== 1 ? 's' : ''} awaiting approval`,
      detail: 'Review and approve pending agent registrations in the Agents tab.',
    });
  }

  // ── Inactive agents (registered but no recent sales) ─────────
  const activeAgents = agents.filter(a => a.status === 'active');
  const last14d = new Date(now - 14 * 86400000);
  const recentlySellingAgentIds = new Set(
    success.filter(o => o.agent_id && new Date(o.created_at) >= last14d).map(o => o.agent_id)
  );
  const goneQuiet = activeAgents.filter(a => {
    const hasEverSold = orders.some(o => o.agent_id === a.id && o.status === 'success');
    return hasEverSold && !recentlySellingAgentIds.has(a.id);
  });
  if (goneQuiet.length >= 3) {
    list.push({
      id: 'inactive-agents',
      level: 'warn',
      icon: '😴',
      title: `${goneQuiet.length} agents have gone quiet`,
      detail: "Previously active agents haven't sold anything in 14+ days. Consider a re-engagement message.",
    });
  }

  // ── Pending withdrawals backlog ───────────────────────────────
  const pendingWd = withdrawals.filter(w => w.status === 'pending');
  const pendingWdTotal = pendingWd.reduce((s, w) => s + w.amount, 0);
  if (pendingWd.length >= 5 || pendingWdTotal > 500) {
    list.push({
      id: 'withdrawal-backlog',
      level: 'warn',
      icon: '🏦',
      title: `${pendingWd.length} withdrawal request${pendingWd.length !== 1 ? 's' : ''} pending`,
      detail: `${fmt(pendingWdTotal)} awaiting approval. Process these soon to keep agents confident in the platform.`,
    });
  }

  // ── Bundle profit margin anomalies ────────────────────────────
  let lossOrThinCount = 0;
  Object.keys(BUNDLES).forEach(net => {
    BUNDLES[net].forEach(b => {
      const price = adminPrices[b.key] ?? getDefaultAdminPrice(b.cost);
      if (price <= b.cost + 0.3) lossOrThinCount++;
    });
  });
  if (lossOrThinCount > 0) {
    list.push({
      id: 'thin-bundle-margins',
      level: 'warn',
      icon: '📊',
      title: `${lossOrThinCount} bundle${lossOrThinCount !== 1 ? 's' : ''} priced at thin or negative margin`,
      detail: 'Review Base Prices — these bundles are earning little to nothing per sale.',
    });
  }

  // ── Top performing agent spotlight ────────────────────────────
  if (last7.length > 0) {
    const agentRev: Record<string, number> = {};
    last7.forEach(o => { if (o.agent_id) agentRev[o.agent_id] = (agentRev[o.agent_id] || 0) + (o.agent_price || 0); });
    const top = Object.entries(agentRev).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const agentName = agents.find(a => a.id === top[0])?.name;
      if (agentName) {
        list.push({
          id: 'top-agent',
          level: 'good',
          icon: '🏆',
          title: `${agentName} is leading this week`,
          detail: `${fmt(top[1])} in sales over the last 7 days. Check the Agents tab for full rankings.`,
        });
      }
    }
  }

  if (list.length === 0) {
    list.push({
      id: 'steady',
      level: 'good',
      icon: '✅',
      title: 'Platform health looks steady',
      detail: 'No urgent issues detected across orders, agents, or wallet balance.',
    });
  }

  return list;
}

const LEVEL_STYLES: Record<Insight['level'], { bg: string; border: string; color: string }> = {
  tip:   { bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.25)',  color: '#38bdf8' },
  warn:  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  color: '#f59e0b' },
  error: { bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.25)',   color: '#f43f5e' },
  good:  { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  color: '#10b981' },
};

export function AdminAiInsights({ orders, agents, withdrawals, hubBalance, adminPrices }: AdminAiInsightsProps) {
  const insights = useMemo(
    () => buildInsights(orders, agents, withdrawals, hubBalance, adminPrices),
    [orders, agents, withdrawals, hubBalance, adminPrices]
  );

  const errorCount = insights.filter(i => i.level === 'error').length;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">✨ Insights</div>
        {errorCount > 0 && (
          <span style={{ fontSize: 11, background: 'rgba(244,63,94,0.15)', color: '#f43f5e', padding: '4px 10px', borderRadius: 100, fontWeight: 700 }}>
            🚨 {errorCount} critical
          </span>
        )}
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
