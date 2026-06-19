// components/ActivityAndAchievements.tsx
// Recent Activity timeline + Achievements/gamification card for the agent dashboard Overview tab.
// Pure client-side — built from data already loaded in dashboard state (orders, withdrawals).
// No new API routes or DB tables required.
'use client';

import React, { useMemo, useState } from 'react';
import type { Order, Withdrawal } from '@/types';
import { fmt, fmtDate } from '@/lib/utils';
import { NET_NAMES } from '@/lib/bundles';

interface ActivityAndAchievementsProps {
  orders: Order[];
  withdrawals: Withdrawal[];
}

// ── Achievement tiers ──────────────────────────────────────────
interface Tier {
  key: string;
  label: string;
  threshold: number;
  icon: string;
  color: string;
  bg: string;
  border: string;
}

const TIERS: Tier[] = [
  { key: 'bronze', label: 'Bronze',  threshold: 100,  icon: '🥉', color: '#b87333', bg: 'rgba(184,115,51,0.12)',  border: 'rgba(184,115,51,0.3)'  },
  { key: 'silver', label: 'Silver',  threshold: 500,  icon: '🥈', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
  { key: 'gold',   label: 'Gold',    threshold: 1000, icon: '🥇', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'  },
  { key: 'elite',  label: 'Elite',   threshold: 5000, icon: '💎', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)'  },
];

// ── Activity event shape ───────────────────────────────────────
type ActivityEvent = {
  id: string;
  ts: string;
  kind: 'order_placed' | 'order_delivered' | 'order_failed' | 'withdrawal_requested' | 'withdrawal_paid';
  title: string;
  detail: string;
  icon: string;
  color: string;
};

function buildActivityFeed(orders: Order[], withdrawals: Withdrawal[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  orders.forEach(o => {
    events.push({
      id: `order-${o.id}`,
      ts: o.created_at,
      kind: 'order_placed',
      title: `${o.size} ${NET_NAMES[o.network] || o.network} ordered`,
      detail: `${o.phone} · ${fmt(o.agent_price || o.admin_price || 0)}`,
      icon: '🛒',
      color: 'var(--accent2)',
    });

    if (o.delivery_status === 'delivered' && o.delivered_at) {
      events.push({
        id: `delivered-${o.id}`,
        ts: o.delivered_at,
        kind: 'order_delivered',
        title: `${o.size} ${NET_NAMES[o.network] || o.network} delivered`,
        detail: o.phone,
        icon: '✅',
        color: 'var(--ok)',
      });
    } else if (o.delivery_status === 'failed') {
      events.push({
        id: `failed-${o.id}`,
        ts: o.updated_at || o.created_at,
        kind: 'order_failed',
        title: `Delivery issue — ${o.reference}`,
        detail: `${o.phone} · needs attention`,
        icon: '⚠️',
        color: 'var(--warn)',
      });
    }
  });

  withdrawals.forEach(w => {
    events.push({
      id: `wd-${w.id}`,
      ts: w.requested_at,
      kind: 'withdrawal_requested',
      title: `Withdrawal requested`,
      detail: `${fmt(w.amount)} to ${w.momo_number}`,
      icon: '💸',
      color: 'var(--text2)',
    });
    if (w.status === 'paid' && w.resolved_at) {
      events.push({
        id: `wd-paid-${w.id}`,
        ts: w.resolved_at,
        kind: 'withdrawal_paid',
        title: `Withdrawal paid out`,
        detail: `${fmt(w.amount)} sent to ${w.momo_number}`,
        icon: '💰',
        color: 'var(--ok)',
      });
    }
  });

  return events
    .filter(e => !!e.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

export function ActivityAndAchievements({ orders, withdrawals }: ActivityAndAchievementsProps) {
  const [showAll, setShowAll] = useState(false);

  const successCount = useMemo(
    () => orders.filter(o => o.status === 'success').length,
    [orders]
  );

  const { currentTier, nextTier, progressPct, ordersToNext } = useMemo(() => {
    let current: Tier | null = null;
    let next: Tier | null = null;
    for (let i = 0; i < TIERS.length; i++) {
      if (successCount >= TIERS[i].threshold) {
        current = TIERS[i];
      } else {
        next = TIERS[i];
        break;
      }
    }
    const floor = current ? current.threshold : 0;
    const ceiling = next ? next.threshold : current ? current.threshold : TIERS[0].threshold;
    const pct = next
      ? Math.min(100, Math.max(0, ((successCount - floor) / (ceiling - floor)) * 100))
      : 100;
    return {
      currentTier: current,
      nextTier: next,
      progressPct: pct,
      ordersToNext: next ? Math.max(0, next.threshold - successCount) : 0,
    };
  }, [successCount]);

  const feed = useMemo(() => buildActivityFeed(orders, withdrawals), [orders, withdrawals]);
  const visibleFeed = showAll ? feed.slice(0, 50) : feed.slice(0, 6);

  return (
    <div className="activity-achievements-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(260px, 340px)', gap: 14, marginTop: 24, marginBottom: 24 }}>
      <style>{`
        @media (max-width: 768px) {
          .activity-achievements-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Recent Activity ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🕒 Recent Activity</div>
          {feed.length > 6 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show Less' : `Show All (${feed.length})`}
            </button>
          )}
        </div>
        <div style={{ padding: feed.length === 0 ? 0 : '4px 0' }}>
          {feed.length === 0 ? (
            <div className="empty" style={{ padding: '40px 20px' }}>
              <div className="empty-icon">🕒</div>
              <div className="empty-title">No activity yet</div>
              <div className="empty-text">Your orders and withdrawals will show up here</div>
            </div>
          ) : (
            <div style={{ position: 'relative', padding: '14px 18px' }}>
              {/* timeline rail */}
              <div style={{ position: 'absolute', left: 33, top: 14, bottom: 14, width: 2, background: 'var(--border)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {visibleFeed.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, zIndex: 1,
                    }}>
                      {ev.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ev.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{timeAgo(ev.ts)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: ev.color, marginTop: 2 }}>{ev.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Achievements ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🏆 Achievements</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Current tier spotlight */}
          <div style={{
            textAlign: 'center', padding: '18px 12px', borderRadius: 'var(--radius)',
            background: currentTier ? currentTier.bg : 'var(--surface2)',
            border: `1px solid ${currentTier ? currentTier.border : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>{currentTier ? currentTier.icon : '🌱'}</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 800, color: currentTier ? currentTier.color : 'var(--text2)' }}>
              {currentTier ? `${currentTier.label} Seller` : 'Just Getting Started'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              {successCount} successful order{successCount !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Progress to next tier */}
          {nextTier && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                <span>Progress to {nextTier.label}</span>
                <span>{ordersToNext} order{ordersToNext !== 1 ? 's' : ''} to go</span>
              </div>
              <div style={{ height: 8, background: 'var(--surface3)', borderRadius: 100, overflow: 'hidden' }}>
                <div style={{
                  width: `${progressPct}%`, height: '100%', borderRadius: 100,
                  background: `linear-gradient(90deg, ${currentTier?.color || 'var(--accent)'}, ${nextTier.color})`,
                  transition: 'width .5s ease',
                }} />
              </div>
            </div>
          )}

          {/* Badge row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {TIERS.map(t => {
              const unlocked = successCount >= t.threshold;
              return (
                <div key={t.key} title={`${t.label} — ${t.threshold} orders`} style={{
                  textAlign: 'center', padding: '10px 4px', borderRadius: 10,
                  background: unlocked ? t.bg : 'var(--surface2)',
                  border: `1px solid ${unlocked ? t.border : 'var(--border)'}`,
                  opacity: unlocked ? 1 : 0.45,
                  transition: 'opacity .3s',
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{t.icon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: unlocked ? t.color : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>{t.threshold}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
