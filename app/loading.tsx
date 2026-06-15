import Image from 'next/image';

export default function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #0b0f17)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
          <Image src="/admunz.png" alt="AdmunZ" width={52} height={52} style={{ objectFit: 'cover' }} />
        </div>
        <div style={{ lineHeight: 1 }}>
          <div style={{
            fontFamily: "'Raleway', sans-serif",
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '0.02em',
            color: '#f1f5f9',
            lineHeight: 1.1,
          }}>
            Admun<span style={{ color: '#f59e0b' }}>Z</span>
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.2em',
            color: '#475569',
            textTransform: 'uppercase',
            marginTop: 4,
          }}>
            Data Hub
          </div>
        </div>
      </div>

      {/* Spinner */}
      <div style={{ position: 'relative', width: 44, height: 44 }}>
        <svg viewBox="0 0 44 44" width="44" height="44"
          style={{ animation: 'spin 0.9s linear infinite' }}>
          <circle cx="22" cy="22" r="18" fill="none" stroke="#1a2a3a" strokeWidth="3.5" />
          <circle cx="22" cy="22" r="18" fill="none" stroke="#00d4aa" strokeWidth="3.5"
            strokeDasharray="66 48" strokeLinecap="round" />
        </svg>
      </div>

      {/* Tagline */}
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 11,
        fontWeight: 600,
        color: '#334155',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}>
        Loading
        <span style={{ animation: 'dots 1.4s steps(3, end) infinite' }}>...</span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dots {
          0%, 20%  { opacity: 0.2; }
          60%, 100%{ opacity: 1; }
        }
      `}</style>
    </div>
  );
}
