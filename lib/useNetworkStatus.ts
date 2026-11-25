// lib/useNetworkStatus.ts
// Client hook for storefronts (main store, agent stores, Quick Buy).
'use client';

import { useEffect, useState } from 'react';

export interface NetworkStatusClient {
  disabled: string[];
  messages: Record<string, string>;
  loaded: boolean;
  isDisabled: (network: string) => boolean;
  messageFor: (network: string) => string;
}

const norm = (n: string) => {
  const v = (n || '').toLowerCase().trim();
  return v === 'airteltigo' ? 'at' : v;
};

export function useNetworkStatus(): NetworkStatusClient {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/network-status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        setDisabled(d.disabled || []);
        setMessages(d.messages || {});
      })
      .catch(() => { /* fail open */ })
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, []);

  return {
    disabled,
    messages,
    loaded,
    isDisabled: n => disabled.includes(norm(n)),
    messageFor: n =>
      messages[norm(n)] || 'This network is temporarily unavailable. Please check back soon.',
  };
}
