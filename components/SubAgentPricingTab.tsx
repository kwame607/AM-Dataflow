// components/SubAgentPricingTab.tsx
// Shown in the agent dashboard when admin has enabled sub-agent pricing for this agent.
// Lets the agent set floor prices their sub-agents must sell at minimum.
'use client';

import { useState, useEffect } from 'react';
import { BUNDLES, NET_NAMES, getDefaultAdminPrice } from '@/lib/bundles';

interface Props {
  agentId:   string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn', duration?: number) => void;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;

export function SubAgentPricingTab({ agentId, authFetch, toast }: Props) {
  const [floors, setFloors]       = useState<Record<string, string>>({});
  const [adminMap, setAdminMap]   = useState<Record<string, number>>({});
  const [canSet, setCanSet]       = useState<boolean | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [bulkPct, setBulkPct]     = useState('');

  useEffect(() => {
    authFetch(`/api/agents/subagent-prices?agentId=${agentId}`)
      .then(r => r.json())
      .then(d => {
        if (d.canSet === false) { setCanSet(false); return; }
        setCanSet(true);
        setAdminMap(d.adminMap || {});

        // Init floors from saved values or admin defaults
        const init: Record<string, string> = {};
        const savedMap: Record<string, number> = {};
        (d.floors || []).forEach((f: { bundle_key: string; agent_floor: number }) => {
          savedMap[f.bundle_key] = f.agent_floor;
        });

        Object.keys(BUNDLES).forEach(net => {
          BUNDLES[net].forEach(b => {
            const adminFloor = d.adminMap?.[b.key] ?? getDefaultAdminPrice(b.cost);
            init[b.key] = String(savedMap[b.key] ?? adminFloor);
          });
        });
        setFloors(init);
      })
      .catch(() => setCanSet(false))
      .finally(() => setLoading(false));
  }, [agentId, authFetch]);

  function applyBulkPct() {
    const pct = parseFloat(bulkPct);
    if (isNaN(pct)) return;
    const next = { ...floors };
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => {
        const adminFloor = adminMap[b.key] ?? getDefaultAdminPrice(b.cost);
        next[b.key] = (adminFloor * (1 + pct / 100)).toFixed(2);
      });
    });
    setFloors(next);
  }

  async function save() {
    setSaving(true);
    try {
      const prices = Object.keys(BUNDLES).flatMap(net =>
        BUNDLES[net].map(b => ({
          bundleKey:  b.key,
          network:    net,
          size:       b.size,
          volume:     b.volume,
          hubnetCost: b.cost,
          agentFloor: parseFloat(floors[b.key] || '0') || (adminMap[b.key] ?? getDefaultAdminPrice(b.cost)),
          validity:   b.validity,
        }))
      );

      const r = await authFetch('/api/agents/subagent-prices', {
        method: 'POST',
        body:   JSON.stringify({ agentId, prices }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to save', 'error'); return; }
      toast('Sub-agent floors saved!', 'success');
    } catch { toast('Network error', 'error'); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <span className="spinner" style={{ margin: '0 auto' }} />
    </div>
  );

  if (canSet === false) return (
    <div className="empty">
      <div className="empty-icon">🔒</div>
      <div className="empty-title">Sub-Agent Pricing Not Enabled</div>
      <div className="empty-text">Contact your admin to enable this feature for your account.</div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">Sub-Agent Floor Prices</div>
        <div className="page-subtitle">Set the minimum prices your sub-agents can sell at. They cannot go below these floors.</div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <span>ℹ️</span>
        <span>These floors replace the admin minimum for your sub-agents. They must be at or above the admin floor — any value you set below admin floor is automatically raised to match it.</span>
      </div>

      {/* Bulk markup */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Bulk Markup</div></div>
        <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" style={{ width: 80 }} type="number" placeholder="%" value={bulkPct} onChange={e => setBulkPct(e.target.value)} />
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>% above admin floor</span>
          <button className="btn btn-secondary btn-sm" onClick={applyBulkPct}>Apply to All</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving…</> : '💾 Save Floors'}
          </button>
        </div>
      </div>

      {/* Per-network price grids */}
      {(['mtn', 'at', 'telecel'] as const).map(net => (
        <div key={net} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={`net-badge ${net}`}>{NET_NAMES[net][0]}</div>
              <div className="card-title">{NET_NAMES[net]}</div>
            </div>
          </div>
          <div className="card-body">
            <div className="price-grid">
              {BUNDLES[net].map(b => {
                const adminFloor  = adminMap[b.key] ?? getDefaultAdminPrice(b.cost);
                const val         = parseFloat(floors[b.key] || '0');
                const belowFloor  = val < adminFloor;
                const margin      = isNaN(val) ? 0 : val - adminFloor;
                return (
                  <div key={b.key} className="price-card">
                    <div>
                      <div className="price-size">{b.size}</div>
                      <div className="price-meta">Admin floor: {fmt(adminFloor)}</div>
                      {belowFloor
                        ? <div className="floor-warn">Will be raised to admin floor</div>
                        : <div className="profit-tag">+{fmt(margin)} above admin</div>}
                    </div>
                    <div className="price-input-wrap">
                      <span className="price-prefix">₵</span>
                      <input
                        className={`price-field${belowFloor ? ' error' : ''}`}
                        type="number" step="0.50"
                        value={floors[b.key] || ''}
                        onChange={e => setFloors(prev => ({ ...prev, [b.key]: e.target.value }))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
