// lib/wallet-email.ts — NEW FILE (additive — does not modify lib/email.ts)
//
// Optional notification helpers for wallet events. Uses the same
// sendEmail() core from lib/email.ts so it inherits your Resend config.
// Wire these into the wallet routes if/when you want admin email alerts
// for deposits, claims, etc. They are NOT called automatically anywhere
// yet — import and call them where needed.

import { sendEmail } from '@/lib/email';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'kwameadom607@gmail.com';
const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL || 'https://admunz.com';

export async function sendDepositClaimEmail(data: {
  agentName: string;
  agentSlug: string;
  network: string;
  senderNumber: string;
  transactionId: string;
  amount: number;
  claimId: string;
}) {
  const html = `
    <div style="font-family:sans-serif;background:#06090e;color:#f1f5f9;padding:24px">
      <h2 style="color:#00d4aa">💰 New Deposit Claim</h2>
      <p><strong>${data.agentName}</strong> (/store/${data.agentSlug}) submitted a deposit claim.</p>
      <ul>
        <li>Network: ${data.network.toUpperCase()}</li>
        <li>Sender Number: ${data.senderNumber}</li>
        <li>Transaction ID: ${data.transactionId}</li>
        <li>Amount: GHS ${data.amount.toFixed(2)}</li>
      </ul>
      <a href="${SITE_URL}/xena-173424" style="display:inline-block;background:#00d4aa;color:#06090e;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px">Review in Admin Panel</a>
    </div>`;

  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `💰 Deposit Claim — GHS ${data.amount.toFixed(2)} from ${data.agentName}`,
    html,
  });
}

export async function sendWalletFundedEmail(data: {
  agentId: string;
  amount: number;
  newBalance: number;
  reference: string;
}) {
  // Lightweight internal log-style notification; extend with agent email lookup if desired.
  console.log(`[wallet] Funded: agent=${data.agentId} amount=${data.amount} newBalance=${data.newBalance} ref=${data.reference}`);
  return { ok: true };
}
