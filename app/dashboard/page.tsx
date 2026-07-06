'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { BUNDLES, NET_NAMES, getDefaultAdminPrice } from '@/lib/bundles';
import { fmt, fmtDate, exportCSV } from '@/lib/utils';
import { useSimpleToast } from '@/components/ui/Toast';
import { StatusBadge, NetworkBadge, DeliveryBadge } from '@/components/ui/Badge';
import type { Agent, Order, AgentPrice, AdminPrice, Withdrawal } from '@/types';
import type { SupportTicket } from '@/types/support';
import Image from 'next/image';
import ServiceBanner from '@/components/ui/ServiceBanner';
import { SupportTab } from '@/components/SupportTab';
import { NotificationBell } from '@/components/SupportNotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletTab } from '@/components/WalletTab';
import { AccountDetailsTab } from '@/components/AccountDetailsTab';
import { StoreSettingsTab } from '@/components/StoreSettingsTab';
import type { Wallet } from '@/types/wallet';
import { QuickBuyPanel } from '@/components/QuickBuyPanel';
import { ActivityAndAchievements } from '@/components/ActivityAndAchievements';
import { StatsGridSkeleton, QuickBuySkeleton, ActivityAchievementsSkeleton, RecentOrdersSkeleton, AiInsightsSkeleton, CustomerInsightsSkeleton, RevenueChartSkeleton } from '@/components/OverviewSkeletons';
import { FloatingQuickActions } from '@/components/FloatingQuickActions';
import { CustomerInsights } from '@/components/CustomerInsights';
import { AiInsightsWidget } from '@/components/AiInsightsWidget';
import { RevenueChart } from '@/components/RevenueChart';
import { DeliverySpeedWidget } from '@/components/DeliverySpeedWidget';
import { PriceRecommendationsWidget } from '@/components/PriceRecommendationsWidget';
import { AgentPerformanceCoach } from '@/components/AgentPerformanceCoach';
import { WhatsAppMessageGenerator } from '@/components/WhatsAppMessageGenerator';
import { ReferralTab } from '@/components/ReferralTab';
import { SubAgentPricingTab } from '@/components/SubAgentPricingTab';
import { BundleLinks } from '@/components/BundleLinks';

type Tab = 'overview' | 'wallet' | 'prices' | 'orders' | 'earnings' | 'store' | 'support' | 'account' | 'referral' | 'subagent-prices';

