// components/ReferralTab.tsx
// Agent referral programme tab — shows referral link, referred agents,
// and bonus earnings. Add as a new tab in the agent dashboard.
'use client';

import { useState, useEffect } from 'react';

interface ReferredAgent {
  id: string; name: string; slug: string; status: string; created_at: string;
}

interface ReferralData {
  totalEarned:    number;
  committed:      number;
  available:      number;
  referredAgents: ReferredAgent[];
  pct:            number;
  referralSlug:   string;
  earnings:       { bonus_amount: number; created_at: string; referred_id: string }[];
}

interface Props {
  agentId:   string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast:     (msg: string, type?: 'success' | 'error' | 'info' | 'warn', duration?: number) => void;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ReferralTab({ agentId, authFetch, toast }: Props) {
  const [data, setData]     = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    authFetch(`/api/referral?agentId=${agentId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId, authFetch]);

  function copyLink() {
    if (!data) return;
    const link = `${siteUrl}/register?ref=${data.referralSlug}`;
    try { navigator.clipboard.writeText(link); }
    catch {
      const el = document.createElement('textarea');
      el.value = link; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    setCopied(true);
    toast('Referral link copied!', 'success', 2000);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)' }}>
      <span className="spinner" style={{ margin: '0 auto' }} />
    </div>
  );

  if (!data) return (
    <div className="empty">
      <div className="empty-icon">⚠️</div>
      <div className="empty-title">Could not load referral data</div>
    </div>
  );

  const referralLink = `${siteUrl}/register?ref=${data.referralSlug}`;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">Referral Programme</div>
        <div className="page-subtitle">Earn {data.pct}% of every sale your referred agents make</div>
      </div>

      {/* How it works */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { icon: '🔗', title: 'Share Your Link', text: 'Send your referral link to other resellers' },
          { icon: '👤', title: 'They Register', text: 'They sign up using your link' },
          { icon: '💰', title: 'They Sell', text: 'Every time they earn, you earn too' },
          { icon: `🎁`, title: `You Earn ${data.pct}%`, text: 'Of their profit, automatically' },
        ].map(s => (
          <div key={s.title} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{s.text}</div>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">🔗 Your Referral Link</div></div>
        <div className="card-body">
          <div className="copy-box" style={{ marginBottom: 12 }}>
            <span className="copy-url">{referralLink}</span>
            <button className="copy-btn" onClick={copyLink} style={{ background: copied ? 'var(--ok-dim)' : undefined, color: copied ? 'var(--ok)' : undefined }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Join me on ADMUNZ and start earning from data bundle sales! Register here: ${referralLink}`)}`}
            className="btn btn-sm"
            style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', display: 'inline-flex' }}
            target="_blank" rel="noopener noreferrer"
          >
            💬 Share on WhatsApp
          </a>
        </div>
      </div>

      {/* Earnings summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Earned',  val: fmt(data.totalEarned), color: 'var(--accent)', sub: 'All-time referral bonus' },
          { label: 'Available',     val: fmt(data.available),   color: 'var(--ok)',     sub: 'Ready to withdraw' },
          { label: 'Committed',     val: fmt(data.committed),   color: 'var(--warn)',   sub: 'Pending/approved WDs' },
          { label: 'Agents Referred', val: String(data.referredAgents.length), color: 'var(--accent2)', sub: 'Total referrals' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color, fontSize: 22 }}>{s.val}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Referred agents */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">👥 Agents You Referred ({data.referredAgents.length})</div></div>
        {data.referredAgents.length === 0 ? (
          <div className="empty" style={{ padding: '32px 20px' }}>
            <div className="empty-icon">👥</div>
            <div className="empty-title">No referrals yet</div>
            <div className="empty-text">Share your referral link to start earning bonus commissions</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Agent</th><th>Store</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>
                {data.referredAgents.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><a href={`/store/${a.slug}`} style={{ color: 'var(--accent)', fontSize: 12 }} target="_blank" rel="noopener noreferrer">/store/{a.slug}</a></td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: a.status === 'active' ? 'var(--ok-dim)' : 'var(--warn-dim)', color: a.status === 'active' ? 'var(--ok)' : 'var(--warn)' }}>{a.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent earnings */}
      {data.earnings.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="card-title">💰 Recent Bonus Earnings</div></div>
          <div style={{ padding: '0 0 4px' }}>
            {data.earnings.slice(0, 20).map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ok)' }}>+{fmt(e.bonus_amount)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(e.created_at)}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>referral bonus</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
