'use client';

import { useState } from 'react';

export default function ServiceBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          maxWidth: 500,
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#16a34a',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 22 }}>🟢</span>

          <div>
            <div
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              MTN Service Restored
            </div>

            <div
              style={{
                color: 'rgba(255,255,255,.9)',
                fontSize: 13,
              }}
            >
              Yello Portal is back online
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          <p
            style={{
              color: 'var(--text)',
              lineHeight: 1.7,
              fontSize: 14,
              marginBottom: 18,
            }}
          >
            The MTN Yello Portal has been restored. We are currently processing
            all previously placed pending orders before accepting new MTN
            orders.
          </p>

          <div
            style={{
              background: 'rgba(245,158,11,.12)',
              border: '1px solid rgba(245,158,11,.2)',
              color: '#b45309',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            ⏳ Please bear with us while we clear the pending queue. New MTN
            orders will resume shortly.
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={() => setVisible(false)}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
