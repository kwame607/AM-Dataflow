'use client';
import { useState } from 'react';

export default function ServiceBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', maxWidth: 480, width: '100%', overflow: 'hidden' }}>
        <div style={{ background: '#10b981', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Service restored</span>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
            The MTN network maintenance has been completed and all deliveries are now fully operational. Orders are being processed and delivered as normal. Status might be "PROCESSING" but most has been delivered.Delivery will be instant after all old orders has been delivered.
          </p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
           We apologise for any inconvenience caused.
          </p>
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
            ℹ️ Thank you for your patience and continued support.
          </div>
          <button className="btn btn-primary btn-full" onClick={() => setVisible(false)}>
            Got it — dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
