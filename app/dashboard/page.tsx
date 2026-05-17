'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { BUNDLES, NET_NAMES, getDefaultAdminPrice } from '@/lib/bundles';
import { fmt, fmtDate, exportCSV } from '@/lib/utils';
import { useSimpleToast } from '@/components/ui/Toast';
import { StatusBadge, NetworkBadge, DeliveryBadge } from '@/components/ui/Badge';
import type { Agent, Order, AgentPrice, AdminPrice, Withdrawal } from '@/types';

type Tab = 'overview' | 'prices' | 'orders' | 'earnings' | 'store';

export default function DashboardPage() {
  const { toast, ToastContainer } = useSimpleToast();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Data
  const [orders, setOrders] = useState<Order[]>([]);
  const [agentPrices, setAgentPrices] = useState<Record<string, number>>({});
  const [adminPrices, setAdminPrices] = useState<Record<string, number>>({});
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  // Price editing
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [bulkMarkup, setBulkMarkup] = useState('');

  // Withdrawal form
  const [wAmount, setWAmount] = useState('');
  const [wMomo, setWMomo] = useState('');
  const [wName, setWName] = useState('');
  const [wNet, setWNet] = useState('mtn');
  const [wLoading, setWLoading] = useState(false);

  // Order filter
  const [orderFilter, setOrderFilter] = useState('all');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const loadData = useCallback(async (agentId: string) => {
    const [ordersRes, agentPricesRes, adminPricesRes, withdrawalsRes] = await Promise.all([
      fetch(`/api/orders?agentId=${agentId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/agents/prices?agentId=${agentId}`).then(r => r.json()).catch(() => []),
      fetch('/api/admin/prices').then(r => r.json()).catch(() => []),
      fetch(`/api/withdrawals?agentId=${agentId}`).then(r => r.json()).catch(() => []),
    ]);

    setOrders(Array.isArray(ordersRes) ? ordersRes : []);

    const apMap: Record<string, number> = {};
    (Array.isArray(adminPricesRes) ? adminPricesRes : []).forEach((p: AdminPrice) => { apMap[p.bundle_key] = p.selling_price; });
    setAdminPrices(apMap);

    const agpMap: Record<string, number> = {};
    const edits: Record<string, string> = {};
    (Array.isArray(agentPricesRes) ? agentPricesRes : []).forEach((p: AgentPrice) => {
      agpMap[p.bundle_key] = p.agent_price;
      edits[p.bundle_key] = String(p.agent_price);
    });
    setAgentPrices(agpMap);

    // Init edits with agent prices or admin prices as defaults
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => {
        if (!edits[b.key]) {
          const floor = apMap[b.key] ?? getDefaultAdminPrice(b.cost);
          edits[b.key] = String(floor);
        }
      });
    });
    setPriceEdits(edits);
    setWithdrawals(Array.isArray(withdrawalsRes) ? withdrawalsRes : []);
  }, []);

  useEffect(() => {
    fetch('/api/agents/me')
      .then(r => r.json())
      .then(async ({ agent: agentData }) => {
        if (!agentData || agentData.status !== 'active') {
          await getSupabaseClient().auth.signOut();
          window.location.href = '/login';
          return;
        }
        setAgent(agentData);
        setLoading(false);
        await loadData(agentData.id);
      })
      .catch(() => { window.location.href = '/login'; });
  }, [loadData]);

  async function logout() {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  const successOrders = orders.filter(o => o.status === 'success');
  const totalEarned = successOrders.reduce((s, o) => s + (o.agent_profit || 0), 0);
  const totalWithdrawn = withdrawals.filter(w => ['approved', 'paid'].includes(w.status)).reduce((s, w) => s + w.amount, 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
  const available = totalEarned - totalWithdrawn - pendingWithdrawals;

  const onboardSteps = [
    { label: 'Account Created', done: true, sub: 'You\'re registered and approved' },
    { label: 'Set Your Prices', done: Object.keys(agentPrices).length > 0, sub: 'Set prices in My Prices tab' },
    { label: 'Share Your Store Link', done: false, sub: `${siteUrl}/store/${agent?.slug}` },
    { label: 'Make Your First Sale', done: orders.length > 0, sub: orders.length > 0 ? `${orders.length} orders so far` : 'Share your store and start earning' },
    { label: 'Request Your First Payout', done: withdrawals.length > 0, sub: 'Use the Earnings tab' },
  ];
  const onboardProgress = onboardSteps.filter(s => s.done).length;

  async function savePrices() {
    if (!agent) return;
    setSavingPrices(true);
    try {
      const prices = Object.keys(BUNDLES).flatMap(net =>
        BUNDLES[net].map(b => ({
          bundleKey: b.key,
          network: net,
          size: b.size,
          volume: b.volume,
          hubnetCost: b.cost,
          adminPrice: adminPrices[b.key] ?? getDefaultAdminPrice(b.cost),
          agentPrice: parseFloat(priceEdits[b.key] || '0') || (adminPrices[b.key] ?? getDefaultAdminPrice(b.cost)),
          validity: b.validity,
        }))
      );
      const res = await fetch('/api/agents/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, prices }),
      });
      if (res.ok) { toast('Prices saved!', 'success'); await loadData(agent.id); }
      else { const d = await res.json(); toast(d.error || 'Failed to save prices', 'error'); }
    } catch { toast('Network error', 'error'); }
    finally { setSavingPrices(false); }
  }

  function applyBulkMarkup() {
    const pct = parseFloat(bulkMarkup);
    if (isNaN(pct)) return;
    const newEdits = { ...priceEdits };
    Object.keys(BUNDLES).forEach(net => {
      BUNDLES[net].forEach(b => {
        const floor = adminPrices[b.key] ?? getDefaultAdminPrice(b.cost);
        newEdits[b.key] = (floor * (1 + pct / 100)).toFixed(2);
      });
    });
    setPriceEdits(newEdits);
  }

  async function requestWithdrawal() {
    if (!agent) return;
    const amount = parseFloat(wAmount);
    if (isNaN(amount) || amount <= 0) { toast('Enter a valid amount', 'warn'); return; }
    if (amount < 20) { toast('Minimum withdrawal is GHS 20.00', 'warn'); return; }
    if (amount > available) { toast(`Max available: ${fmt(available)}`, 'warn'); return; }
    if (!wMomo || !wName) { toast('Enter MoMo number and name', 'warn'); return; }
    setWLoading(true);
    try {
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, amount, momoNumber: wMomo, momoName: wName, network: wNet, type: 'agent' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast('Withdrawal request submitted!', 'success');
        setWAmount(''); setWMomo(''); setWName('');
        await loadData(agent.id);
      } else {
        toast(data.error || 'Request failed', 'error');
      }
    } catch { toast('Network error', 'error'); }
    finally { setWLoading(false); }
  }

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M3 12h18M3 17h18"/></svg> },
    { id: 'prices', label: 'My Prices', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg> },
    { id: 'orders', label: 'My Orders', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
    { id: 'earnings', label: 'Earnings', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
    { id: 'store', label: 'My Store', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg> },
  ];

  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px', borderColor: 'rgba(0,212,170,0.2)', borderTopColor: 'var(--accent)' }} />
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading dashboard…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-layout">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)} />}

      {/* SIDEBAR */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">{agent?.name?.[0] || 'A'}</div>
          <div className="logo-text">
            <strong>{agent?.name?.split(' ')[0] || 'Agent'}</strong>
            <span>{agent?.slug}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div>
            <div className="nav-section-label">Menu</div>
            {navItems.map(item => (
              <button key={item.id} className={`nav-item${tab === item.id ? ' active' : ''}`} onClick={() => { setTab(item.id); setSidebarOpen(false); }}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-balance">
            <div className="sidebar-balance-label">Available Balance</div>
            <div className="sidebar-balance-val">{fmt(available)}</div>
          </div>
          <button className="nav-item" onClick={logout} style={{ width: '100%', color: 'var(--err)' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* TOPBAR */}
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="menu-btn" onClick={() => setSidebarOpen(v => !v)}>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <span className="topbar-title">{navItems.find(n => n.id === tab)?.label}</span>
        </div>
        <div className="topbar-right">
          <div className="topbar-avatar">{agent?.name?.[0]}</div>
        </div>
      </header>

      {/* MAIN */}
      <main className="main-content">
        <div className="page-body">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div>
              <div className="stats-grid">
                {[
                  { label: 'Total Orders', val: orders.length, sub: `${successOrders.length} successful`, icon: '📦', bg: 'rgba(14,165,233,0.12)', color: 'var(--accent2)' },
                  { label: 'Total Earned', val: fmt(totalEarned), sub: 'From all sales', accent: true, icon: '📈', bg: 'rgba(16,185,129,0.12)', color: 'var(--ok)' },
                  { label: 'Available', val: fmt(available), sub: 'Ready to withdraw', accent: true, icon: '₵', bg: 'var(--accent-dim)', color: 'var(--accent)' },
                  { label: 'Withdrawn', val: fmt(totalWithdrawn), sub: 'To MoMo', icon: '💳', bg: 'rgba(245,158,11,0.12)', color: 'var(--warn)' },
                ].map(s => (
                  <div key={s.label} className={`stat-card${s.accent ? ' accent' : ''}`}>
                    <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18 }}>{s.icon}</div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-val">{s.val}</div>
                    <div className="stat-sub">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Onboarding */}
              {onboardProgress < onboardSteps.length && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">Getting Started</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{onboardProgress}/{onboardSteps.length} completed</div>
                    </div>
                    <div style={{ width: 120, height: 6, background: 'var(--surface3)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ width: `${(onboardProgress / onboardSteps.length) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 100, transition: 'width .5s ease' }} />
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="onboard-list">
                      {onboardSteps.map((s, i) => (
                        <div key={i} className={`onboard-step${s.done ? ' done' : ''}`}>
                          <div className="step-check">{s.done ? '✓' : i + 1}</div>
                          <div>
                            <div className="step-text">{s.label}</div>
                            <div className="step-sub">{s.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent orders */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Recent Orders</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab('orders')}>View All</button>
                </div>
                <div className="table-wrap">
                  {orders.length === 0
                    ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders yet</div><div className="empty-text">Share your store to start selling</div></div>
                    : (
                      <table>
                        <thead><tr><th>Reference</th><th>Bundle</th><th>Phone</th><th>Earned</th><th>Payment</th><th>Delivery</th><th>Date</th></tr></thead>
                        <tbody>
                          {orders.slice(0, 8).map(o => (
                            <tr key={o.id}>
                              <td><span className="mono">{o.reference}</span></td>
                              <td><NetworkBadge network={o.network} /><span style={{ marginLeft: 8 }}>{o.size}</span></td>
                              <td>{o.phone}</td>
                              <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(o.agent_profit || 0)}</td>
                              <td><StatusBadge status={o.status} /></td>
                              <td><DeliveryBadge status={o.delivery_status} /></td>
                              <td style={{ color: 'var(--text3)' }}>{fmtDate(o.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ── MY PRICES ── */}
          {tab === 'prices' && (
            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <div className="card-title">Bulk Markup</div>
                </div>
                <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input className="form-input" style={{ width: 80 }} type="number" placeholder="%" value={bulkMarkup} onChange={e => setBulkMarkup(e.target.value)} />
                    <span style={{ fontSize: 13, color: 'var(--text3)' }}>% markup above admin floor</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={applyBulkMarkup}>Apply to All</button>
                  <button className="btn btn-primary btn-sm" onClick={savePrices} disabled={savingPrices}>
                    {savingPrices ? <><span className="spinner" /> Saving…</> : '💾 Save All Prices'}
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
                        const floor = adminPrices[b.key] ?? getDefaultAdminPrice(b.cost);
                        const val = parseFloat(priceEdits[b.key] || '0');
                        const profit = isNaN(val) ? 0 : val - floor;
                        const belowFloor = val < floor;
                        return (
                          <div key={b.key} className="price-card">
                            <div>
                              <div className="price-size">{b.size}</div>
                              <div className="price-meta">Floor: {fmt(floor)}</div>
                              {belowFloor
                                ? <div className="floor-warn">Below floor!</div>
                                : <div className="profit-tag">+{fmt(profit)} profit</div>}
                            </div>
                            <div className="price-input-wrap">
                              <span className="price-prefix">₵</span>
                              <input
                                className={`price-field${belowFloor ? ' error' : ''}`}
                                type="number"
                                step="0.50"
                                value={priceEdits[b.key] || ''}
                                onChange={e => setPriceEdits(prev => ({ ...prev, [b.key]: e.target.value }))}
                              />
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

          {/* ── MY ORDERS ── */}
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
                <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filteredOrders as unknown as Record<string, unknown>[], 'my-orders')}>⬇ Export CSV</button>
              </div>
              <div className="card">
                <div className="table-wrap">
                  {filteredOrders.length === 0
                    ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders found</div></div>
                    : (
                      <table>
                        <thead><tr><th>Reference</th><th>Network</th><th>Bundle</th><th>Phone</th><th>Revenue</th><th>Profit</th><th>Payment</th><th>Delivery</th><th>Date</th></tr></thead>
                        <tbody>
                          {filteredOrders.map(o => (
                            <tr key={o.id}>
                              <td><span className="mono">{o.reference}</span></td>
                              <td><NetworkBadge network={o.network} /></td>
                              <td>{o.size}</td>
                              <td>{o.phone}</td>
                              <td>{fmt(o.agent_price || 0)}</td>
                              <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(o.agent_profit || 0)}</td>
                              <td><StatusBadge status={o.status} /></td>
                              <td><DeliveryBadge status={o.delivery_status} /></td>
                              <td style={{ color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ── EARNINGS ── */}
          {tab === 'earnings' && (
            <div>
              <div className="withdraw-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <svg width="18" height="18" fill="none" stroke="var(--accent)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Available to Withdraw</span>
                </div>
                <div className="earn-bal">{fmt(available)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 20 }}>
                  {[
                    { label: 'Total Earned', val: fmt(totalEarned) },
                    { label: 'Withdrawn', val: fmt(totalWithdrawn) },
                    { label: 'Pending', val: fmt(pendingWithdrawals) },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800 }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <div className="card-title">Request Withdrawal</div>
                    <div style={{ fontSize: 11, color: available >= 20 ? 'var(--ok)' : 'var(--warn)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {available >= 20 ? `GHS ${available.toFixed(2)} available` : `GHS ${fmt(available)} / GHS 20.00 min`}
                    </div>
                </div>
                <div className="card-body">
                  {available < 20 && (
                    <div className="alert alert-warn" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
                      You need at least <strong style={{ display: 'inline', whiteSpace: 'nowrap' }}>GHS 20.00</strong> to request a withdrawal. Keep selling to accumulate earnings!
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Amount (GHS)</label>
                      <input className="form-input" type="number" min="20" placeholder="Min: 20.00" value={wAmount} onChange={e => setWAmount(e.target.value)} />
                      <div className="form-hint">Min GHS 20.00 · Max {fmt(available)}</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">MoMo Network</label>
                      <select className="form-input" value={wNet} onChange={e => setWNet(e.target.value)}>
                        <option value="mtn">MTN MoMo</option>
                        <option value="telecel">Telecel Cash</option>
                        <option value="at">AirtelTigo Money</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">MoMo Number</label>
                      <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={wMomo} onChange={e => setWMomo(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Account Name</label>
                      <input className="form-input" placeholder="Name on MoMo account" value={wName} onChange={e => setWName(e.target.value)} />
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={requestWithdrawal} disabled={wLoading || available < 20}>
                    {wLoading ? <><span className="spinner" /> Sending…</> : available < 20 ? `Need GHS ${(20 - available).toFixed(2)} more` : '💸 Request Withdrawal'}
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><div className="card-title">Withdrawal History</div></div>
                <div className="table-wrap">
                  {withdrawals.length === 0
                    ? <div className="empty"><div className="empty-icon">💸</div><div className="empty-title">No withdrawals yet</div></div>
                    : (
                      <table>
                        <thead><tr><th>Date</th><th>Amount</th><th>Network</th><th>MoMo No.</th><th>Status</th></tr></thead>
                        <tbody>
                          {withdrawals.map(w => (
                            <tr key={w.id}>
                              <td style={{ color: 'var(--text3)' }}>{fmtDate(w.requested_at)}</td>
                              <td style={{ fontWeight: 700 }}>{fmt(w.amount)}</td>
                              <td><NetworkBadge network={w.network} /></td>
                              <td className="mono">{w.momo_number}</td>
                              <td><StatusBadge status={w.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ── MY STORE ── */}
          {tab === 'store' && agent && (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><div className="card-title">Store Details</div></div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label">Store Name</label>
                    <input className="form-input" value={agent.name || ''} readOnly />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Store URL</label>
                    <div className="copy-box">
                      <span className="copy-url">{siteUrl}/store/{agent.slug}</span>
                      <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(`${siteUrl}/store/${agent.slug}`); toast('Copied!', 'success', 2000); }}>Copy</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Share on WhatsApp</label>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Buy data bundles from my store: ${siteUrl}/store/${agent.slug}`)}`}
                      className="btn btn-sm"
                      style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', display: 'inline-flex' }}
                      target="_blank" rel="noopener noreferrer"
                    >
                      Share on WhatsApp
                    </a>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><div className="card-title">QR Code</div></div>
                <div className="card-body" style={{ textAlign: 'center', padding: 32 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${siteUrl}/store/${agent.slug}`)}&bgcolor=0d1117&color=00d4aa&margin=10`}
                    alt="Store QR Code"
                    style={{ width: 200, height: 200, margin: '0 auto 16px', borderRadius: 12, border: '1px solid var(--border)' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>Scan to visit your store</div>
                  <a
                    href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`${siteUrl}/store/${agent.slug}`)}&bgcolor=0d1117&color=00d4aa&margin=10`}
                    download="store-qr.png"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 14, display: 'inline-flex' }}
                  >
                    ⬇ Download QR Code
                  </a>
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
