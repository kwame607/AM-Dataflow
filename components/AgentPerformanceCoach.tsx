// components/AgentPerformanceCoach.tsx
'use client';

import React, { useState, useCallback } from 'react';
import type { Order, Withdrawal } from '@/types';

interface AgentPerformanceCoachProps {
  agent: { id: string; name: string; slug: string };
  orders: Order[];
  withdrawals: Withdrawal[];
  agentPrices: Record<string, number>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

interface CoachResponse {
  summary: string;
  tips: { emoji: string; title: string; detail: string }[];
  bestTime: string;
  topBundle: string;
  growthTip: string;
}

function buildAgentContext(
  agent: { name: string; slug: string },
  orders: Order[],
  withdrawals: Withdrawal[],
  agentPrices: Record<string, number>
): string {
  const successOrders = orders.filter(o => o.status === 'success');
  const now = new Date();

  const byDay: Record<string, number> = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
  const dayKeys = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  successOrders.forEach(o => {
    const key = dayKeys[new Date(o.created_at).getDay()];
    byDay[key] = (byDay[key] || 0) + 1;
  });

  const byHour: Record<number, number> = {};
  successOrders.forEach(o => {
    const h = new Date(o.created_at).getHours();
    byHour[h] = (byHour[h] || 0) + 1;
  });
  const peakHour = Object.entries(byHour).sort((a,b) => b[1]-a[1])[0];
  const peakDay  = Object.entries(byDay).sort((a,b)  => b[1]-a[1])[0];

  const bundleCount: Record<string, number> = {};
  successOrders.forEach(o => { bundleCount[o.size] = (bundleCount[o.size] || 0) + 1; });
  const topBundles = Object.entries(bundleCount).sort((a,b) => b[1]-a[1]).slice(0,3);

  const netCount: Record<string, number> = {};
  successOrders.forEach(o => { netCount[o.network] = (netCount[o.network] || 0) + 1; });

  const last7 = successOrders.filter(o =>
    (now.getTime() - new Date(o.created_at).getTime()) / 86400000 <= 7
  );
  const prev7 = successOrders.filter(o => {
    const d = (now.getTime() - new Date(o.created_at).getTime()) / 86400000;
    return d > 7 && d <= 14;
  });

  const totalEarned    = successOrders.reduce((s,o) => s + (o.agent_profit || 0), 0);
  const totalWithdrawn = withdrawals.filter(w => ['paid','approved'].includes(w.status))
                                    .reduce((s,w) => s + w.amount, 0);
  const available = totalEarned - totalWithdrawn;
  const priceCount = Object.keys(agentPrices).length;

  const lastOrder = successOrders
    .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const daysSinceLast = lastOrder
    ? Math.floor((now.getTime() - new Date(lastOrder.created_at).getTime()) / 86400000)
    : null;

  return `
Agent: ${agent.name} (store: /store/${agent.slug})
Total orders all-time: ${orders.length} (${successOrders.length} successful)
Orders last 7 days: ${last7.length}
Orders previous 7 days: ${prev7.length}
Week-on-week change: ${prev7.length > 0 ? (((last7.length - prev7.length) / prev7.length) * 100).toFixed(1) : 'N/A'}%
Peak selling day: ${peakDay ? peakDay[0] + ' (' + peakDay[1] + ' orders)' : 'not enough data'}
Peak selling hour: ${peakHour ? peakHour[0] + ':00 (' + peakHour[1] + ' orders)' : 'not enough data'}
Top bundles sold: ${topBundles.map(([size, count]) => `${size} (${count}x)`).join(', ') || 'none yet'}
Network breakdown: ${Object.entries(netCount).map(([net, c]) => `${net.toUpperCase()}: ${c}`).join(', ') || 'none yet'}
Total earnings: GHS ${totalEarned.toFixed(2)}
Available to withdraw: GHS ${available.toFixed(2)}
Price lists configured: ${priceCount} bundles
Days since last order: ${daysSinceLast !== null ? daysSinceLast : 'never sold'}
  `.trim();
}

export function AgentPerformanceCoach({
  agent, orders, withdrawals, agentPrices, authFetch,
}: AgentPerformanceCoachProps) {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<CoachResponse | null>(null);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(false);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);

    const context = buildAgentContext(agent, orders, withdrawals, agentPrices);

    try {
      const res = await authFetch('/api/agents/coach', {
        method: 'POST',
        body: JSON.stringify({ agentId: agent.id, context }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load tips'); return; }
      setResult(data.result);
      setExpanded(true);
    } catch {
      setError('Could not load coaching tips. Try again.');
    } finally {
      setLoading(false);
    }
  }, [agent, orders, withdrawals, agentPrices, authFetch]);

  const hasEnoughData = orders.filter(o => o.status === 'success').length >= 3;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"
        style={{ cursor: result ? 'pointer' : 'default' }}
        onClick={() => result && setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(0,212,170,0.2), rgba(56,189,248,0.15))',
            border: '1px solid rgba(0,212,170,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>🤖</div>
          <div>
            <div className="card-title">AI Performance Coach</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
              Personalized tips based on your sales data
            </div>
          </div>
        </div>
        {result && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {expanded ? '▲ collapse' : '▼ expand'}
          </span>
        )}
      </div>

      <div className="card-body">
        {!result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!hasEnoughData ? (
              <div style={{
                background: 'var(--surface2)', borderRadius: 10,
                padding: '14px 16px', fontSize: 13, color: 'var(--text3)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <span>Make at least 3 sales to unlock AI coaching tips tailored to your store.</span>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.6 }}>
                  Get personalized tips on when to sell, what to promote, and how to grow — based on your actual order history.
                </p>
                <button className="btn btn-primary" style={{ width: 'fit-content' }} onClick={analyze}>
                  ✨ Analyse My Performance
                </button>
              </>
            )}
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <span className="spinner" />
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>Analysing your sales data…</span>
          </div>
        )}

        {error && <div className="alert alert-error"><span>⚠</span><span>{error}</span></div>}

        {result && expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Summary */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,212,170,0.08), rgba(56,189,248,0.06))',
              border: '1px solid rgba(0,212,170,0.2)',
              borderRadius: 12, padding: '14px 16px',
              fontSize: 13, color: 'var(--text)', lineHeight: 1.7,
            }}>
              {result.summary}
            </div>

            {/* Tips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.tips.map((tip, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px',
                }}>
                  <span style={{ fontSize: 22, flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {tip.emoji}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{tip.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{tip.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Best time + top bundle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', borderLeft: '3px solid var(--accent)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  ⏰ Best Time to Share
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{result.bestTime}</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', borderLeft: '3px solid #f59e0b' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  📦 Promote This
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{result.topBundle}</div>
              </div>
            </div>

            {/* Growth tip */}
            <div style={{
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 10, padding: '12px 14px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🚀</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ok)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  This Week's Growth Tip
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{result.growthTip}</div>
              </div>
            </div>

            <button className="btn btn-secondary btn-sm" style={{ width: 'fit-content' }} onClick={analyze} disabled={loading}>
              ↻ Refresh Analysis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
