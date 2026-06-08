<div style={{ background: '#f59e0b', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
  <span style={{ fontSize: 20 }}>⚠️</span>
  <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Temporary Service Interruption</span>
</div>

<div style={{ padding: '20px' }}>
  <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
    We are currently experiencing some technical issues affecting our payment services. Our team is actively working to resolve the issue and restore normal operations as soon as possible.
  </p>

  <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
    We will provide updates as soon as the issue has been resolved. We sincerely apologise for any inconvenience caused and appreciate your patience during this time.
  </p>

  <div
    style={{
      background: 'var(--surface2)',
      borderRadius: 'var(--radius-sm)',
      padding: '12px 14px',
      fontSize: 13,
      color: 'var(--text2)',
      lineHeight: 1.5,
      marginBottom: 16,
    }}
  >
    ℹ️ Thank you for your patience and continued support.
  </div>

  <button className="btn btn-primary btn-full" onClick={() => setVisible(false)}>
    Got it — dismiss
  </button>
</div>
