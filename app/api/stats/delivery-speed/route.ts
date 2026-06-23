// app/api/stats/delivery-speed/route.ts
// Returns delivery speed statistics calculated from real completed orders.
// Used by the DeliverySpeedWidget on both agent and admin dashboards.
// Public read — no auth needed, no sensitive data exposed.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export const revalidate = 300; // cache for 5 minutes

type Summary = {
  avg: number;
  median: number;
  p90: number;
  min: number;
  max: number;
  count: number;
};

type StatBucket = {
  durations: number[];
};

function summarize(durations: number[]): Summary {
  const sorted = [...durations].sort((a, b) => a - b);

  const avg =
    durations.reduce((sum, n) => sum + n, 0) / durations.length;

  const median = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    avg: Math.round(avg),
    median: Math.round(median),
    p90: Math.round(p90),
    min: Math.round(min),
    max: Math.round(max),
    count: durations.length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // Optional agent scope
    const agentId = req.nextUrl.searchParams.get('agentId');

    // Last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);

    let query = supabase
      .from('orders')
      .select(
        'network, delivery_provider, created_at, delivered_at'
      )
      .eq('status', 'success')
      .eq('delivery_status', 'delivered')
      .not('delivered_at', 'is', null)
      .gte('created_at', since.toISOString())
      .limit(500);

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('[delivery-speed]', error);

      return NextResponse.json({
        hasData: false,
        stats: {},
      });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        hasData: false,
        stats: {},
      });
    }

    const overall: number[] = [];

    const byNetwork: Record<string, StatBucket> = {};
    const byProvider: Record<string, StatBucket> = {};

    for (const order of orders) {
      if (!order.created_at || !order.delivered_at) continue;

      const minutes =
        (new Date(order.delivered_at).getTime() -
          new Date(order.created_at).getTime()) /
        60000;

      // Ignore invalid/outlier values
      if (minutes < 0 || minutes > 480) continue;

      overall.push(minutes);

      const network = order.network || 'unknown';

      if (!byNetwork[network]) {
        byNetwork[network] = { durations: [] };
      }

      byNetwork[network].durations.push(minutes);

      const provider = order.delivery_provider || 'xpresportal';

      if (!byProvider[provider]) {
        byProvider[provider] = { durations: [] };
      }

      byProvider[provider].durations.push(minutes);
    }

    if (overall.length === 0) {
      return NextResponse.json({
        hasData: false,
        stats: {},
      });
    }

    const networkStats: Record<string, Summary> = {};

    for (const [network, bucket] of Object.entries(byNetwork)) {
      networkStats[network] = summarize(bucket.durations);
    }

    const providerStats: Record<string, Summary> = {};

    for (const [provider, bucket] of Object.entries(byProvider)) {
      providerStats[provider] = summarize(bucket.durations);
    }

    return NextResponse.json({
      hasData: true,
      overall: summarize(overall),
      byNetwork: networkStats,
      byProvider: providerStats,
      ordersAnalyzed: overall.length,
      periodDays: 30,
    });
  } catch (err) {
    console.error('[delivery-speed]', err);

    return NextResponse.json({
      hasData: false,
      stats: {},
    });
  }
}
