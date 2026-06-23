// components/DeliverySpeedWidget.tsx
// Shows real delivery speed estimates based on the last 30 days of completed
// orders, broken down by network. Gives plain-language guidance that agents
// can quote directly to customers. Works on both agent and admin dashboards.
'use client';

import { useEffect, useState } from 'react';

interface SpeedStat {
  avg: number; median: number; p90: number;
  min: number; max: number; count: number;
}

interface DeliverySpeedData {
  hasData:         boolean;
  overall?:        SpeedStat;
  byNetwork?:      Record<string, SpeedStat>;
  byProvider?:     Record<string, SpeedStat>;
  ordersAnalyzed?: number;
  periodDays?:     number;
}

interface Props {
  agentId?: string; // pass for agent dashboard; omit for admin (platform-wide)
}

const NET_LABELS: Record<string, string> = {
  mtn:     'MTN',
  at:      'AirtelTigo',
  telecel: 'Telecel',
};

const NET_COLORS: Record<string, string> = {
  mtn:     '#f59e0b',
  at:      '#3b82f6',
  telecel: '#ef4444',
};

// Convert raw minutes into a human-friendly range string
function fmtRange(min: number, p90: number): string {
  const fmtMins = (m: number) => {
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  };
  if (min < 2) return `under ${fmtMins(p90)}`;
  return `${fmtMins(min)}–${fmtMins(p90)}`;
}

