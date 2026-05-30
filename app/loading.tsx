import Image from 'next/image';
export default function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#06090e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
       <div style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
  <Image src="/admunz.png" alt="ADMUNZ" width={52} height={52} style={{ objectFit: 'cover' }} />
</div>
        <div>
          <div style={{ fontFamily: 'sans-serif', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>ADMUNZ</div>
          <div style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#64748b', marginTop: 2 }}>Data</div>
        </div>
      </div>

      {/* Spinner */}
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        <svg viewBox="0 0 40 40" width="40" height="40" style={{ animation: 'spin 0.9s linear infinite' }}>
          <circle cx="20" cy="20" r="16" fill="none" stroke="#1a2230" strokeWidth="3.5" />
          <circle cx="20" cy="20" r="16" fill="none" stroke="#00d4aa" strokeWidth="3.5"
            strokeDasharray="60 44" strokeLinecap="round" />
        </svg>
      </div>

      {/* Tagline */}
      <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#334155', letterSpacing: 1 }}>
        LOADING
        <span style={{ animation: 'dots 1.4s steps(3,end) infinite' }}>...</span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dots {
          0%, 20%  { content: '.'; }
          40%      { content: '..'; }
          60%, 100%{ content: '...'; }
        }
      `}</style>
    </div>
  );
}
