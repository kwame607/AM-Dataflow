// components/PriceRecommendationsWidget.tsx
// AI-powered price recommendations widget. Works for both:
//   - Admin Prices tab: pass no agentId, gets platform-wide recommendations
//   - Agent My Prices tab: pass agentId, gets agent-specific recommendations
//
// Usage:
//   <PriceRecommendationsWidget onApply={(key, price) => updatePrice(key, price)} />
//   <PriceRecommendationsWidget agentId={agent.id} onApply={(key, price) => updateAgentPrice(key, price)} />
'use client';

import { useState } from 'react';

interface Recommendation {
  bundleKey:     string;
  network:       string;
  size:          string;
  currentPrice:  number;
  suggestedPrice: number;
  change:        string;
  changePct:     string;
  reason:        string;
  priority:      'HIGH' | 'MEDIUM' | 'LOW';
}

interface RecommendationData {
  summary:         string;
  recommendations: Recommendation[];
  generalTips:     string[];
}

interface Props {
  agentId?:  string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn') => void;
  onApply?:  (bundleKey: string, suggestedPrice: number) => void;
}

const NET_COLORS: Record<string, string> = {
  mtn:     '#f59e0b',
  at:      '#3b82f6',
  telecel: '#ef4444',
};

const PRIORITY_CONFIG = {
  HIGH:   { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.3)'   },
  MEDIUM: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  LOW:    { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)' },
};