// Speed tier classification
function speedTier(median: number): { label: string; color: string; bg: string; emoji: string } {
  if (median <= 5)  return { label: 'Very Fast',  color: '#10b981', bg: 'rgba(16,185,129,0.12)', emoji: '⚡' };
  if (median <= 15) return { label: 'Fast',        color: '#10b981', bg: 'rgba(16,185,129,0.10)', emoji: '🚀' };
  if (median <= 30) return { label: 'Moderate',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', emoji: '🕐' };
  if (median <= 60) return { label: 'Slow',        color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', emoji: '⏳' };
  return               { label: 'Very Slow',  color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  emoji: '🐌' };
}

// Generate the "what to tell customers" script based on real data
function generateScript(overall: SpeedStat, byNetwork: Record<string, SpeedStat>): string {
  const range = fmtRange(overall.min, overall.p90);
  const fastest = Object.entries(byNetwork)
    .sort(([, a], [, b]) => a.median - b.median)[0];
  const slowest = Object.entries(byNetwork)
    .sort(([, a], [, b]) => b.median - a.median)[0];

  let script = `"Your data will be delivered within ${range}. `;

  if (overall.median <= 10) {
    script += `Most customers receive it in under ${overall.median} minutes."`;
  } else if (overall.median <= 30) {
    script += `Typically takes about ${overall.median} minutes — we'll deliver as fast as we can."`;
  } else {
    script += `Allow up to ${Math.round(overall.p90)} minutes. We'll process it as soon as possible."`;
  }

  // Add network-specific tip if there's a meaningful difference
  if (fastest && slowest && fastest[0] !== slowest[0] &&
      slowest[1].median - fastest[1].median > 10) {
    const fNet = NET_LABELS[fastest[0]] || fastest[0];
    const sNet = NET_LABELS[slowest[0]] || slowest[0];
    script += ` (${fNet} tends to be faster than ${sNet} right now.)`;
  }

  return script;
}

// Time-of-day context — general knowledge, not from order data
function getTimeContext(): string {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6)  return 'Late night — network traffic is low, deliveries may be faster than usual.';
  if (hour >= 6  && hour < 9)  return 'Early morning — expect normal delivery times.';
  if (hour >= 9  && hour < 12) return 'Morning peak — networks are busy, allow extra time.';
  if (hour >= 12 && hour < 14) return 'Lunchtime — moderate traffic, normal delivery times.';
  if (hour >= 14 && hour < 18) return 'Afternoon — networks are generally stable.';
  if (hour >= 18 && hour < 22) return 'Evening peak — this is the busiest time on mobile networks. Add a few extra minutes buffer.';
  return '';
}

export function DeliverySpeedWidget({ agentId }: Props) {
  const [data, setData]       = useState<DeliverySpeedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = agentId
      ? `/api/stats/delivery-speed?agentId=${encodeURIComponent(agentId)}`
      : '/api/stats/delivery-speed';

    fetch(url)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData({ hasData: false }))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div className="card-title">📦 Delivery Speed Estimate</div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text3)', fontSize: 13 }}>
          <span className="spinner" style={{ width: 16, height: 16 }} />
          Analysing delivery history…
        </div>
      </div>
    </div>
  );

  const timeCtx = getTimeContext();

  // No data yet — show static guidance
  if (!data?.hasData || !data.overall || !data.byNetwork) return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div className="card-title">📦 Delivery Speed Estimate</div>
      </div>
      <div className="card-body">
        <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 13 }}>
          <span>ℹ️</span>
          <span>Not enough completed deliveries yet to calculate real estimates. Using standard guidance below.</span>
        </div>

        {/* Static fallback guidance */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>What to tell customers</div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', fontSize: 13, color: 'var(--text)', lineHeight: 1.7, fontStyle: 'italic' }}>
            "Your data will be delivered within 5–60 minutes. Most customers receive it within 15 minutes."
          </div>
        </div>

        {timeCtx && (
          <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span>🕐</span><span>{timeCtx}</span>
          </div>
        )}
      </div>
    </div>
  );

  const { overall, byNetwork, ordersAnalyzed } = data;
  const tier   = speedTier(overall.median);
  const script = generateScript(overall, byNetwork);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <div className="card-title">📦 Delivery Speed Estimate</div>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            Based on {ordersAnalyzed} deliveries · last 30 days
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
          background: tier.bg, color: tier.color,
        }}>
          {tier.emoji} {tier.label}
        </span>
      </div>

      <div className="card-body">

        {/* Overall stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Typical',   val: `${overall.median} min`, sub: 'median delivery' },
            { label: 'Average',   val: `${overall.avg} min`,    sub: 'mean delivery' },
            { label: '90% done in', val: `${overall.p90} min`, sub: 'worst-case estimate' },
            { label: 'Fastest',   val: `${overall.min} min`,   sub: 'best observed' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{s.val}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* By network breakdown */}
        {Object.keys(byNetwork).length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>By Network</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(byNetwork)
                .sort(([, a], [, b]) => a.median - b.median)
                .map(([net, stat]) => {
                  const t = speedTier(stat.median);
                  const barPct = Math.min(100, (stat.median / Math.max(...Object.values(byNetwork).map(s => s.median))) * 100);
                  return (
                    <div key={net} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 72, flexShrink: 0, fontSize: 12, fontWeight: 700, color: NET_COLORS[net] || 'var(--text)' }}>
                        {NET_LABELS[net] || net}
                      </div>
                      <div style={{ flex: 1, height: 8, background: 'var(--surface3)', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ width: `${barPct}%`, height: '100%', background: NET_COLORS[net] || 'var(--accent)', borderRadius: 100, opacity: 0.8 }} />
                      </div>
                      <div style={{ width: 90, flexShrink: 0, fontSize: 12, color: 'var(--text2)', textAlign: 'right' }}>
                        ~{stat.median} min <span style={{ fontSize: 10, color: t.color }}>({t.emoji})</span>
                      </div>
                      <div style={{ width: 50, flexShrink: 0, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
                        {stat.count} orders
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* What to tell customers */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            💬 What to tell customers
          </div>
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
            fontSize: 13, color: 'var(--text)', lineHeight: 1.7,
            fontStyle: 'italic',
          }}>
            {script}
          </div>
        </div>

        {/* Time-of-day context */}
        {timeCtx && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            fontSize: 12, color: 'var(--text3)',
            background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
          }}>
            <span>🕐</span>
            <span>{timeCtx}</span>
          </div>
        )}

      </div>
    </div>
  );
}
