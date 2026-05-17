'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ToastMessage } from '@/types';

interface ToastContextValue {
  toast: (message: string, type?: ToastMessage['type'], duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback(
    (message: string, type: ToastMessage['type'] = 'info', duration = 3500) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    },
    []
  );

  const icons: Record<ToastMessage['type'], string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warn: '⚠',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{icons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useSimpleToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback(
    (message: string, type: ToastMessage['type'] = 'info', duration = 3500) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    },
    []
  );

  const ToastContainer = () => {
    const icons: Record<ToastMessage['type'], string> = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{icons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    );
  };

  return { toast, ToastContainer };
}
