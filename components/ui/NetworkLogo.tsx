import React from 'react';
import Image from 'next/image';

interface NetworkLogoProps {
  network: 'mtn' | 'at' | 'telecel' | string;
  size?: number;
}

const logoMap: Record<string, { src: string; bg: string }> = {
  mtn:     { src: '/mtn.png', bg: '#FFCB05' },
  at:      { src: '/at.jpg',  bg: '#E52020' },
  telecel: { src: '',         bg: '#00539B' },
};

export function NetworkLogo({ network, size = 52 }: NetworkLogoProps) {
  const entry = logoMap[network];

  if (entry?.src) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12,
        background: entry.bg, overflow: 'hidden',
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Image src={entry.src} alt={network.toUpperCase()} width={size} height={size}
          style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
      </div>
    );
  }

  const bg = entry?.bg || '#334155';
  const label = network === 'telecel' ? 'TELECEL' : network.toUpperCase().slice(0, 3);
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="52" height="52" rx="12" fill={bg}/>
      <text x="26" y="34" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Arial,sans-serif" fill="#fff" letterSpacing="0.5">{label}</text>
    </svg>
  );
}
