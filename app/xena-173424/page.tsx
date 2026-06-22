'use client';
import Image from 'next/image';
import React, { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { BUNDLES, NET_NAMES, getDefaultAdminPrice } from '@/lib/bundles';
import { fmt, fmtDate, exportCSV } from '@/lib/utils';
import { useSimpleToast } from '@/components/ui/Toast';
import { StatusBadge, NetworkBadge, DeliveryBadge } from '@/components/ui/Badge';
import { FinanceTab } from '@/components/FinanceTab';
import type { Agent, Order, AdminPrice, Withdrawal } from '@/types';
import { AdminSupportTab } from '@/components/AdminSupportTab';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminAiInsights } from '@/components/AdminAiInsights';
import { AdminCustomerInsights } from '@/components/AdminCustomerInsights';
import { ProviderToggle } from '@/components/ProviderToggle';

type Tab = 'overview' | 'orders' | 'agents' | 'prices' | 'withdrawals' | 'settings' | 'finance' | 'support';

export default function AdminPage() {
  const { toast, ToastContainer } = useSimpleToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [adminPrices, setAdminPrices] = useState<AdminPrice[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [hubBalance, setHubBalance] = useState<number | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [storeEdits, setStoreEdits] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [bulkMarkup, setBulkMarkup] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [inactiveDays, setInactiveDays] = useState(30);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    // Fetch all orders in batches of 500 to avoid the API row limit
    async function fetchAllOrders(): Promise<Order[]> {
      const batchSize = 500;
      let offset = 0;
      const all: Order[] = [];
      while (true) {
        const res = await fetch(`/api/orders?limit=${batchSize}&offset=${offset}`)
          .then(r => r.json())
          .catch(() => []);
        const batch: Order[] = Array.isArray(res) ? res : [];
        all.push(...batch);
        if (batch.length < batchSize) break; // no more pages
        offset += batchSize;
      }
      return all;
    }

    const [ordersRes, agentsRes, pricesRes, withdrawalsRes, balRes] = await Promise.all([
      fetchAllOrders(),
      fetch('/api/agents').then(r => r.json()).catch(() => []),
      fetch('/api/admin/prices').then(r => r.json()).catch(() => []),
      fetch('/api/withdrawals').then(r => r.json()).catch(() => []),
      fetch('/api/hubnet/balance').then(r => r.json()).catch(() => null),
    ]);
    setOrders(Array.isArray(ordersRes) ? ordersRes : []);
    setAgents(Array.isArray(agentsRes) ? agentsRes : []);
    const prices = Array.isArray(pricesRes) ? pricesRes : [];
    setAdminPrices(prices);
    const edits: Record<string, string> = {};
    const sEdits: Record<string, string> = {};
    prices.forEach((p: AdminPrice) => {
      edits[p.bundle_key] = String(p.selling_price);
      sEdits[p.bundle_key] = String(p.store_price ?? p.selling_price);
    });
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => {
        if (!edits[b.key]) edits[b.key] = String(getDefaultAdminPrice(b.cost));
        if (!sEdits[b.key]) sEdits[b.key] = String(getDefaultAdminPrice(b.cost));
      });
    });
    setPriceEdits(edits);
    setStoreEdits(sEdits);
    setWithdrawals(Array.isArray(withdrawalsRes) ? withdrawalsRes : []);
    if (balRes?.balance !== undefined) setHubBalance(balRes.balance);
  }, []);

  useEffect(() => {
  setLoading(false);
  loadAll();

  const fetchSupportUnread = async () => {
    try {
      const r = await authFetch('/api/support/unread?admin=1');
      const d = await r.json();
      setSupportUnread(d.total || 0);
    } catch {}
  };

  fetchSupportUnread();

  const interval = setInterval(fetchSupportUnread, 30000);

  return () => clearInterval(interval);
}, [loadAll]);

  async function logout() { await getSupabaseClient().auth.signOut(); window.location.href = '/xena-173424/login'; }

  async function authFetch(url: string, options: RequestInit = {}) {
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const token = session?.access_token || '';
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  }

  async function saveAdminPrices() {
    setSavingPrices(true);
    try {
      const prices = Object.keys(BUNDLES).flatMap(net =>
        BUNDLES[net].map(b => ({
          bundleKey: b.key, network: net, size: b.size,
          volume: b.volume, hubnetCost: b.cost, validity: b.validity,
          sellingPrice: parseFloat(priceEdits[b.key] || '0') || getDefaultAdminPrice(b.cost),
          storePrice: parseFloat(storeEdits[b.key] || '0') || getDefaultAdminPrice(b.cost),
        }))
      );
      const res = await authFetch('/api/admin/prices', {
        method: 'POST',
        body: JSON.stringify({ prices }),
      });
      if (res.ok) { toast('Prices saved!', 'success'); await loadAll(); }
      else { const d = await res.json(); toast(d.error || 'Failed', 'error'); }
    } catch { toast('Network error', 'error'); }
    finally { setSavingPrices(false); }
  }

  function applyBulkMarkup() {
    const pct = parseFloat(bulkMarkup);
    if (isNaN(pct)) return;
    const newEdits: Record<string, string> = { ...priceEdits };
    const newStore: Record<string, string> = { ...storeEdits };
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => {
        newEdits[b.key] = (b.cost * (1 + pct / 100)).toFixed(2);
        newStore[b.key] = (b.cost * (1 + pct / 100)).toFixed(2);
      });
    });
    setPriceEdits(newEdits);
    setStoreEdits(newStore);
  }

  async function updateAgent(id: string, status: string) {
    const res = await authFetch('/api/agents', {
      method: 'PATCH',
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) { toast(`Agent ${status}`, 'success'); await loadAll(); }
    else toast('Failed', 'error');
  }

  async function deleteAgent(id: string, authUserId: string) {
    if (!confirm('Delete this agent? This is permanent.')) return;
    const res = await authFetch('/api/agents', {
      method: 'DELETE',
      body: JSON.stringify({ id, authUserId }),
    });
    if (res.ok) { toast('Agent deleted', 'success'); await loadAll(); }
    else toast('Failed to delete', 'error');
  }

  async function markDelivered(orderId: string) {
    const res = await authFetch('/api/orders/mark-delivered', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
    if (res.ok) { toast('Marked as delivered', 'success'); await loadAll(); }
    else toast('Failed', 'error');
  }

  async function retryDelivery(orderId: string) {
    toast('Retrying delivery…', 'info');
    const res = await authFetch('/api/orders/retry-delivery', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (res.ok) { toast(data.message || 'Sent to Hubnet', 'success'); await loadAll(); }
    else toast(data.message || 'Retry failed — check Hubnet wallet', 'error');
  }

  async function resolveWithdrawal(id: string, status: string) {
    const res = await fetch('/api/withdrawals', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) { toast(`Marked as ${status}`, 'success'); await loadAll(); }
    else toast('Failed', 'error');
  }

  const successOrders = orders.filter(o => o.status === 'success');
  const totalRevenue = successOrders.reduce((s, o) => s + (o.admin_price || 0), 0);
  const totalProfit = successOrders.reduce((s, o) => s + (o.admin_profit || 0), 0);
  const pendingAgents = agents.filter(a => a.status === 'pending').length;
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = successOrders.filter(o => o.created_at?.slice(0, 10) === todayStr);
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.admin_price || 0), 0);
  const todayProfit = todayOrders.reduce((s, o) => s + (o.admin_profit || 0), 0);

  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);

  const agentStats = React.useMemo(() => {
    const map: Record<string, {
      totalOrders: number; totalRevenue: number; totalProfit: number;
      todayOrders: number; todayRevenue: number; todayProfit: number;
      lastSale: string | null; daysSince: number | null;
    }> = {};
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    orders.filter(o => o.status === 'success' && o.agent_id).forEach(o => {
      if (!map[o.agent_id!]) map[o.agent_id!] = {
        totalOrders: 0, totalRevenue: 0, totalProfit: 0,
        todayOrders: 0, todayRevenue: 0, todayProfit: 0,
        lastSale: null, daysSince: null,
      };
      const s = map[o.agent_id!];
      s.totalOrders++;
      s.totalRevenue += o.agent_price || 0;
      s.totalProfit += o.agent_profit || 0;
      if (o.created_at?.slice(0, 10) === todayStr) {
        s.todayOrders++;
        s.todayRevenue += o.agent_price || 0;
        s.todayProfit += o.agent_profit || 0;
      }
      if (!s.lastSale || o.created_at > s.lastSale) {
        s.lastSale = o.created_at;
        s.daysSince = Math.floor((now - new Date(o.created_at).getTime()) / 86400000);
      }
    });
    return map;
  }, [orders]);

  function getActivityLevel(agentId: string, registeredAt: string): 'active' | 'slow' | 'inactive' {
    const s = agentStats[agentId];
    const daysSinceReg = Math.floor((Date.now() - new Date(registeredAt).getTime()) / 86400000);
    if (!s || s.daysSince === null) return daysSinceReg >= 7 ? 'inactive' : 'active';
    if (s.daysSince <= inactiveDays) return 'active';
    if (s.daysSince <= inactiveDays * 2) return 'slow';
    return 'inactive';
  }

  const filteredAgents = (() => {
    if (agentFilter === 'inactive') {
      return agents.filter(a => getActivityLevel(a.id, a.created_at) === 'inactive' && a.status !== 'pending');
    }
    return agentFilter === 'all' ? agents : agents.filter(a => a.status === agentFilter);
  })();

  const inactiveCount = agents.filter(a => getActivityLevel(a.id, a.created_at) === 'inactive' && a.status !== 'pending').length;

  const navItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M3 12h18M3 17h18"/></svg> },
    { id: 'orders', label: 'Orders', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
    { id: 'agents', label: 'Agents', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>, badge: pendingAgents },
    { id: 'prices', label: 'Base Prices', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg> },
    { id: 'withdrawals', label: 'Withdrawals', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>, badge: pendingWithdrawals },
    { id: 'finance', label: 'Finance', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> },{
  id: 'support',
  label: 'Support',
  icon: (
    <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  ),
  badge: supportUnread,
},
    { id: 'settings', label: 'Settings', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px', borderColor: 'rgba(0,212,170,0.2)', borderTopColor: 'var(--accent)' }} />
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading admin…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-layout">
      {sidebarOpen && <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ width: 38, height: 38, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
            <Image src="/admunz.png" alt="AdmunZ" width={38} height={38} style={{ objectFit: 'cover' }} />
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: "'Raleway', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: '0.02em', color: 'var(--text)', lineHeight: 1.1 }}>
              Admun<span style={{ color: '#f59e0b' }}>Z</span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', color: 'var(--text3)', textTransform: 'uppercase', marginTop: 3 }}>
              Data Hub
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div>
            <div className="nav-section-label">Administration</div>
            {navItems.map(item => (
              <button key={item.id} className={`nav-item${tab === item.id ? ' active' : ''}`}
                onClick={() => { setTab(item.id); setSidebarOpen(false); }}>
                {item.icon}
                {item.label}
                {(item.badge ?? 0) > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'var(--err)', color: '#fff', borderRadius: 100, fontSize: 10, fontWeight: 800, padding: '2px 6px', lineHeight: 1.4 }}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          {hubBalance !== null && (
            <div className="sidebar-balance">
              <div className="sidebar-balance-label">XpresPortal Balance</div>
              <div className="sidebar-balance-val">{fmt(hubBalance)}</div>
            </div>
          )}
          <button className="nav-item" onClick={logout} style={{ width: '100%', color: 'var(--err)' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="menu-btn" onClick={() => setSidebarOpen(v => !v)}>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div>
            <div className="topbar-title">{navItems.find(n => n.id === tab)?.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>ADMUNZ — Admin</div>
          </div>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <button className="btn btn-secondary btn-sm" onClick={loadAll} style={{ gap: 6 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
          <div className="topbar-avatar">A</div>
        </div>
      </header>

      <main className="main-content">
        <div className="page-body">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div>
              {/* All-time stats */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>All Time</div>
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                {[
                  { label: 'Total Orders', val: orders.length, sub: `${successOrders.length} successful`, icon: '📦', bg: 'rgba(14,165,233,0.12)', color: 'var(--accent2)' },
                  { label: 'Total Revenue', val: fmt(totalRevenue), sub: 'From all sales', accent: true, icon: '₵', bg: 'var(--accent-dim)', color: 'var(--accent)' },
                  { label: 'Net Profit', val: fmt(totalProfit), sub: 'Your margin', accent: true, icon: '📈', bg: 'rgba(16,185,129,0.12)', color: 'var(--ok)' },
                  { label: 'Active Agents', val: agents.filter(a => a.status === 'active').length, sub: pendingAgents > 0 ? `${pendingAgents} pending` : 'All active', icon: '👥', bg: 'rgba(245,158,11,0.12)', color: 'var(--warn)' },
                ].map(s => (
                  <div key={s.label} className={`stat-card${s.accent ? ' accent' : ''}`}>
                    <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18 }}>{s.icon}</div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-val">{s.val}</div>
                    <div className="stat-sub">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Today stats */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Today</div>
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                {[
                  { label: "Today's Orders", val: todayOrders.length, sub: todayOrders.length === 1 ? '1 sale today' : `${todayOrders.length} sales today`, icon: '🛒', bg: 'rgba(14,165,233,0.12)', color: 'var(--accent2)' },
                  { label: "Today's Revenue", val: fmt(todayRevenue), sub: todayOrders.length === 0 ? 'No sales yet' : `Across ${todayOrders.length} order${todayOrders.length > 1 ? 's' : ''}`, accent: true, icon: '💰', bg: 'var(--accent-dim)', color: 'var(--accent)' },
                  { label: "Today's Profit", val: fmt(todayProfit), sub: 'Your cut today', accent: true, icon: '✨', bg: 'rgba(16,185,129,0.12)', color: 'var(--ok)' },
                ].map(s => (
                  <div key={s.label} className={`stat-card${s.accent ? ' accent' : ''}`}>
                    <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18 }}>{s.icon}</div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-val">{s.val}</div>
                    <div className="stat-sub">{s.sub}</div>
                  </div>
                ))}
              </div>

              <AdminAiInsights
                orders={orders}
                agents={agents}
                withdrawals={withdrawals}
                hubBalance={hubBalance}
                adminPrices={Object.fromEntries(Object.entries(priceEdits).map(([k, v]) => [k, parseFloat(v) || 0]))}
              />

              <AdminCustomerInsights orders={orders} agents={agents} />

              {pendingAgents > 0 && (
                <div className="alert alert-warn" style={{ marginBottom: 20 }}>
                  <span>⚠</span>
                  <span><strong>{pendingAgents} agent(s)</strong> awaiting approval. <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setTab('agents')}>Review Now</button></span>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <div className="card-title">Recent Orders</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab('orders')}>View All</button>
                </div>
                <div style={{ padding: '0 0 4px' }}>
                  {orders.length === 0
                    ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders yet</div></div>
                    : orders.slice(0, 5).map(o => (
                      <div key={o.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <NetworkBadge network={o.network} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{o.reference}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{o.size} · {o.phone} · {fmtDate(o.created_at)}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                          <StatusBadge status={o.status} />
                          <DeliveryBadge status={o.delivery_status} />
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(o.admin_price || 0)}</span>
                          {(['failed','pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success' && (
                            <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: '#f87171', border: '1px solid rgba(239,68,68,.4)' }} onClick={() => retryDelivery(o.id)}>↺ Retry</button>
                          )}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}

          {/* ORDERS */}
          {tab === 'orders' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="tab-nav">
                  {['all','success','pending','failed'].map(f => (
                    <button key={f} className={`tab-btn${orderFilter === f ? ' active' : ''}`} onClick={() => setOrderFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filteredOrders as unknown as Record<string, unknown>[], 'all-orders')}>⬇ CSV</button>
              </div>
              <div className="card">
                {filteredOrders.length === 0
                  ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders found</div></div>
                  : filteredOrders.map(o => {
                    const isOpen = expandedOrderId === o.id;
                    const canRetry = (['failed','pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success';
                    const canMarkDone = (['pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success';
                    return (
                      <div key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        {/* Collapsed row */}
                        <button
                          onClick={() => setExpandedOrderId(isOpen ? null : o.id)}
                          style={{ width: '100%', background: 'none', border: 'none', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left' }}
                        >
                          <NetworkBadge network={o.network} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.reference}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(o.created_at)}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <DeliveryBadge status={o.delivery_status} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{fmt(o.agent_price || o.admin_price || 0)}</span>
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                          </div>
                        </button>
                        {/* Expanded details */}
                        {isOpen && (
                          <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                            <div><span style={{ color: 'var(--text3)' }}>Bundle</span><br /><strong>{o.size}</strong></div>
                            <div><span style={{ color: 'var(--text3)' }}>Phone</span><br /><strong>{o.phone}</strong></div>
                            <div><span style={{ color: 'var(--text3)' }}>Payment</span><br /><StatusBadge status={o.status} /></div>
                            <div><span style={{ color: 'var(--text3)' }}>Delivery</span><br /><DeliveryBadge status={o.delivery_status} /></div>
                            <div><span style={{ color: 'var(--text3)' }}>Source</span><br /><strong>{o.source || 'main'}</strong></div>
                            <div><span style={{ color: 'var(--text3)' }}>Your Profit</span><br /><strong style={{ color: 'var(--ok)' }}>{fmt(o.admin_profit || 0)}</strong></div>
                            {(canRetry || canMarkDone) && (
                              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                {canRetry && <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: '#f87171', border: '1px solid rgba(239,68,68,.4)' }} onClick={() => retryDelivery(o.id)}>↺ Retry Delivery</button>}
                                {canMarkDone && <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }} onClick={() => markDelivered(o.id)}>✓ Mark Delivered</button>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            </div>
          )}

          {/* AGENTS */}
          {tab === 'agents' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="tab-nav">
                  {(['all','pending','active','suspended','inactive'] as const).map(f => (
                    <button key={f} className={`tab-btn${agentFilter === f ? ' active' : ''}`} onClick={() => setAgentFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {f === 'pending' && pendingAgents > 0 && <span style={{ marginLeft: 6, background: 'var(--err)', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 5px' }}>{pendingAgents}</span>}
                      {f === 'inactive' && inactiveCount > 0 && <span style={{ marginLeft: 6, background: '#f59e0b', color: '#000', borderRadius: 100, fontSize: 10, padding: '1px 5px' }}>{inactiveCount}</span>}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>
                  <span>Flag inactive after</span>
                  <input type="number" min={7} max={180} value={inactiveDays} onChange={e => setInactiveDays(Number(e.target.value))} style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, textAlign: 'center' }} />
                  <span>days</span>
                </div>
              </div>
              <div className="card">
                <div className="table-wrap">
                  {filteredAgents.length === 0
                    ? <div className="empty"><div className="empty-icon">👥</div><div className="empty-title">No agents found</div></div>
                    : (
                      <table>
                        <thead><tr><th>Agent</th><th>Store</th><th>Activity</th><th>Last Sale</th><th>Today</th><th>All-Time</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                          {filteredAgents.map(a => {
                            const s = agentStats[a.id];
                            const level = getActivityLevel(a.id, a.created_at);
                            const dot = level === 'active' ? { color: 'var(--ok)', label: 'Active' } : level === 'slow' ? { color: '#f59e0b', label: 'Slow' } : { color: 'var(--err)', label: 'Inactive' };
                            return (
                              <tr key={a.id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.email}</div>
                                </td>
                                <td><a href={`/store/${a.slug}`} style={{ color: 'var(--accent)', fontSize: 12 }} target="_blank" rel="noopener noreferrer">/store/{a.slug}</a></td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, color: dot.color, fontWeight: 600 }}>{dot.label}</span>
                                  </div>
                                  {s?.daysSince !== null && s?.daysSince !== undefined && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.daysSince}d ago</div>}
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{s?.lastSale ? fmtDate(s.lastSale) : <span style={{ color: 'var(--err)', fontSize: 11 }}>Never</span>}</td>
                                <td>
                                  {s?.todayOrders ? (
                                    <div style={{ fontSize: 12 }}>
                                      <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.todayOrders} sale{s.todayOrders > 1 ? 's' : ''}</div>
                                      <div style={{ color: 'var(--text2)', marginTop: 1 }}>{fmt(s.todayRevenue)}</div>
                                      <div style={{ color: 'var(--ok)', fontSize: 11 }}>+{fmt(s.todayProfit)} profit</div>
                                    </div>
                                  ) : <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>}
                                </td>
                                <td>
                                  <div style={{ fontSize: 12 }}>
                                    <div style={{ fontWeight: 700 }}>{s?.totalOrders ?? 0} sale{(s?.totalOrders ?? 0) !== 1 ? 's' : ''}</div>
                                    <div style={{ color: 'var(--text2)', marginTop: 1 }}>{fmt(s?.totalRevenue ?? 0)}</div>
                                    <div style={{ color: 'var(--ok)', fontSize: 11 }}>+{fmt(s?.totalProfit ?? 0)} profit</div>
                                  </div>
                                </td>
                                <td><StatusBadge status={a.status} /></td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {a.status === 'pending' && <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }} onClick={() => updateAgent(a.id, 'active')}>Approve</button>}
                                    {a.status === 'active' && <button className="btn btn-sm" style={{ background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid var(--warn)' }} onClick={() => updateAgent(a.id, 'suspended')}>Suspend</button>}
                                    {a.status === 'suspended' && <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }} onClick={() => updateAgent(a.id, 'active')}>Reactivate</button>}
                                    <button className="btn btn-sm" style={{ background: 'var(--err-dim)', color: 'var(--err)', border: '1px solid var(--err)' }} onClick={() => deleteAgent(a.id, a.auth_user_id || '')}>Delete</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* BASE PRICES */}
          {tab === 'prices' && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                <span>ℹ</span>
                <span><strong>My Store Price</strong> = what customers pay on your main ADMUNZ store. <strong>Agent Min</strong> = the lowest price agents are allowed to charge. These are independent — set them separately.</span>
              </div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><div className="card-title">Bulk Pricing Tools</div></div>
                <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className="form-input" style={{ width: 80 }} type="number" placeholder="%" value={bulkMarkup} onChange={e => setBulkMarkup(e.target.value)} />
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>% above Hubnet cost</span>
                  <button className="btn btn-secondary btn-sm" onClick={applyBulkMarkup}>Apply Markup</button>
                  <button className="btn btn-primary btn-sm" onClick={saveAdminPrices} disabled={savingPrices}>
                    {savingPrices ? <><span className="spinner" /> Saving…</> : '💾 Save Prices'}
                  </button>
                </div>
              </div>

              {(['mtn','at','telecel'] as const).map(net => (
                <div key={net} className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className={`net-badge ${net}`}>{NET_NAMES[net][0]}</div>
                      <div className="card-title">{NET_NAMES[net]}</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="price-grid">
                      {BUNDLES[net].map(b => {
                        const storePx = parseFloat(storeEdits[b.key] || '0');
                        const agentMin = parseFloat(priceEdits[b.key] || '0');
                        const storeProfit = isNaN(storePx) ? 0 : storePx - b.cost;
                        const agentProfit = isNaN(agentMin) ? 0 : agentMin - b.cost;
                        return (
                          <div key={b.key} className="price-card">
                            <div>
                              <div className="price-size">{b.size}</div>
                              <div className="price-meta">Cost: {fmt(b.cost)}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>My Store</div>
                                <div className="price-input-wrap">
                                  <span className="price-prefix">₵</span>
                                  <input className="price-field" type="number" step="0.50" value={storeEdits[b.key] || ''} onChange={e => setStoreEdits(prev => ({ ...prev, [b.key]: e.target.value }))} />
                                </div>
                                <div className="profit-tag" style={{ marginTop: 3 }}>+{fmt(storeProfit)} margin</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Agent Min</div>
                                <div className="price-input-wrap">
                                  <span className="price-prefix">₵</span>
                                  <input className="price-field" type="number" step="0.50" value={priceEdits[b.key] || ''} onChange={e => setPriceEdits(prev => ({ ...prev, [b.key]: e.target.value }))} />
                                </div>
                                <div className="profit-tag" style={{ marginTop: 3, color: 'var(--text3)' }}>+{fmt(agentProfit)} margin</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* WITHDRAWALS */}
          {tab === 'withdrawals' && (
            <div>
              <div className="card">
                <div className="table-wrap">
                  {withdrawals.length === 0
                    ? <div className="empty"><div className="empty-icon">💸</div><div className="empty-title">No withdrawals yet</div></div>
                    : (
                      <table>
                        <thead><tr><th>Date</th><th>Agent</th><th>Amount</th><th>Network</th><th>MoMo No.</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                          {withdrawals.map(w => (
                            <tr key={w.id}>
                              <td style={{ color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(w.requested_at)}</td>
                              <td>{agents.find(a => a.id === w.agent_id)?.name || '—'}</td>
                              <td style={{ fontWeight: 700 }}>{fmt(w.amount)}</td>
                              <td><NetworkBadge network={w.network} /></td>
                              <td className="mono">{w.momo_number}</td>
                              <td>{w.momo_name}</td>
                              <td><StatusBadge status={w.status} /></td>
                              <td>
                                {w.status === 'pending' && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }} onClick={() => resolveWithdrawal(w.id, 'paid')}>Mark Paid</button>
                                    <button className="btn btn-sm" style={{ background: 'var(--err-dim)', color: 'var(--err)', border: '1px solid var(--err)' }} onClick={() => resolveWithdrawal(w.id, 'rejected')}>Reject</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* FINANCE */}
          {tab === 'finance' && (
            <FinanceTab orders={orders} withdrawals={withdrawals} agents={agents} hubBalance={hubBalance} />
          )}
	  {/* SUPPORT */}
{tab === 'support' && (
  <AdminSupportTab
    authFetch={authFetch}
    toast={toast}
  />
)}
         {/* SETTINGS */}
{tab === 'settings' && (
  <>
    <ProviderToggle authFetch={authFetch} toast={toast} />
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">Email Notifications</div>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>
          Test that your email alerts are working correctly.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const r = await authFetch('/api/admin/test-email', {
                method: 'POST',
                body: JSON.stringify({ type: 'withdrawal' }),
              });

              const d = await r.json();

              toast(
                d.ok ? 'Test withdrawal email sent!' : 'Failed: ' + d.error,
                d.ok ? 'success' : 'error'
              );
            }}
          >
            📧 Test Withdrawal Email
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const r = await authFetch('/api/admin/test-email', {
                method: 'POST',
                body: JSON.stringify({ type: 'low_wallet' }),
              });

              const d = await r.json();

              toast(
                d.ok ? 'Test wallet alert sent!' : 'Failed: ' + d.error,
                d.ok ? 'success' : 'error'
              );
            }}
          >
            🔔 Test Low Wallet Alert
          </button>
        </div>
      </div>
    </div>

    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">API Information</div>
        </div>

        <div className="card-body">
          {[
            {
              label: 'XpresPortal Webhook URL',
              val: `${
                process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com'
              }/api/xpresportal/webhook`,
            },
            {
              label: 'Paystack Callback URL',
              val: `${
                process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
              }/api/paystack/verify`,
            },
            {
              label: 'Paystack Webhook URL',
              val: `${
                process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
              }/api/paystack/webhook`,
            },
          ].map((row) => (
            <div key={row.label} className="form-group">
              <label className="form-label">{row.label}</label>

              <div className="copy-box">
                <span className="copy-url">{row.val}</span>

                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(row.val);
                    toast('Copied!', 'success', 1500);
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">XpresPortal Balance</div>
        </div>

        <div className="card-body">
          <div
            style={{
              fontFamily: 'Syne,sans-serif',
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--accent)',
              marginBottom: 12,
            }}
          >
            {hubBalance !== null ? fmt(hubBalance) : '—'}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const r = await fetch('/api/hubnet/balance')
                .then((x) => x.json())
                .catch(() => null);

              if (r?.balance !== undefined) {
                setHubBalance(r.balance);
                toast('Balance refreshed', 'success');
              }
            }}
          >
            ↻ Refresh Balance
          </button>
        </div>
      </div>
    </div>
  </>
)}

        </div>
      </main>

      <ToastContainer />
    </div>
  );
}