export function PriceRecommendationsWidget({ agentId, authFetch, toast, onApply }: Props) {
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<RecommendationData | null>(null);
  const [dataPoints, setDataPoints]   = useState(0);
  const [applied, setApplied]         = useState<Set<string>>(new Set());
  const [filterPriority, setFilter]   = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [expanded, setExpanded]       = useState(false);

  async function generate() {
    setLoading(true);
    setData(null);
    setApplied(new Set());
    try {
      const r = await authFetch('/api/admin/price-recommendations', {
        method: 'POST',
        body:   JSON.stringify({ agentId: agentId || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        toast(d.error || 'Failed to generate recommendations', 'error');
        return;
      }
      setData(d.recommendations);
      setDataPoints(d.dataPoints || 0);
      setExpanded(true);
    } catch {
      toast('Network error generating recommendations', 'error');
    } finally {
      setLoading(false);
    }
  }

  function applyOne(rec: Recommendation) {
    if (!onApply) return;
    onApply(rec.bundleKey, rec.suggestedPrice);
    setApplied(prev => new Set(Array.from(prev).concat(rec.bundleKey)));
    toast(`Applied ₵${rec.suggestedPrice.toFixed(2)} for ${rec.network.toUpperCase()} ${rec.size}`, 'success');
  }

  function applyAll() {
    if (!onApply || !data) return;
    const toApply = filtered.filter(r => !applied.has(r.bundleKey));
    toApply.forEach(r => onApply(r.bundleKey, r.suggestedPrice));
    setApplied(new Set(Array.from(applied).concat(toApply.map(r => r.bundleKey))));
    toast(`Applied ${toApply.length} price recommendation${toApply.length !== 1 ? 's' : ''}`, 'success');
  }

  const filtered = data
    ? (filterPriority === 'ALL'
        ? data.recommendations
        : data.recommendations.filter(r => r.priority === filterPriority))
    : [];

  const highCount   = data?.recommendations.filter(r => r.priority === 'HIGH').length   || 0;
  const mediumCount = data?.recommendations.filter(r => r.priority === 'MEDIUM').length || 0;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <div>
            <div className="card-title">🤖 AI Price Recommendations</div>
            {data && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                Based on {dataPoints} orders · last 60 days · Ghana market context
              </div>
            )}
          </div>
          {data && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {highCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: PRIORITY_CONFIG.HIGH.bg, color: PRIORITY_CONFIG.HIGH.color }}>
                  {highCount} HIGH
                </span>
              )}
              {mediumCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: PRIORITY_CONFIG.MEDIUM.bg, color: PRIORITY_CONFIG.MEDIUM.color }}>
                  {mediumCount} MEDIUM
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {data && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? '▲ Collapse' : '▼ Expand'}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={generate}
            disabled={loading}
            style={{ gap: 6 }}
          >
            {loading
              ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Analysing…</>
              : data ? '↻ Refresh' : '✨ Generate Recommendations'}
          </button>
        </div>
      </div>

      {!data && !loading && (
        <div className="card-body">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              Claude analyses your sales velocity, margins, and Ghana market rates to suggest
              optimal prices for each bundle — with one-click apply.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['📈 Identify underpriced top sellers', '✂️ Cut overpriced slow movers', '💡 Ghana market context'].map(t => (
                <span key={t} style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '3px 10px' }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '16px 0' }}>
            <span className="spinner" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Analysing your sales data…</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>Claude is reviewing your margins, sales velocity, and Ghana market rates</div>
            </div>
          </div>
        </div>
      )}

      {data && expanded && (
        <div className="card-body" style={{ paddingTop: 0 }}>

          {/* Summary */}
          <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 16, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--accent)' }}>📊 Assessment: </strong>{data.summary}
          </div>

          {/* Priority filter + Apply All */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="tab-nav" style={{ marginBottom: 0 }}>
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
                <button
                  key={p}
                  className={`tab-btn${filterPriority === p ? ' active' : ''}`}
                  onClick={() => setFilter(p)}
                  style={{ padding: '5px 12px', fontSize: 11 }}
                >
                  {p === 'ALL' ? `All (${data.recommendations.length})` : `${p} (${data.recommendations.filter(r => r.priority === p).length})`}
                </button>
              ))}
            </div>
            {onApply && filtered.some(r => !applied.has(r.bundleKey)) && (
              <button
                className="btn btn-sm"
                style={{ marginLeft: 'auto', background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }}
                onClick={applyAll}
              >
                ✓ Apply All {filterPriority !== 'ALL' ? filterPriority : ''} ({filtered.filter(r => !applied.has(r.bundleKey)).length})
              </button>
            )}
          </div>

          {/* Recommendation cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
                No {filterPriority.toLowerCase()} priority recommendations
              </div>
            ) : filtered.map(rec => {
              const isApplied  = applied.has(rec.bundleKey);
              const isIncrease = rec.suggestedPrice > rec.currentPrice;
              const prioConfig = PRIORITY_CONFIG[rec.priority];
              return (
                <div key={rec.bundleKey} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '14px 16px',
                  background: isApplied ? 'rgba(16,185,129,0.06)' : 'var(--surface2)',
                  border: `1px solid ${isApplied ? 'rgba(16,185,129,0.25)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all .2s',
                  flexWrap: 'wrap',
                }}>
                  {/* Network + size */}
                  <div style={{ flexShrink: 0, minWidth: 90 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: NET_COLORS[rec.network] || 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>
                      {rec.network}
                    </div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 800 }}>{rec.size}</div>
                  </div>

                  {/* Price change */}
                  <div style={{ flexShrink: 0, minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'line-through' }}>
                        ₵{rec.currentPrice.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 16, fontFamily: 'Syne,sans-serif', fontWeight: 800, color: isIncrease ? 'var(--ok)' : 'var(--err)' }}>
                        ₵{rec.suggestedPrice.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isIncrease ? 'var(--ok)' : 'var(--err)', marginTop: 2 }}>
                      {isIncrease ? '▲' : '▼'} {rec.change} ({rec.changePct})
                    </div>
                  </div>

                  {/* Reason + priority */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: prioConfig.bg, color: prioConfig.color, border: `1px solid ${prioConfig.border}`, marginBottom: 5, display: 'inline-block' }}>
                      {rec.priority}
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{rec.reason}</div>
                  </div>

                  {/* Apply button */}
                  {onApply && (
                    <div style={{ flexShrink: 0 }}>
                      {isApplied ? (
                        <span style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>✓ Applied</span>
                      ) : (
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,0.3)' }}
                          onClick={() => applyOne(rec)}
                        >
                          Apply
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* General tips */}
          {data.generalTips?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                💡 General Tips
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.generalTips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--accent)', flexShrink: 0 }}>→</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
