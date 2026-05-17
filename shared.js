// ═══════════════════════════════════════════════
// DATAFLOW GH — SHARED UTILITIES
// ═══════════════════════════════════════════════

// ── CONFIG (replace with your real values) ──
const CONFIG = {
  STORE_NAME: 'DataFlow GH',
  WHATSAPP: '0200000000',
  HUBNET_API_KEY: 'TU6YTjo48YAleMCiuftduIDADURA1zaG1gw', // your key
  CALLBACK_URL: 'https://e-store.apisolution.net/v.1?id=OWR5JNMDKS18A6WS1MGRMRN1UGLBHWRRU9L',
  WEBHOOK_URL: 'https://hubnet.app/v.1/webhook',
  PAYSTACK_PUBLIC_KEY: '', // add your paystack key
  HUBNET_BASE: 'https://console.hubnet.app/live/api/context/business/transaction'
};

// ── BUNDLE CATALOG ──
const BUNDLES = {
  mtn: [
    { key:'mtn_1gb',  size:'1GB',   volume:'1000',  cost:4.9,   validity:'90 days' },
    { key:'mtn_2gb',  size:'2GB',   volume:'2000',  cost:9.8,   validity:'90 days' },
    { key:'mtn_3gb',  size:'3GB',   volume:'3000',  cost:13.8,  validity:'90 days' },
    { key:'mtn_4gb',  size:'4GB',   volume:'4000',  cost:18.8,  validity:'90 days' },
    { key:'mtn_5gb',  size:'5GB',   volume:'5000',  cost:23.5,  validity:'90 days' },
    { key:'mtn_6gb',  size:'6GB',   volume:'6000',  cost:27.4,  validity:'90 days' },
    { key:'mtn_8gb',  size:'8GB',   volume:'8000',  cost:37.5,  validity:'90 days' },
    { key:'mtn_10gb', size:'10GB',  volume:'10000', cost:43.5,  validity:'90 days' },
    { key:'mtn_15gb', size:'15GB',  volume:'15000', cost:63.5,  validity:'90 days' },
    { key:'mtn_20gb', size:'20GB',  volume:'20000', cost:84.5,  validity:'90 days' }
  ],
  telecel: [
    { key:'tel_10gb',  size:'10GB',  volume:'10000', cost:43.5,  validity:'90 days' },
    { key:'tel_15gb',  size:'15GB',  volume:'15000', cost:62.5,  validity:'90 days' },
    { key:'tel_20gb',  size:'20GB',  volume:'20000', cost:82.5,  validity:'90 days' },
    { key:'tel_25gb',  size:'25GB',  volume:'25000', cost:99.5,  validity:'90 days' },
    { key:'tel_30gb',  size:'30GB',  volume:'30000', cost:117.5, validity:'90 days' },
    { key:'tel_40gb',  size:'40GB',  volume:'40000', cost:155.5, validity:'90 days' },
    { key:'tel_50gb',  size:'50GB',  volume:'50000', cost:196.5, validity:'90 days' },
    { key:'tel_100gb', size:'100GB', volume:'100000',cost:365.5, validity:'90 days' }
  ],
  at: [
    { key:'at_1gb',   size:'1GB',   volume:'1000',  cost:4.3,   validity:'90 days', type:'AT Premium' },
    { key:'at_2gb',   size:'2GB',   volume:'2000',  cost:8.4,   validity:'90 days', type:'AT Premium' },
    { key:'at_3gb',   size:'3GB',   volume:'3000',  cost:12,    validity:'90 days', type:'AT Premium' },
    { key:'at_5gb',   size:'5GB',   volume:'5000',  cost:20,    validity:'90 days', type:'AT Premium' },
    { key:'at_10gb',  size:'10GB',  volume:'10000', cost:39.5,  validity:'90 days', type:'AT Premium' },
    { key:'at_30gb',  size:'30GB',  volume:'30000', cost:83.5,  validity:'90 days', type:'AT BigTime' },
    { key:'at_50gb',  size:'50GB',  volume:'50000', cost:105,   validity:'90 days', type:'AT BigTime' },
    { key:'at_100gb', size:'100GB', volume:'100000',cost:190.5, validity:'90 days', type:'AT BigTime' }
  ]
};

const NET_NAMES = { mtn:'MTN', telecel:'Telecel', at:'AirtelTigo' };
const NET_KEYS  = { mtn:'mtn', telecel:'telecel', at:'at' };

// ── LOCAL STORAGE KEYS ──
const LS = {
  CONFIG:      'df_config',
  ORDERS:      'df_orders',
  AGENTS:      'df_agents',
  ADMIN_PRICES:'df_admin_prices',
  AGENT_PRICES:'df_agent_prices', // {slug: {bundle_key: price}}
  WITHDRAWALS: 'df_withdrawals',
  CURRENT_AGENT:'df_current_agent'
};

// ── STORAGE HELPERS ──
function lsGet(key, def = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── ADMIN PRICES ──
function getAdminPrice(bundleKey, cost) {
  const prices = lsGet(LS.ADMIN_PRICES, {});
  return prices[bundleKey] !== undefined ? prices[bundleKey] : +(cost * 1.13).toFixed(2);
}
function saveAdminPrices(prices) { lsSet(LS.ADMIN_PRICES, prices); }

// ── AGENT PRICES ──
function getAgentPrice(slug, bundleKey, adminPrice) {
  const all = lsGet(LS.AGENT_PRICES, {});
  const agentPrices = all[slug] || {};
  return agentPrices[bundleKey] !== undefined ? agentPrices[bundleKey] : adminPrice;
}
function saveAgentPrices(slug, prices) {
  const all = lsGet(LS.AGENT_PRICES, {});
  all[slug] = prices;
  lsSet(LS.AGENT_PRICES, all);
}

// ── AGENTS ──
function getAgents() { return lsGet(LS.AGENTS, []); }
function saveAgents(agents) { lsSet(LS.AGENTS, agents); }
function getAgentBySlug(slug) { return getAgents().find(a => a.slug === slug) || null; }
function getCurrentAgent() { return lsGet(LS.CURRENT_AGENT, null); }
function setCurrentAgent(agent) { lsSet(LS.CURRENT_AGENT, agent); }
function clearCurrentAgent() { localStorage.removeItem(LS.CURRENT_AGENT); }

// ── ORDERS ──
function getOrders() { return lsGet(LS.ORDERS, []); }
function saveOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  lsSet(LS.ORDERS, orders);
}

