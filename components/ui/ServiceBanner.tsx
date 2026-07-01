'use client';

import { useEffect, useState } from 'react';

interface BannerData {
  active: boolean;
  id?: string;
  title?: string;
  body?: string;
}

const STORAGE_KEY = 'admunz_dismissed_banner_id';

export default function ServiceBanner() {
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch('/api/admin/banner')
      .then(r => r.json())
      .then((d: BannerData) => {
        if (!d.active || !d.id) return;
        let dismissedId = '';
        try { dismissedId = localStorage.getItem(STORAGE_KEY) || ''; } catch { /* unavailable */ }
        if (dismissedId === d.id) return; // already seen this exact banner
        setBanner(d);
        setVisible(true);
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    if (banner?.id) {
      try { localStorage.setItem(STORAGE_KEY, banner.id); } catch { /* non-fatal */ }
    }
    setVisible(false);
  }

  if (!visible || !banner) return null;

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
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>
              {banner.title}
            </div>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <p
            style={{
              color: 'var(--text)',
              lineHeight: 1.7,
              fontSize: 14,
              marginBottom: 20,
              whiteSpace: 'pre-wrap',
            }}
          >
            {banner.body}
          </p>

          <button className="btn btn-primary btn-full" onClick={dismiss}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
