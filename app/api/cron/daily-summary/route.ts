// app/api/cron/daily-summary/route.ts
// Vercel cron: runs at 8:00 AM UTC daily (= 8am Ghana time, GMT+0)
// Add to vercel.json: { "crons": [{ "path": "/api/cron/daily-summary", "schedule": "0 8 * * *" }] }
import { NextRequest, NextResponse } from 'next/server';
import { generateAndSendSummary } from '@/lib/summary-generator';

export async function GET(req: NextRequest) {
  // Accept Vercel cron secret OR admin manual trigger
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const isCron     = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    // Allow manual trigger from admin panel too (no secret required for GET
    // since this just generates a summary — no destructive action)
    const referer = req.headers.get('referer') || '';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    if (siteUrl && !referer.includes(siteUrl)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await generateAndSendSummary('daily');
    return NextResponse.json({
      ok:        true,
      type:      'daily',
      label:     result.label,
      orders:    result.stats.orders,
      revenue:   result.stats.revenue,
      profit:    result.stats.profit,
      narrative: result.narrative,
    });
  } catch (e) {
    console.error('[daily-summary cron]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
