// components/WhatsAppMessageGenerator.tsx
'use client';

import React, { useState } from 'react';
import type { Order } from '@/types';

interface WhatsAppMessageGeneratorProps {
  agent: { id: string; name: string; slug: string; whatsapp?: string; phone?: string };
  orders: Order[];
  agentPrices: Record<string, number>;
  siteUrl: string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const QUICK_PROMPTS = [
  { label: '📣 Promote my store',    value: 'Write a message promoting my data bundle store and encouraging people to buy' },
  { label: '🔥 Weekend deals',       value: 'Write a message about weekend data bundle deals to send to my customers' },
  { label: '📦 MTN bundles',         value: 'Write a message specifically promoting my MTN data bundles' },
  { label: '⚡ AirtelTigo bundles',  value: 'Write a message promoting my AirtelTigo data bundles' },
  { label: '🟢 Telecel bundles',     value: 'Write a message promoting my Telecel data bundles' },
  { label: '🎉 Thank customers',     value: 'Write a thank you message to my loyal customers encouraging them to buy again' },
  { label: '🆕 New customer welcome',value: 'Write a welcome message for new customers to introduce my store' },
  { label: '💸 Referral message',    value: 'Write a message asking my customers to refer their friends to my store' },
];

export function WhatsAppMessageGenerator({
  agent, orders, agentPrices, siteUrl, authFetch,
}: WhatsAppMessageGeneratorProps) {
  const [prompt, setPrompt]   = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');
  const [tone, setTone]       = useState<'friendly' | 'professional' | 'hype'>('friendly');

  const storeUrl = `${siteUrl}/store/${agent.slug}`;
  const contact  = agent.whatsapp || agent.phone || '';

  function buildStoreContext(): string {
    const successOrders = orders.filter(o => o.status === 'success');
    const netCount: Record<string, number> = {};
    successOrders.forEach(o => { netCount[o.network] = (netCount[o.network] || 0) + 1; });

    const priceLines = Object.entries(agentPrices)
      .slice(0, 10)
      .map(([key, price]) => {
        const parts = key.split('_');
        const net  = parts[0].toUpperCase();
        const size = parts.slice(1).join('').toUpperCase();
        return `  ${net} ${size}: GHS ${price.toFixed(2)}`;
      });

    return `Store name: ${agent.name}
Store link: ${storeUrl}
Contact: ${contact}
Networks: ${Object.keys(netCount).length > 0
  ? Object.keys(netCount).map(n => n.toUpperCase()).join(', ')
  : 'MTN, AirtelTigo, Telecel'}
Sample prices:
${priceLines.join('\n') || '  (prices not yet set)'}
Total orders made: ${successOrders.length}`;
  }

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await authFetch('/api/agents/whatsapp-message', {
        method: 'POST',
        body: JSON.stringify({
          agentId:      agent.id,
          prompt:       prompt.trim(),
          tone,
          storeContext: buildStoreContext(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to generate message'); return; }
      setMessage(data.message);
    } catch {
      setError('Could not generate message. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyMessage() {
    try { navigator.clipboard.writeText(message); }
    catch {
      const el = document.createElement('textarea');
      el.value = message;
      document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(37,211,102,0.15)',
            border: '1px solid rgba(37,211,102,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>💬</div>
          <div>
            <div className="card-title">WhatsApp Message Generator</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
              AI writes broadcast messages for your customers
            </div>
          </div>
        </div>
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Quick prompts */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Quick Select
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {QUICK_PROMPTS.map(q => (
              <button key={q.label} onClick={() => setPrompt(q.value)} style={{
                padding: '5px 11px', borderRadius: 20,
                border: `1px solid ${prompt === q.value ? 'rgba(37,211,102,0.5)' : 'var(--border)'}`,
                background: prompt === q.value ? 'rgba(37,211,102,0.1)' : 'var(--surface2)',
                color: prompt === q.value ? '#25d366' : 'var(--text2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}>
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom prompt */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Or describe what you want</label>
          <textarea
            className="form-input" rows={2}
            placeholder="e.g. Write a message about my 5GB MTN bundle at a special price this weekend…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            style={{ resize: 'none', fontSize: 13 }}
          />
        </div>

        {/* Tone selector */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Tone
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { key: 'friendly',     label: '😊 Friendly' },
              { key: 'professional', label: '👔 Professional' },
              { key: 'hype',         label: '🔥 Hype' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTone(t.key)} style={{
                padding: '6px 14px', borderRadius: 8,
                border: `1px solid ${tone === t.key ? 'var(--accent)' : 'var(--border)'}`,
                background: tone === t.key ? 'var(--accent-dim)' : 'var(--surface2)',
                color: tone === t.key ? 'var(--accent)' : 'var(--text3)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          className="btn btn-primary"
          style={{ width: 'fit-content' }}
          onClick={generate}
          disabled={loading || !prompt.trim()}
        >
          {loading ? <><span className="spinner" /> Writing message…</> : <>✨ Generate Message</>}
        </button>

        {error && <div className="alert alert-error"><span>⚠</span><span>{error}</span></div>}

        {/* Generated message */}
        {message && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Generated Message
            </div>

            {/* WhatsApp-style preview */}
            <div style={{ background: '#075e54', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{
                background: '#dcf8c6', borderRadius: '2px 12px 12px 12px',
                padding: '12px 14px', fontSize: 13, color: '#111',
                lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxWidth: '85%',
              }}>
                {message}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6, textAlign: 'right' }}>
                Preview
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={copyMessage}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: copied ? 'var(--ok)' : undefined, color: copied ? 'var(--ok)' : undefined }}
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-sm"
                style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/>
                </svg>
                Open in WhatsApp
              </a>
              <button className="btn btn-secondary btn-sm" onClick={generate} disabled={loading}>
                ↻ Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