// ── WITHDRAWALS ──
function getWithdrawals() { return lsGet(LS.WITHDRAWALS, []); }
function saveWithdrawal(w) {
  const ws = getWithdrawals();
  ws.unshift(w);
  lsSet(LS.WITHDRAWALS, ws);
}

// ── REFERENCE GENERATOR ──
function genRef(prefix = 'DF') {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `${prefix}-${ts}-${rand}`.substr(0, 25);
}

// ── PHONE NETWORK DETECT ──
function detectNetwork(phone) {
  const p = phone.replace(/\D/g,'');
  if (!p.startsWith('0') || p.length !== 10) return null;
  const pref = p.substr(0, 3);
  const mtn = ['024','054','055','059','025'];
  const tel = ['020','050'];
  const at  = ['027','026','057','056','028'];
  if (mtn.includes(pref)) return 'mtn';
  if (tel.includes(pref)) return 'telecel';
  if (at.includes(pref)) return 'at';
  return null;
}

// ── FORMAT ──
function fmt(n) { return '₵' + parseFloat(n).toFixed(2); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GH', { hour:'2-digit', minute:'2-digit' });
}

// ── TOAST ──
function toast(msg, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  t.innerHTML = `<span style="font-size:15px;flex-shrink:0;">${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── ALERT ──
function showAlert(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}
function hideAlert(elId) {
  const el = document.getElementById(elId);
  if (el) el.classList.add('hidden');
}

// ── COPY ──
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = orig, 2000); }
    toast('Copied to clipboard', 'success', 2000);
  }).catch(() => toast('Copy failed', 'error'));
}

// ── OVERLAY / MODAL ──
function openOverlay(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeOverlay(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

// ── SIDEBAR TOGGLE (mobile) ──
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const menuBtn = document.getElementById('menu-btn');

  if (!sidebar) return;

  function open() {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  if (menuBtn) menuBtn.addEventListener('click', open);
  if (overlay) overlay.addEventListener('click', close);
}

// ── ACTIVE NAV ──
function setActiveNav(tabId) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  document.querySelectorAll('.mob-btn[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
}

// ── TAB SWITCHER ──
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('tab-' + tabId);
  if (panel) panel.classList.remove('hidden');
  setActiveNav(tabId);
}

// ── HUBNET TRANSACTION (called server-side in production; here simulated) ──
async function hubnetTransact({ network, phone, volume, reference }) {
  // In production this should call YOUR backend API route, not Hubnet directly
  // For this frontend demo, we call Hubnet directly (note: CORS may block)
  try {
    const res = await fetch(`${CONFIG.HUBNET_BASE}/${network}-new-transaction`, {
      method: 'POST',
      headers: {
        'token': `Bearer ${CONFIG.HUBNET_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, volume, reference, webhook: CONFIG.WEBHOOK_URL })
    });
    return await res.json();
  } catch(e) {
    return { status: false, reason: 'Network error — ' + e.message };
  }
}

// ── PROFIT CALC ──
function calcProfits(bundle, network, agentSlug) {
  const adminPrice = getAdminPrice(bundle.key, bundle.cost);
  const agentPrice = agentSlug ? getAgentPrice(agentSlug, bundle.key, adminPrice) : adminPrice;
  const adminProfit = +(adminPrice - bundle.cost).toFixed(2);
  const agentProfit = agentSlug ? +(agentPrice - adminPrice).toFixed(2) : 0;
  return { adminPrice, agentPrice, adminProfit, agentProfit, customerPays: agentPrice };
}

// ── AGENT EARNINGS ──
function agentEarnings(slug) {
  const orders = getOrders().filter(o => o.agentSlug === slug && o.status === 'success');
  const totalProfit = orders.reduce((s, o) => s + (o.agentProfit || 0), 0);
  const withdrawn = getWithdrawals().filter(w => w.agentSlug === slug && w.status === 'paid')
                                    .reduce((s, w) => s + w.amount, 0);
  return { totalProfit: +totalProfit.toFixed(2), withdrawn: +withdrawn.toFixed(2), available: +(totalProfit - withdrawn).toFixed(2), count: orders.length };
}

// ── ADMIN EARNINGS ──
function adminEarnings() {
  const orders = getOrders().filter(o => o.status === 'success');
  const totalRevenue = orders.reduce((s, o) => s + (o.agentPrice || o.adminPrice), 0);
  const totalProfit = orders.reduce((s, o) => s + (o.adminProfit || 0), 0);
  const withdrawn = getWithdrawals().filter(w => w.type === 'admin' && w.status === 'paid')
                                    .reduce((s, w) => s + w.amount, 0);
  return {
    totalRevenue: +totalRevenue.toFixed(2),
    totalProfit: +totalProfit.toFixed(2),
    available: +(totalProfit - withdrawn).toFixed(2),
    count: orders.length
  };
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  // Close overlays on background click
  document.querySelectorAll('.overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
  document.querySelectorAll('.modal').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
});
