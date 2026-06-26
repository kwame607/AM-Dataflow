// app/api/cron/weekly-summary/route.ts
// Vercel cron: runs at 8:00 AM UTC every Monday
// Add to vercel.json: { "crons": [{ "path": "/api/cron/weekly-summary", "schedule": "0 8 * * 1" }] }
import { NextRequest, NextResponse } from 'next/server';
import { generateAndSendSummary } from '@/lib/summary-generator';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const isCron     = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const referer = req.headers.get('referer') || '';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    if (siteUrl && !referer.includes(siteUrl)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await generateAndSendSummary('weekly');
    return NextResponse.json({
      ok:        true,
      type:      'weekly',
      label:     result.label,
      orders:    result.stats.orders,
      revenue:   result.stats.revenue,
      profit:    result.stats.profit,
      narrative: result.narrative,
    });
  } catch (e) {
    console.error('[weekly-summary cron]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
