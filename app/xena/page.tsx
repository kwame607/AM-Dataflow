'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { BUNDLES, NET_NAMES, getDefaultAdminPrice } from '@/lib/bundles';
import { fmt, fmtDate, exportCSV } from '@/lib/utils';
import { useSimpleToast } from '@/components/ui/Toast';
import { StatusBadge, NetworkBadge, DeliveryBadge } from '@/components/ui/Badge';
import type { Agent, Order, AdminPrice, Withdrawal } from '@/types';

type Tab = 'overview' | 'orders' | 'agents' | 'prices' | 'withdrawals' | 'settings';

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

  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [bulkMarkup, setBulkMarkup] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');

  const loadAll = useCallback(async () => {
    const [ordersRes, agentsRes, pricesRes, withdrawalsRes, balRes] = await Promise.all([
      fetch('/api/orders').then(r => r.json()).catch(() => []),
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
    prices.forEach((p: AdminPrice) => { edits[p.bundle_key] = String(p.selling_price); });
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => { if (!edits[b.key]) edits[b.key] = String(getDefaultAdminPrice(b.cost)); });
    });
    setPriceEdits(edits);
    setWithdrawals(Array.isArray(withdrawalsRes) ? withdrawalsRes : []);
    if (balRes?.balance !== undefined) setHubBalance(balRes.balance);
  }, []);

  useEffect(() => {
    setLoading(false);
    loadAll();
  }, [loadAll]);

  async function logout() { await getSupabaseClient().auth.signOut(); window.location.href = '/xena/login'; }

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
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => { newEdits[b.key] = (b.cost * (1 + pct / 100)).toFixed(2); });
    });
    setPriceEdits(newEdits);
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

  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);
  const filteredAgents = agentFilter === 'all' ? agents : agents.filter(a => a.status === agentFilter);

  const navItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M3 12h18M3 17h18"/></svg> },
    { id: 'orders', label: 'Orders', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
    { id: 'agents', label: 'Agents', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>, badge: pendingAgents },
    { id: 'prices', label: 'Base Prices', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg> },
    { id: 'withdrawals', label: 'Withdrawals', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>, badge: pendingWithdrawals },
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
          <div className="logo-mark" style={{ background: 'var(--accent2)' }}>A</div>
          <div className="logo-text"><strong>Admin Panel</strong><span>ADOMUN</span></div>
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
              <div className="sidebar-balance-label">Hubnet Balance</div>
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
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>ADOMUN — Admin</div>
          </div>
        </div>
        <div className="topbar-right">
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
              <div className="stats-grid">
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
                <div className="table-wrap">
                  {orders.length === 0
                    ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders yet</div></div>
                    : (
                      <table>
                        <thead><tr><th>Reference</th><th>Network</th><th>Bundle</th><th>Phone</th><th>Revenue</th><th>Profit</th><th>Source</th><th>Payment</th><th>Delivery</th><th>Date</th><th>Action</th></tr></thead>
                        <tbody>
                          {orders.slice(0, 10).map(o => (
                            <tr key={o.id}>
                              <td><span className="mono">{o.reference}</span></td>
                              <td><NetworkBadge network={o.network} /></td>
                              <td>{o.size}</td>
                              <td>{o.phone}</td>
                              <td>{fmt(o.admin_price || 0)}</td>
                              <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(o.admin_profit || 0)}</td>
                              <td style={{ color: 'var(--text3)' }}>{o.source || 'main'}</td>
                              <td><StatusBadge status={o.status} /></td>
                              <td><DeliveryBadge status={o.delivery_status} /></td>
                              <td style={{ color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                              <td style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                                {(['failed','pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success' && (
                                  <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: '#f87171', border: '1px solid rgba(239,68,68,.4)', whiteSpace: 'nowrap' }} onClick={() => retryDelivery(o.id)}>↺ Retry</button>
                                )}
                                {(['pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success' && (
                                  <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)', whiteSpace: 'nowrap' }} onClick={() => markDelivered(o.id)}>✓ Done</button>
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

          {/* ORDERS */}
          {tab === 'orders' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="tab-nav">
                  {['all','success','pending','failed'].map(f => (
                    <button key={f} className={`tab-btn${orderFilter === f ? ' active' : ''}`} onClick={() => setOrderFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filteredOrders as unknown as Record<string, unknown>[], 'all-orders')}>⬇ Export CSV</button>
              </div>
              <div className="card">
                <div className="table-wrap">
                  {filteredOrders.length === 0
                    ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders found</div></div>
                    : (
                      <table>
                        <thead><tr><th>Reference</th><th>Network</th><th>Bundle</th><th>Phone</th><th>Agent Price</th><th>Admin Profit</th><th>Source</th><th>Payment</th><th>Delivery</th><th>Date</th><th></th></tr></thead>
                        <tbody>
                          {filteredOrders.map(o => (
                            <tr key={o.id}>
                              <td><span className="mono">{o.reference}</span></td>
                              <td><NetworkBadge network={o.network} /></td>
                              <td>{o.size}</td>
                              <td>{o.phone}</td>
                              <td>{fmt(o.agent_price || o.admin_price || 0)}</td>
                              <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(o.admin_profit || 0)}</td>
                              <td style={{ color: 'var(--text3)' }}>{o.source || 'main'}</td>
                              <td><StatusBadge status={o.status} /></td>
                              <td><DeliveryBadge status={o.delivery_status} /></td>
                              <td style={{ color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                              <td style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                                {(['failed','pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success' && (
                                  <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: '#f87171', border: '1px solid rgba(239,68,68,.4)', whiteSpace: 'nowrap' }} onClick={() => retryDelivery(o.id)}>↺ Retry Delivery</button>
                                )}
                                {(['pending','processing'].includes(o.delivery_status ?? '') || !o.delivery_status) && o.status === 'success' && (
                                  <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)', whiteSpace: 'nowrap' }} onClick={() => markDelivered(o.id)}>✓ Mark Delivered</button>
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

          {/* AGENTS */}
          {tab === 'agents' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="tab-nav">
                  {['all','pending','active','suspended'].map(f => (
                    <button key={f} className={`tab-btn${agentFilter === f ? ' active' : ''}`} onClick={() => setAgentFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {f === 'pending' && pendingAgents > 0 && <span style={{ marginLeft: 6, background: 'var(--err)', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 5px' }}>{pendingAgents}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="table-wrap">
                  {filteredAgents.length === 0
                    ? <div className="empty"><div className="empty-icon">👥</div><div className="empty-title">No agents found</div></div>
                    : (
                      <table>
                        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Store</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                        <tbody>
                          {filteredAgents.map(a => (
                            <tr key={a.id}>
                              <td style={{ fontWeight: 600 }}>{a.name}</td>
                              <td style={{ color: 'var(--text3)' }}>{a.email}</td>
                              <td>{a.phone}</td>
                              <td><a href={`/store/${a.slug}`} style={{ color: 'var(--accent)' }} target="_blank" rel="noopener noreferrer">/store/{a.slug}</a></td>
                              <td><StatusBadge status={a.status} /></td>
                              <td style={{ color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {a.status === 'pending' && <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }} onClick={() => updateAgent(a.id, 'active')}>Approve</button>}
                                  {a.status === 'active' && <button className="btn btn-sm" style={{ background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid var(--warn)' }} onClick={() => updateAgent(a.id, 'suspended')}>Suspend</button>}
                                  {a.status === 'suspended' && <button className="btn btn-sm" style={{ background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid var(--ok)' }} onClick={() => updateAgent(a.id, 'active')}>Reactivate</button>}
                                  <button className="btn btn-sm" style={{ background: 'var(--err-dim)', color: 'var(--err)', border: '1px solid var(--err)' }} onClick={() => deleteAgent(a.id, a.auth_user_id || '')}>Delete</button>
                                </div>
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

          {/* BASE PRICES */}
          {tab === 'prices' && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                <span>ℹ</span>
                <span>Set your <strong>selling prices</strong> to match your Hubnet store (apisolution.net). The &quot;Cost&quot; shown is the estimated Hubnet wholesale cost — update selling prices to what you charge customers.</span>
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

              {(['mtn','at'] as const).map(net => (
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
                        const selling = parseFloat(priceEdits[b.key] || '0');
                        const profit = isNaN(selling) ? 0 : selling - b.cost;
                        return (
                          <div key={b.key} className="price-card">
                            <div>
                              <div className="price-size">{b.size}</div>
                              <div className="price-meta">Cost: {fmt(b.cost)}</div>
                              <div className="profit-tag">+{fmt(profit)} margin</div>
                            </div>
                            <div className="price-input-wrap">
                              <span className="price-prefix">₵</span>
                              <input className="price-field" type="number" step="0.50" value={priceEdits[b.key] || ''} onChange={e => setPriceEdits(prev => ({ ...prev, [b.key]: e.target.value }))} />
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

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><div className="card-title">API Information</div></div>
                <div className="card-body">
                  {[
                    { label: 'Hubnet Webhook URL', val: 'https://hubnet.app/v.1/webhook' },
                    { label: 'Paystack Callback URL', val: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/paystack/verify` },
                    { label: 'Hubnet Callback URL', val: 'https://e-store.apisolution.net/v.1?id=OWR5JNMDKS18A6WS1MGRMRN1UGLBHWRRU9L' },
                  ].map(row => (
                    <div key={row.label} className="form-group">
                      <label className="form-label">{row.label}</label>
                      <div className="copy-box">
                        <span className="copy-url">{row.val}</span>
                        <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(row.val); toast('Copied!', 'success', 1500); }}>Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><div className="card-title">Hubnet Balance</div></div>
                <div className="card-body">
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 12 }}>
                    {hubBalance !== null ? fmt(hubBalance) : '—'}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={async () => {
                    const r = await fetch('/api/hubnet/balance').then(x => x.json()).catch(() => null);
                    if (r?.balance !== undefined) { setHubBalance(r.balance); toast('Balance refreshed', 'success'); }
                  }}>↻ Refresh Balance</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      <nav className="mobile-nav">
        {navItems.map(item => (
          <button key={item.id} className={`mob-btn${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <ToastContainer />
    </div>
  );
}
