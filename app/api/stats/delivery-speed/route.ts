// app/api/stats/delivery-speed/route.ts
// Returns delivery speed statistics calculated from real completed orders.
// Used by the DeliverySpeedWidget on both agent and admin dashboards.
// Public read — no auth needed, no sensitive data exposed.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export const revalidate = 300; // cache 5 minutes

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // agentId is optional — if passed, stats are scoped to that agent's orders.
    // Admin overview passes nothing and gets platform-wide stats.
    const agentId = req.nextUrl.searchParams.get('agentId') || null;

    // Look at last 30 days of delivered orders that have both timestamps.
    // We need created_at AND delivered_at to calculate real durations.
    const since = new Date();
    since.setDate(since.getDate() - 30);

    let query = supabase
      .from('orders')
      .select('network, delivery_provider, created_at, delivered_at')
      .eq('status', 'success')
      .eq('delivery_status', 'delivered')
      .not('delivered_at', 'is', null)
      .gte('created_at', since.toISOString())
      .limit(500);

    if (agentId) query = query.eq('agent_id', agentId);

    const { data: orders, error } = await query;

    if (error || !orders || orders.length === 0) {
      return NextResponse.json({ hasData: false, stats: {} });
    }

    // Calculate delivery duration in minutes for each order
    type StatBucket = { durations: number[] };
    const byNetwork: Record<string, StatBucket> = {};
    const byProvider: Record<string, StatBucket> = {};
    const overall: number[] = [];

    for (const o of orders) {
      if (!o.created_at || !o.delivered_at) continue;
      const mins = (new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()) / 60000;
      if (mins < 0 || mins > 480) continue; // ignore bogus outliers (>8h)

      overall.push(mins);

      const net = o.network || 'unknown';
      if (!byNetwork[net]) byNetwork[net] = { durations: [] };
      byNetwork[net].durations.push(mins);

      const prov = o.delivery_provider || 'xpresportal';
      if (!byProvider[prov]) byProvider[prov] = { durations: [] };
      byProvider[prov].durations.push(mins);
    }

    if (overall.length === 0) {
      return NextResponse.json({ hasData: false, stats: {} });
    }

    function summarize(durations: number[]) {
      const sorted = [...durations].sort((a, b) => a - b);
      const avg    = durations.reduce((s, n) => s + n, 0) / durations.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const p90    = sorted[Math.floor(sorted.length * 0.9)];
      const min    = sorted[0];
      const max    = sorted[sorted.length - 1];
      return {
        avg:    Math.round(avg),
        median: Math.round(median),
        p90:    Math.round(p90),
        min:    Math.round(min),
        max:    Math.round(max),
        count:  durations.length,
      };
    }

    const networkStats: Record<string, ReturnType<typeof summarize>> = {};
    for (const [net, bucket] of Object.entries(byNetwork)) {
      networkStats[net] = summarize(bucket.durations);
    }

    const providerStats: Record<string, ReturnType<typeof summarize>> = {};
    for (const [prov, bucket] of Object.entries(byProvider)) {
      providerStats[prov] = summarize(bucket.durations);
    }

    return NextResponse.json({
      hasData: true,
      overall: summarize(overall),
      byNetwork: networkStats,
      byProvider: providerStats,
      ordersAnalyzed: overall.length,
      periodDays: 30,
    });
  } catch (e) {
    console.error('[delivery-speed]', e);
    return NextResponse.json({ hasData: false, stats: {} });
  }
}
