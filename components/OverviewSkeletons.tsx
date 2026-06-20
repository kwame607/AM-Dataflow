// components/OverviewSkeletons.tsx
// Shaped loading placeholders for the agent dashboard Overview tab.
// Uses the existing .skeleton shimmer class from globals.css — no new CSS needed.
import React from 'react';

export function StatsGridSkeleton() {
  return (
    <div className="stats-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="stat-card">
          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 10, marginBottom: 14 }} />
          <div className="skeleton" style={{ width: 80, height: 11, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: 110, height: 24, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: 90, height: 11 }} />
        </div>
      ))}
    </div>
  );
}

export function QuickBuySkeleton() {
  return (
    <div style={{ marginTop: 24, marginBottom: 24 }}>
      <div className="skeleton" style={{ width: 110, height: 16, marginBottom: 12 }} />
      <div className="card">
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ width: 80, height: 32, borderRadius: 100 }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />
            ))}
          </div>
          <div className="skeleton" style={{ height: 44, borderRadius: 10, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 44, borderRadius: 10, width: '40%' }} />
        </div>
      </div>
    </div>
  );
}

export function ActivityAchievementsSkeleton() {
  return (
    <div
      className="activity-achievements-grid"
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(260px, 340px)', gap: 14, marginTop: 24, marginBottom: 24 }}
    >
      <style>{`@media (max-width: 768px) { .activity-achievements-grid { grid-template-columns: 1fr !important; } }`}</style>

      <div className="card">
        <div className="card-header">
          <div className="skeleton" style={{ width: 130, height: 15 }} />
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '60%', height: 13, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '40%', height: 11 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="skeleton" style={{ width: 110, height: 15 }} />
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ height: 110, borderRadius: 'var(--radius)' }} />
          <div className="skeleton" style={{ height: 8, borderRadius: 100 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 58, borderRadius: 10 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiInsightsSkeleton() {
  return (
    <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
      <div className="card-header">
        <div className="skeleton" style={{ width: 90, height: 15 }} />
        <div className="skeleton" style={{ width: 120, height: 11 }} />
      </div>
      <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 58, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>
    </div>
  );
}

export function CustomerInsightsSkeleton() {
  return (
    <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
      <div className="card-header">
        <div className="skeleton" style={{ width: 150, height: 15 }} />
        <div className="skeleton" style={{ width: 200, height: 30, borderRadius: 11 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, padding: '16px 24px 0' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 50, borderRadius: 10 }} />
        ))}
      </div>
      <div style={{ padding: '16px 0 4px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
            <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: '35%', height: 13, marginBottom: 6 }} />
              <div className="skeleton" style={{ width: '55%', height: 11 }} />
            </div>
            <div className="skeleton" style={{ width: 50, height: 16 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentOrdersSkeleton() {
  return (
    <div className="card">
      <div className="card-header">
        <div className="skeleton" style={{ width: 120, height: 15 }} />
        <div className="skeleton" style={{ width: 70, height: 28, borderRadius: 8 }} />
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="skeleton" style={{ width: 52, height: 22, borderRadius: 100, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: '45%', height: 13, marginBottom: 6 }} />
              <div className="skeleton" style={{ width: '65%', height: 11 }} />
            </div>
            <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 100, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
