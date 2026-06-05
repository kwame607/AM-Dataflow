'use client';
import { useState } from 'react';

export default function ServiceBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', maxWidth: 480, width: '100%', overflow: 'hidden' }}>
        <div style={{ background: '#f59e0b', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a0a00' }}>Service disruption notice</span>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
            We are currently experiencing a delivery delay on <strong>MTN data bundle orders only</strong>. Our provider (Yello Portal) has been working to resolve an MTN network issue since <strong>Wednesday, 4:00 PM</strong>.
          </p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
            <strong>Telecel and AirtelTigo orders are working normally.</strong> All pending MTN orders are safe and will be fulfilled once the issue is resolved. We appreciate your patience.
          </p>
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
            ℹ️ Do not place duplicate orders — your payment has been received and recorded.
          </div>
          <button className="btn btn-primary btn-full" onClick={() => setVisible(false)}>
            I understand — dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