export default function DashboardPage() {
  const { toast, ToastContainer } = useSimpleToast();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatTooltip, setChatTooltip] = useState(false);
  const quickBuyRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportView, setSupportView]     = useState<'list'|'new'|'thread'>('list');
  const [lastActiveTicket, setLastActiveTicket] = useState<SupportTicket | null>(null);

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
  const [orderSearch, setOrderSearch] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL !== 'http://localhost:3000')
    ? process.env.NEXT_PUBLIC_SITE_URL
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const authFetch = useCallback(
  async (url: string, options: RequestInit = {}) => {
    const supabase = getSupabaseClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      },
    });
  },
  []
);
  const loadData = useCallback(async (agentId: string) => {
    // Paginate orders to avoid the default 200/1000 row cap in Supabase.
    // Keeps fetching 500-row pages until we get a short page (end of data).
    const fetchAllOrders = async (): Promise<Order[]> => {
      const PAGE = 500;
      let page = 0;
      const all: Order[] = [];
      while (true) {
        const res = await fetch(
          `/api/orders?agentId=${agentId}&limit=${PAGE}&offset=${page * PAGE}`
        ).then(r => r.json()).catch(() => []);
        const rows: Order[] = Array.isArray(res) ? res : [];
        all.push(...rows);
        if (rows.length < PAGE) break; // reached the last page
        page++;
      }
      return all;
    };

    const [ordersAll, agentPricesRes, adminPricesRes, withdrawalsRes, walletRes] = await Promise.all([
      fetchAllOrders(),
      fetch(`/api/agents/prices?agentId=${agentId}`).then(r => r.json()).catch(() => []),
      fetch('/api/admin/prices').then(r => r.json()).catch(() => []),
      fetch(`/api/withdrawals?agentId=${agentId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/wallet?agentId=${agentId}`).then(r => r.json()).catch(() => null),
    ]);

    setOrders(ordersAll);

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
    if (walletRes && walletRes.wallet) setWallet(walletRes.wallet);
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
        setDataLoading(false);

        // Poll for unread support messages every 30s
        const fetchUnread = async () => {
          try {
            const r = await fetch(`/api/support/unread?agentId=${agentData.id}`);
            const d = await r.json();
            setUnreadCount(d.total || 0);
          } catch {}
        };
        fetchUnread();
        const unreadInterval = setInterval(fetchUnread, 30000);
        return () => clearInterval(unreadInterval);
      })
      .catch(() => { window.location.href = '/login'; });
  }, [loadData]);

  async function logout() {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  function jumpToQuickBuy() {
    setTab('overview');
    // Wait a tick for the Overview tab content to mount before scrolling
    setTimeout(() => {
      quickBuyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  const successOrders = orders.filter(o => o.status === 'success');
  const totalEarned = successOrders.reduce((s, o) => s + (o.agent_profit || 0), 0);
  const totalWithdrawn = withdrawals.filter(w => ['approved', 'paid'].includes(w.status)).reduce((s, w) => s + w.amount, 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);
  const available = totalEarned - totalWithdrawn - pendingWithdrawals;

  const onboardSteps = [
    { label: 'Account Created', done: true, sub: 'You\'re registered and approved' },
    { label: 'Set Your Prices', done: Object.keys(agentPrices).length > 0, sub: 'Set prices in My Prices tab' },
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
    { id: 'wallet', label: 'Wallet', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg> },
    { id: 'account', label: 'Account', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> },
    { id: 'store', label: 'My Store', icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg> },
    {
  id: 'support',
  label: 'Support',
  icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>,
},
{
  id: 'referral',
  label: 'Referral',
  icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
},
// After the referral nav item, add:
...(agent?.can_set_subagent_prices ? [{
  id: 'subagent-prices' as Tab,
  label: 'Sub-Agent Prices',
  icon: <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>,
}] : []),
  ];

  const filteredOrders = orders
    .filter(o => orderFilter === 'all' || o.status === orderFilter)
    .filter(o => {
      if (!orderSearch.trim()) return true;
      const q = orderSearch.trim().toLowerCase();
      return o.reference.toLowerCase().includes(q) || o.phone.includes(q);
    });

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
    <>
      <style>{`
        @keyframes contentFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .content-fade-in { animation: contentFadeIn 0.4s ease both; }
        .content-fade-in.delay-1 { animation-delay: .05s; }
        .content-fade-in.delay-2 { animation-delay: .1s; }
        .content-fade-in.delay-3 { animation-delay: .15s; }
        .content-fade-in.delay-4 { animation-delay: .2s; }
      `}</style>
      <div className="sidebar-layout">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)} />}

      {/* SIDEBAR */}
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
          <ThemeToggle />
          <div className="topbar-avatar">{agent?.name?.[0]}</div>
        </div>
        {agent && (
  <NotificationBell
    authFetch={authFetch}
    agentId={agent.id}
    onOpenTicket={async (ticketId) => {
      try {
        const r = await authFetch(`/api/support/tickets?agentId=${agent.id}`);
        const list = await r.json();
        const match = Array.isArray(list) ? list.find((t: { id: string }) => t.id === ticketId) : null;
        if (match) {
          setLastActiveTicket(match);
          setSupportView('thread');
        } else {
          setSupportView('list');
        }
      } catch {
        setSupportView('list');
      }
      setTab('support');
    }}
  />
)}
      </header>

      {/* MAIN */}
      <main className="main-content">
        <div className="page-body">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div>
              {dataLoading ? (
                <StatsGridSkeleton />
              ) : (
                <div className="stats-grid content-fade-in">
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
              )}
		{agent && (
  <AgentPerformanceCoach
    agent={{ id: agent.id, name: agent.name, slug: agent.slug }}
    orders={orders}
    withdrawals={withdrawals}
    agentPrices={agentPrices}
    authFetch={authFetch}
  />
)}

{agent && (
  <WhatsAppMessageGenerator
    agent={{ id: agent.id, name: agent.name, slug: agent.slug, whatsapp: agent.whatsapp, phone: agent.phone }}
    orders={orders}
    agentPrices={agentPrices}
    siteUrl={siteUrl}
    authFetch={authFetch}
  />
)}
              {dataLoading ? (
                <RevenueChartSkeleton />
              ) : (
                <div className="content-fade-in delay-1">
                  <RevenueChart orders={orders} />
                </div>
              )}
              
              <DeliverySpeedWidget agentId={agent?.id} />

              {/* Quick Buy */}
              {dataLoading ? (
                <QuickBuySkeleton />
              ) : agent && (
                <div ref={quickBuyRef} className="content-fade-in delay-2" style={{ marginTop: 24, marginBottom: 24 }}>
                  <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>⚡ Quick Buy</div>
                  <QuickBuyPanel
                    agent={agent}
                    wallet={wallet}
                    agentPrices={agentPrices}
                    orders={orders}
                    authFetch={authFetch}
                    toast={toast}
                    onOrderPlaced={() => loadData(agent.id)}
                  />
                </div>
              )}

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

              {dataLoading ? (
                <ActivityAchievementsSkeleton />
              ) : (
                <div className="content-fade-in delay-2">
                  <ActivityAndAchievements orders={orders} withdrawals={withdrawals} />
                </div>
              )}

              {dataLoading ? (
                <AiInsightsSkeleton />
              ) : (
                <div className="content-fade-in delay-2">
                  <AiInsightsWidget
                    orders={orders}
                    withdrawals={withdrawals}
                    wallet={wallet}
                    agentPrices={agentPrices}
                    adminPrices={adminPrices}
                  />
                </div>
              )}

              {dataLoading ? (
                <CustomerInsightsSkeleton />
              ) : (
                <div className="content-fade-in delay-3">
                  <CustomerInsights orders={orders} />
                </div>
              )}

              {/* WhatsApp Community */}
              <a
                href="https://chat.whatsapp.com/GWXeMeSXICj3e6KRBLvHQa"
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 'var(--radius)', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', textDecoration: 'none', marginBottom: 20 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" fill="#fff" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.849L0 24l6.335-1.662A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.784 9.784 0 01-5.003-1.376l-.36-.214-3.722.977.993-3.634-.234-.374A9.78 9.78 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818 5.424 0 9.818 4.395 9.818 9.818 0 5.424-4.394 9.818-9.818 9.818z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#25d366' }}>Join the ADMUNZ Agent Community</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Price updates, tips & support from the team</div>
                </div>
                <svg width="16" height="16" fill="none" stroke="#25d366" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.7 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
              </a>

              {/* Recent orders */}
              {dataLoading ? (
                <RecentOrdersSkeleton />
              ) : (
                <div className="card content-fade-in delay-3">
                  <div className="card-header">
                    <div className="card-title">Recent Orders</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setTab('orders')}>View All</button>
                  </div>
                  <div style={{ padding: '0 0 4px' }}>
                    {orders.length === 0
                      ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No orders yet</div><div className="empty-text">Share your store to start selling</div></div>
                      : orders.slice(0, 5).map(o => (
                        <div key={o.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <NetworkBadge network={o.network} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.reference}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{o.size} · {o.phone} · {fmtDate(o.created_at)}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <DeliveryBadge status={o.delivery_status} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ok)' }}>{fmt(o.agent_profit || 0)}</span>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}
          {/* ── MY WALLET ── */}
          {tab === 'wallet' && agent && (
  <WalletTab
    agent={{ id: agent.id, name: agent.name, email: agent.email, slug: agent.slug }}
    authFetch={authFetch}
    toast={toast}
    onWalletUpdate={setWallet}
  />
)}

{tab === 'account' && agent && (
  <AccountDetailsTab
    agent={agent}
    authFetch={authFetch}
    toast={toast}
    onAgentUpdate={() => loadData(agent.id)}
  />
)}

          {/* ── MY PRICES ── */}
          {tab === 'prices' && (
            <div>
            <PriceRecommendationsWidget
  agentId={agent?.id}
  authFetch={authFetch}
  toast={toast}
  onApply={(key, price) => setPriceEdits(prev => ({ ...prev, [key]: String(price) }))}
/>
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
              <div style={{ marginBottom: 14 }}>
                <input
                  className="form-input"
                  placeholder="🔍 Search by reference or phone number…"
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="tab-nav">
                  {['all','success','pending','failed'].map(f => (
                    <button key={f} className={`tab-btn${orderFilter === f ? ' active' : ''}`} onClick={() => setOrderFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filteredOrders as unknown as Record<string, unknown>[], 'my-orders')}>⬇ CSV</button>
              </div>
              <div className="card">
                {filteredOrders.length === 0
                  ? (
                    <div className="empty">
                      <div className="empty-icon">📋</div>
                      <div className="empty-title">{orders.length === 0 ? 'No orders yet' : 'No matching orders'}</div>
                      {orders.length > 0 && (orderSearch || orderFilter !== 'all') && (
                        <div className="empty-text">Try a different search term or filter</div>
                      )}
                    </div>
                  )
                  : filteredOrders.map(o => {
                    const isOpen = expandedOrderId === o.id;
                    return (
                      <div key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
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
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ok)' }}>{fmt(o.agent_profit || 0)}</span>
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                          </div>
                        </button>
                        {isOpen && (
                          <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                            <div><span style={{ color: 'var(--text3)' }}>Bundle</span><br /><strong>{o.size}</strong></div>
                            <div><span style={{ color: 'var(--text3)' }}>Phone</span><br /><strong>{o.phone}</strong></div>
                            <div><span style={{ color: 'var(--text3)' }}>Payment</span><br /><StatusBadge status={o.status} /></div>
                            <div><span style={{ color: 'var(--text3)' }}>Delivery</span><br /><DeliveryBadge status={o.delivery_status} /></div>
                            <div><span style={{ color: 'var(--text3)' }}>Customer Paid</span><br /><strong>{fmt(o.agent_price || 0)}</strong></div>
                            <div><span style={{ color: 'var(--text3)' }}>Your Profit</span><br /><strong style={{ color: 'var(--ok)' }}>{fmt(o.agent_profit || 0)}</strong></div>
                          </div>
                        )}
                      </div>
                    );
                  })
                }
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

              <RevenueChart orders={orders} metric="profit" title="7-Day Earnings Trend" />

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                    <div>
                      <div className="card-title">Request Withdrawal</div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: available >= 20 ? 'var(--ok)' : 'var(--warn)' }}>
                        {available >= 20 ? `GHS ${available.toFixed(2)} available` : `GHS ${fmt(available)} of GHS 20 min`}
                      </div>
                    </div>
                </div>
                <div className="card-body">
                  {available < 20 && (
                    <div className="alert alert-warn" style={{ marginBottom: 16, fontSize: 13 }}>
                      Minimum withdrawal is <strong>GHS 20.00</strong>
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
                <div style={{ padding: '0 0 4px' }}>
                  {withdrawals.length === 0
                    ? <div className="empty"><div className="empty-icon">💸</div><div className="empty-title">No withdrawals yet</div></div>
                    : withdrawals.map(w => (
                      <div key={w.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <NetworkBadge network={w.network} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(w.amount)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{w.momo_number} · {fmtDate(w.requested_at)}</div>
                          </div>
                        </div>
                        <StatusBadge status={w.status} />
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}
          
          {/* ── SUPPORT ── */}
          {tab === 'support' && agent && (
  <SupportTab
    agent={{ id: agent.id, name: agent.name, slug: agent.slug }}
    authFetch={authFetch}
    toast={toast}
    initialView={supportView}
    onViewChange={setSupportView}
    initialTicket={lastActiveTicket}
  />
)}

          {/* ── MY STORE ── */}
          {tab === 'store' && agent && (
  <StoreSettingsTab
    agent={agent}
    hasPrices={Object.keys(agentPrices).length > 0}
    siteUrl={siteUrl}
    authFetch={authFetch}
    toast={toast}
    onGoToPrices={() => setTab('prices')}
    onAgentUpdate={() => loadData(agent.id)}
  />
   <BundleLinks
  agentSlug={agent.slug}
  agentPrices={agentPrices}
  siteUrl={siteUrl}
  toast={toast}
/>
)}
	   {/* ── REFERRALS ── */}
	   {tab === 'referral' && agent && (
  <ReferralTab
    agentId={agent.id}
    authFetch={authFetch}
    toast={toast}
  />
)}
	   {/* ── SUBAGENT PRICING ── */}
	   {tab === 'subagent-prices' && agent && (
  <SubAgentPricingTab agentId={agent.id} authFetch={authFetch} toast={toast} />
)}

        </div>
      </main>
      </div>{/* end sidebar-layout */}

      {/* ── Floating Quick Actions ── */}
      <FloatingQuickActions
        hidden={tab === 'support' || dataLoading}
        onQuickBuy={jumpToQuickBuy}
        onFundWallet={() => setTab('wallet')}
        onWithdraw={() => setTab('earnings')}
        onViewOrders={() => setTab('orders')}
      />

      {/* ── Floating Chat Button ── */}
      {tab !== 'support' && (
        <button
          onClick={async () => {
            // Check for existing open/pending ticket first
            try {
              // Fetch open tickets first, fall back to pending
              const [openRes, pendingRes] = await Promise.all([
                authFetch(`/api/support/tickets?agentId=${agent?.id}&status=open`).then(r => r.json()),
                authFetch(`/api/support/tickets?agentId=${agent?.id}&status=pending`).then(r => r.json()),
              ]);
              const allActive = [
                ...(Array.isArray(openRes) ? openRes : []),
                ...(Array.isArray(pendingRes) ? pendingRes : []),
              ].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
              const active = allActive.length > 0 ? allActive[0] : null;
              if (active) {
                setLastActiveTicket(active);
                setSupportView('thread');
              } else {
                setLastActiveTicket(null);
                setSupportView('new');
              }
            } catch {
              setSupportView('new');
            }
            setTab('support');
          }}
          onMouseEnter={() => setChatTooltip(true)}
          onMouseLeave={() => setChatTooltip(false)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 22,
            zIndex: 999,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.93)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {/* Chat bubble icon */}
          <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 99,
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
              border: '2px solid var(--bg)',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}

          {/* Hover tooltip */}
          {chatTooltip && (
            <div style={{
              position: 'absolute',
              bottom: 58,
              right: 0,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 14px',
              width: 210,
              textAlign: 'left',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              pointerEvents: 'none',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text1)', marginBottom: 4 }}>
                💬 Start a conversation
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Average response time: 2–10 mins
              </div>
              {/* tooltip arrow */}
              <div style={{
                position: 'absolute',
                bottom: -6,
                right: 18,
                width: 10,
                height: 10,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderTop: 'none',
                borderLeft: 'none',
                transform: 'rotate(45deg)',
              }}/>
            </div>
          )}
        </button>
      )}
      <ServiceBanner />
      <ToastContainer />
      
    </>
  );
}
