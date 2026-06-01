// lib/email.ts
// ─────────────────────────────────────────────────────────────
// Email notification helper using Resend (resend.com — free tier: 3,000/month)
// Alternative: swap sendEmail() body to use Nodemailer + Gmail SMTP
//
// SETUP:
//   npm install resend
//   Add to .env.local:
//     RESEND_API_KEY=re_xxxxxxxxxxxx
//     ADMIN_NOTIFY_EMAIL=youremail@gmail.com
//     NEXT_PUBLIC_SITE_URL=https://yoursite.com
// ─────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ADMIN_EMAIL    = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'kwameadom607@gmail.com';
const SITE_URL       = process.env.NEXT_PUBLIC_SITE_URL || 'https://admunz.com';
const FROM_EMAIL     = process.env.EMAIL_FROM || 'ADMUNZ <notifications@admunz.com>';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

// ── core sender (Resend) ──────────────────────────────────────
export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — email not sent:', payload.subject);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[email] Resend error:', data);
      return { ok: false, error: data?.message || 'Send failed' };
    }
    console.log('[email] Sent:', payload.subject, '→', payload.to);
    return { ok: true };
  } catch (e) {
    console.error('[email] Exception:', e);
    return { ok: false, error: String(e) };
  }
}

// ── shared HTML shell ─────────────────────────────────────────
function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#06090e;font-family:'Helvetica Neue',Arial,sans-serif;color:#f1f5f9}
  .wrap{max-width:520px;margin:32px auto;padding:0 16px}
  .card{background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden}
  .header{padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:12px}
  .logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#00d4aa,#0ea5e9);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#06090e}
  .logo-text{font-size:18px;font-weight:800;color:#f1f5f9;letter-spacing:-0.5px}
  .logo-sub{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em}
  .body{padding:28px 28px 24px}
  .title{font-size:20px;font-weight:800;color:#f1f5f9;margin-bottom:6px}
  .subtitle{font-size:13px;color:#94a3b8;margin-bottom:24px;line-height:1.5}
  .row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
  .row:last-child{border-bottom:none}
  .row-label{font-size:13px;color:#64748b}
  .row-val{font-size:13px;font-weight:600;color:#f1f5f9}
  .highlight{color:#00d4aa}
  .warn{color:#f59e0b}
  .err{color:#f43f5e}
  .ok{color:#10b981}
  .box{background:#131920;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 18px;margin:16px 0}
  .btn{display:inline-block;background:linear-gradient(135deg,#00d4aa,#00b894);color:#06090e;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-top:18px}
  .footer{padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#334155;text-align:center}
  .badge{display:inline-block;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700}
  .badge-warn{background:rgba(245,158,11,0.15);color:#f59e0b}
  .badge-err{background:rgba(244,63,94,0.15);color:#f43f5e}
  .badge-ok{background:rgba(16,185,129,0.15);color:#10b981}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="logo">A</div>
      <div>
        <div class="logo-text">ADMUNZ</div>
        <div class="logo-sub">Admin Notification</div>
      </div>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      This is an automated notification from ADMUNZ &mdash; <a href="${SITE_URL}/xena-173424" style="color:#00d4aa">Open Admin Panel</a>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── 1. Withdrawal request notification ───────────────────────
export interface WithdrawalEmailData {
  agentName:   string;
  agentSlug:   string;
  amount:      number;
  momoNumber:  string;
  momoName:    string;
  network:     string;
  withdrawalId: string;
  requestedAt: string;
}

const NET_LABELS: Record<string, string> = {
  mtn:     'MTN MoMo',
  telecel: 'Telecel Cash',
  at:      'AirtelTigo Money',
};

export async function sendWithdrawalRequestEmail(data: WithdrawalEmailData) {
  const netLabel = NET_LABELS[data.network] || data.network;
  const date = new Date(data.requestedAt).toLocaleString('en-GH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const html = emailShell(`
    <div class="title">💸 New Withdrawal Request</div>
    <div class="subtitle">An agent has requested a payout. Review and process it in the admin panel.</div>

    <div class="box">
      <div class="row"><span class="row-label">Agent</span><span class="row-val">${data.agentName}</span></div>
      <div class="row"><span class="row-label">Store</span><span class="row-val highlight">/store/${data.agentSlug}</span></div>
      <div class="row"><span class="row-label">Amount</span><span class="row-val" style="font-size:18px;font-weight:800;color:#f59e0b">GHS ${data.amount.toFixed(2)}</span></div>
      <div class="row"><span class="row-label">Network</span><span class="row-val">${netLabel}</span></div>
      <div class="row"><span class="row-label">MoMo Number</span><span class="row-val highlight">${data.momoNumber}</span></div>
      <div class="row"><span class="row-label">Account Name</span><span class="row-val">${data.momoName}</span></div>
      <div class="row"><span class="row-label">Requested At</span><span class="row-val">${date}</span></div>
      <div class="row"><span class="row-label">Reference</span><span class="row-val" style="font-family:monospace;font-size:12px">${data.withdrawalId}</span></div>
    </div>

    <p style="font-size:13px;color:#94a3b8;margin:0 0 4px">
      ⚡ Action required: log into the admin panel to approve or reject this request.
    </p>

    <a href="${SITE_URL}/xena-173424" class="btn">→ Review in Admin Panel</a>
  `);

  return sendEmail({
    to:      ADMIN_EMAIL,
    subject: `💸 Withdrawal Request — GHS ${data.amount.toFixed(2)} from ${data.agentName}`,
    html,
  });
}

// ── 2. Low XpresPortal wallet notification ───────────────────
export interface LowWalletEmailData {
  balance:          number;
  threshold:        number;
  pendingOrders?:   number;
}

export async function sendLowWalletEmail(data: LowWalletEmailData) {
  const isCritical = data.balance < 50;
  const statusLabel = isCritical ? 'CRITICAL' : 'LOW';
  const statusColor = isCritical ? 'err' : 'warn';

  const html = emailShell(`
    <div class="title">${isCritical ? '🚨' : '⚠️'} XpresPortal Wallet ${statusLabel}</div>
    <div class="subtitle">
      Your XpresPortal wallet balance has dropped ${isCritical ? 'critically low' : 'below the alert threshold'}.
      Top up immediately to avoid failed data deliveries.
    </div>

    <div class="box">
      <div class="row">
        <span class="row-label">Current Balance</span>
        <span class="row-val ${statusColor}" style="font-size:22px;font-weight:800">GHS ${data.balance.toFixed(2)}</span>
      </div>
      <div class="row">
        <span class="row-label">Alert Threshold</span>
        <span class="row-val">GHS ${data.threshold.toFixed(2)}</span>
      </div>
      ${data.pendingOrders != null ? `
      <div class="row">
        <span class="row-label">Pending Orders at Risk</span>
        <span class="row-val err">${data.pendingOrders} orders</span>
      </div>` : ''}
      <div class="row">
        <span class="row-label">Status</span>
        <span class="badge badge-${statusColor}">${statusLabel}</span>
      </div>
    </div>

    <p style="font-size:13px;color:#94a3b8;margin:0 0 4px;line-height:1.6">
      ${isCritical
        ? '🔴 <strong style="color:#f43f5e">Action required NOW.</strong> New orders will fail to deliver until the wallet is topped up.'
        : '🟡 Top up soon to ensure uninterrupted service for your customers and agents.'}
    </p>

    <a href="https://xpresportal.app" class="btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">
      → Top Up XpresPortal Wallet
    </a>
    &nbsp;&nbsp;
    <a href="${SITE_URL}/xena-173424" style="display:inline-block;color:#00d4aa;font-size:13px;text-decoration:none;margin-top:18px">
      View Admin Panel →
    </a>
  `);

  return sendEmail({
    to:      ADMIN_EMAIL,
    subject: `${isCritical ? '🚨 CRITICAL' : '⚠️ WARNING'} — XpresPortal Balance: GHS ${data.balance.toFixed(2)}`,
    html,
  });
}

// ── 3. (bonus) Order delivery failure digest ─────────────────
export async function sendDeliveryFailureEmail(data: {
  reference: string;
  phone:     string;
  network:   string;
  size:      string;
  agentName?: string;
}) {
  const html = emailShell(`
    <div class="title">❌ Delivery Failed</div>
    <div class="subtitle">An order could not be delivered. Manual intervention may be needed.</div>

    <div class="box">
      <div class="row"><span class="row-label">Reference</span><span class="row-val" style="font-family:monospace">${data.reference}</span></div>
      <div class="row"><span class="row-label">Recipient</span><span class="row-val">${data.phone}</span></div>
      <div class="row"><span class="row-label">Network</span><span class="row-val">${data.network.toUpperCase()}</span></div>
      <div class="row"><span class="row-label">Bundle</span><span class="row-val">${data.size}</span></div>
      ${data.agentName ? `<div class="row"><span class="row-label">Agent</span><span class="row-val">${data.agentName}</span></div>` : ''}
    </div>

    <a href="${SITE_URL}/xena-173424" class="btn" style="background:linear-gradient(135deg,#f43f5e,#dc2626)">
      → Retry Delivery in Admin Panel
    </a>
  `);

  return sendEmail({
    to:      ADMIN_EMAIL,
    subject: `❌ Delivery Failed — ${data.size} ${data.network.toUpperCase()} to ${data.phone}`,
    html,
  });
}
