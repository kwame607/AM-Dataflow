// components/FloatingQuickActions.tsx
// Speed-dial FAB offering one-tap jumps to common actions from anywhere in the dashboard.
// Sits to the left of the existing support chat bubble so the two never collide.
'use client';

import React, { useState, useRef, useEffect } from 'react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  onClick: () => void;
}

interface FloatingQuickActionsProps {
  onQuickBuy: () => void;
  onFundWallet: () => void;
  onWithdraw: () => void;
  onViewOrders: () => void;
  hidden?: boolean;
}

export function FloatingQuickActions({ onQuickBuy, onFundWallet, onWithdraw, onViewOrders, hidden }: FloatingQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (hidden) return null;

  const actions: QuickAction[] = [
    {
      id: 'quickbuy',
      label: 'Quick Buy',
      color: 'var(--accent)',
      bg: 'var(--accent-dim)',
      onClick: onQuickBuy,
      icon: (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      ),
    },
    {
      id: 'fund',
      label: 'Fund Wallet',
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.12)',
      onClick: onFundWallet,
      icon: (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      id: 'withdraw',
      label: 'Withdraw',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)',
      onClick: onWithdraw,
      icon: (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'orders',
      label: 'My Orders',
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.12)',
      onClick: onViewOrders,
      icon: (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
  ];

  return (
    <div ref={wrapRef} style={{ position: 'fixed', bottom: 90, right: 86, zIndex: 998, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      <style>{`
        @keyframes fabItemIn { from { opacity: 0; transform: translateY(8px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fabBackdrop { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {open && (
        <>
          {actions.map((a, i) => (
            <button
              key={a.id}
              onClick={() => { a.onClick(); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                animation: `fabItemIn .22s ease both`,
                animationDelay: `${(actions.length - 1 - i) * 0.04}s`,
              }}
            >
              <span style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                color: 'var(--text)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', whiteSpace: 'nowrap',
              }}>
                {a.label}
              </span>
              <span style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: a.bg, border: `1px solid ${a.color}40`, color: a.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)', transition: 'transform .15s',
              }}
                onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.08)')}
                onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {a.icon}
              </span>
            </button>
          ))}
        </>
      )}

      {/* Main FAB toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 52, height: 52, borderRadius: '50%',
          background: open ? 'var(--surface2)' : 'var(--surface)',
          border: '1px solid var(--border-h)',
          color: open ? 'var(--text)' : 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', cursor: 'pointer',
          transition: 'transform .25s ease, background .2s',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
        aria-label="Quick actions"
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
