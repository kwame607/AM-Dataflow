// components/AdmunzLogo.tsx
// Drop-in logo component — Raleway 800, yellow Z accent
// Usage: <AdmunzLogo size="md" />

import Image from 'next/image';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
};

export function AdmunzLogo({ size = 'md', showTagline = true }: Props) {
  const sizes = {
    sm: { img: 28, font: 18, tagline: 9 },
    md: { img: 38, font: 22, tagline: 10 },
    lg: { img: 48, font: 30, tagline: 11 },
  };
  const s = sizes[size];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      {/* Your custom logo icon */}
      <div style={{ width: s.img, height: s.img, borderRadius: Math.round(s.img * 0.28), overflow: 'hidden', flexShrink: 0 }}>
        <Image src="/admunz.png" alt="AdmunZ logo" width={s.img} height={s.img} style={{ objectFit: 'cover' }} />
      </div>

      {/* Wordmark */}
      <div style={{ lineHeight: 1 }}>
        <div style={{
          fontFamily: "'Raleway', sans-serif",
          fontSize: s.font,
          fontWeight: 800,
          letterSpacing: '0.02em',
          color: 'var(--text)',
          lineHeight: 1.1,
        }}>
          Admun<span style={{ color: '#f59e0b' }}>Z</span>
        </div>
        {showTagline && (
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: s.tagline,
            fontWeight: 600,
            letterSpacing: '0.2em',
            color: 'var(--text3)',
            textTransform: 'uppercase',
            marginTop: 3,
          }}>
            Data Hub
          </div>
        )}
      </div>
    </div>
  );
}
