// Paste this export into your existing lib/email.ts file

import { sendEmail } from '@/lib/email';

const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL || 'https://admunz.com';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '';

export interface ReconciliationEmailData {
  retried:     Array<{ reference: string; result: string }>;
  flagged:     Array<{ reference: string; hours: number }>;
  retriedOk:   number;
  retriedFail: number;
  checkedAt:   string;
}

export async function sendReconciliationEmail(data: ReconciliationEmailData) {
  const date = new Date(data.checkedAt).toLocaleString('en-GH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const retriedRows = data.retried.map(r =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);font-family:monospace;font-size:12px;color:#00d4aa">${r.reference}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;color:#94a3b8">${r.result}</td>
    </tr>`
  ).join('');

  const flaggedRows = data.flagged.map(r =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);font-family:monospace;font-size:12px;color:#f59e0b">${r.reference}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;color:#f43f5e">${r.hours}h stuck</td>
    </tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06090e;font-family:Arial,sans-serif;color:#f1f5f9">
<div style="max-width:540px;margin:32px auto;padding:0 16px">
  <div style="background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden">
    <div style="height:4px;background:linear-gradient(90deg,#00d4aa,#0ea5e9)"></div>
    <div style="padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:18px;font-weight:800">🔄 Daily Reconciliation Report</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${date}</div>
    </div>
    <div style="padding:24px 28px">
      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
        ${[
          { label: 'Retried',   val: data.retried.length, color: '#38bdf8' },
          { label: 'Succeeded', val: data.retriedOk,      color: '#10b981' },
          { label: 'Failed',    val: data.retriedFail,    color: '#f43f5e' },
          { label: 'Flagged',   val: data.flagged.length, color: '#f59e0b' },
        ].map(s => `
          <div style="background:#131920;border-radius:10px;padding:12px 16px;min-width:90px;text-align:center">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${s.label}</div>
            <div style="font-size:24px;font-weight:800;color:${s.color}">${s.val}</div>
          </div>
        `).join('')}
      </div>

      ${data.retried.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px">Retried Orders</div>
        <table style="width:100%;border-collapse:collapse;background:#131920;border-radius:10px;overflow:hidden">
          ${retriedRows}
        </table>
      </div>` : ''}

      ${data.flagged.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:10px">⚠️ Stuck in Processing 6h+</div>
        <table style="width:100%;border-collapse:collapse;background:#131920;border-radius:10px;overflow:hidden">
          ${flaggedRows}
        </table>
        <div style="margin-top:10px;font-size:12px;color:#94a3b8">Check with your provider or manually mark these as delivered/failed.</div>
      </div>` : ''}

      ${data.retried.length === 0 && data.flagged.length === 0 ? `
      <div style="text-align:center;padding:20px;color:#10b981;font-size:14px;font-weight:600">
        ✅ All orders healthy — nothing to action
      </div>` : ''}

      <a href="${SITE_URL}/xena-173424" style="display:inline-block;background:linear-gradient(135deg,#00d4aa,#00b894);color:#060910;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-top:8px">
        → Open Admin Panel
      </a>
    </div>
  </div>
</div>
</body></html>`;

  return sendEmail({
    to:      ADMIN_EMAIL,
    subject: `🔄 Reconciliation: ${data.retriedOk} retried, ${data.flagged.length} flagged — ${new Date(data.checkedAt).toLocaleDateString('en-GH')}`,
    html,
  });
}
