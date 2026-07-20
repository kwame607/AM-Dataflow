// components/ui/PhoneVerifiedHint.tsx — NEW FILE
'use client';

import { useEffect, useState } from 'react';

interface Props {
  /** Expects a 10-digit local number (e.g. "0241234567"). No-ops otherwise. */
  phone: string;
}

export function PhoneVerifiedHint({ phone }: Props) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'verified' | 'new'>('idle');

  useEffect(() => {
    if (phone.length !== 10) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    fetch(`/api/orders/number-status?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setStatus(d.verified ? 'verified' : 'new'); })
      .catch(() => { if (!cancelled) setStatus('idle'); });
    return () => { cancelled = true; };
  }, [phone]);

  if (status === 'idle' || status === 'checking') return null;

  if (status === 'verified') {
    return (
      <div className="form-hint" style={{ color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
        <span>✓</span>
        <span>This number has ordered with us before — delivery should process normally.</span>
      </div>
    );
  }

  return (
    <div className="form-hint" style={{ color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
      <span>🆕</span>
      <span>First time seeing this number — network verification for new numbers can take up to 2–3 days.</span>
    </div>
  );
}
