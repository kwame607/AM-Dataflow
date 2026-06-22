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
          maxWidth: 520,
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#f59e0b',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 22 }}>⚠️</span>

          <div>
            <div
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              MTN Service Update
            </div>

            <div
              style={{
                color: 'rgba(255,255,255,.9)',
                fontSize: 13,
              }}
            >
              Temporary delay in MTN order processing
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
              marginBottom: 16,
            }}
          >
            MTN is currently carrying out maintenance and system upgrades.
            During this period, new MTN orders may experience temporary delays.
          </p>

          <div
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: 18,
              lineHeight: 1.7,
              fontSize: 14,
              color: 'var(--text2)',
            }}
          >
            ✅ Orders marked <strong>Delivered</strong> have been successfully
            processed.
            <br />
            <br />
            🔒 Your funds are safe and no orders will be lost.
            <br />
            <br />
            ⏳ Pending orders will be automatically delivered once MTN services
            are restored.
          </div>

          <p
            style={{
              color: 'var(--text)',
              lineHeight: 1.7,
              fontSize: 14,
              marginBottom: 18,
            }}
          >
            We are closely monitoring the situation and will provide updates
            immediately when normal service resumes. We sincerely apologize for
            any inconvenience and appreciate your patience and understanding.
          </p>

          <div
            style={{
              background: 'rgba(34,197,94,.12)',
              border: '1px solid rgba(34,197,94,.2)',
              color: '#16a34a',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
             Thank you for choosing ADMUNZ. We appreciate your continued
            support.
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={() => setVisible(false)}
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
