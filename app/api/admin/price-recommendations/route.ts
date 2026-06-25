// app/api/admin/price-recommendations/route.ts
// Analyses your actual sales data and calls Claude to generate per-bundle
// price recommendations based on margin, sales velocity, and Ghana market
// competitive context. Works for both admin (all bundles) and agents
// (their own pricing tier).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { ALL_BUNDLES, getDefaultAdminPrice } from '@/lib/bundles';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { agentId } = await req.json();
    const supabase = createSupabaseAdminClient();

    // ── 1. Gather sales data for the last 60 days ─────────────
    const since = new Date();
    since.setDate(since.getDate() - 60);

    let ordersQuery = supabase
      .from('orders')
      .select('bundle_key, network, size, agent_price, admin_price, hubnet_cost, status, created_at')
      .eq('status', 'success')
      .gte('created_at', since.toISOString());

    if (agentId) ordersQuery = ordersQuery.eq('agent_id', agentId);

    const { data: orders } = await ordersQuery;

    // ── 2. Get current prices ──────────────────────────────────
    const { data: adminPrices } = await supabase
      .from('admin_prices')
      .select('bundle_key, selling_price, store_price');

    let agentPrices: { bundle_key: string; agent_price: number }[] = [];
    if (agentId) {
      const { data } = await supabase
        .from('agent_prices')
        .select('bundle_key, agent_price')
        .eq('agent_id', agentId);
      agentPrices = data || [];
    }

    // ── 3. Build per-bundle stats ──────────────────────────────
    const bundleStats: Record<string, {
      key: string; network: string; size: string;
      cost: number; currentPrice: number;
      salesCount: number; totalRevenue: number;
      avgSalePrice: number; margin: number; marginPct: number;
    }> = {};

    const adminPriceMap: Record<string, number> = {};
    (adminPrices || []).forEach(p => { adminPriceMap[p.bundle_key] = p.store_price ?? p.selling_price; });

    const agentPriceMap: Record<string, number> = {};
    agentPrices.forEach(p => { agentPriceMap[p.bundle_key] = p.agent_price; });

    ALL_BUNDLES.forEach(b => {
      const currentPrice = agentId
        ? (agentPriceMap[b.key] || adminPriceMap[b.key] || getDefaultAdminPrice(b.cost))
        : (adminPriceMap[b.key] || getDefaultAdminPrice(b.cost));

      bundleStats[b.key] = {
        key: b.key,
        network: b.network || '',
        size: b.size,
        cost: b.cost,
        currentPrice,
        salesCount: 0,
        totalRevenue: 0,
        avgSalePrice: currentPrice,
        margin: currentPrice - b.cost,
        marginPct: ((currentPrice - b.cost) / b.cost) * 100,
      };
    });

    // Overlay real sales data
    (orders || []).forEach(o => {
      const s = bundleStats[o.bundle_key];
      if (!s) return;
      const salePrice = agentId ? (o.agent_price || 0) : (o.admin_price || 0);
      s.salesCount++;
      s.totalRevenue += salePrice;
    });

    Object.values(bundleStats).forEach(s => {
      if (s.salesCount > 0) {
        s.avgSalePrice = s.totalRevenue / s.salesCount;
        s.margin = s.avgSalePrice - s.cost;
        s.marginPct = (s.margin / s.cost) * 100;
      }
    });

    // ── 4. Build context for Claude ────────────────────────────
    const topSellers = Object.values(bundleStats)
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 10);

    const slowMovers = Object.values(bundleStats)
      .filter(s => s.salesCount === 0)
      .slice(0, 10);

    const thinMargin = Object.values(bundleStats)
      .filter(s => s.marginPct < 3 && s.salesCount > 0)
      .slice(0, 8);

    const prompt = `You are a pricing strategist for ADMUNZ, a data bundle reseller in Ghana.

CONTEXT:
- ADMUNZ resells MTN, AirtelTigo, and Telecel data bundles
- They buy from a wholesale provider and mark up to sell to end customers and reseller agents
- The Ghana data bundle market is competitive with many informal resellers

GHANA MARKET PRICING CONTEXT (your knowledge):
- MTN Ghana bundles are the most popular and command slight premium pricing
- AirtelTigo bundles are price-sensitive — customers shop around more
- Telecel (formerly Vodafone) has a loyal but smaller customer base
- Typical reseller markups in Ghana range from 5-15% above wholesale cost
- Popular sizes: 1GB, 2GB, 5GB, 10GB (bread-and-butter); 20GB+ are growing
- Customers are price-conscious but value reliability and fast delivery

CURRENT SALES DATA (last 60 days):
Top selling bundles:
${topSellers.map(s => `- ${s.network.toUpperCase()} ${s.size}: ${s.salesCount} sales, current price ₵${s.currentPrice.toFixed(2)}, cost ₵${s.cost.toFixed(2)}, margin ${s.marginPct.toFixed(1)}%`).join('\n')}

Zero sales bundles (may be overpriced or just not popular):
${slowMovers.map(s => `- ${s.network.toUpperCase()} ${s.size}: current price ₵${s.currentPrice.toFixed(2)}, cost ₵${s.cost.toFixed(2)}, margin ${s.marginPct.toFixed(1)}%`).join('\n')}

Thin margin bundles (selling but barely profitable):
${thinMargin.map(s => `- ${s.network.toUpperCase()} ${s.size}: ${s.salesCount} sales, margin only ${s.marginPct.toFixed(1)}%`).join('\n')}

${agentId ? 'NOTE: These are recommendations for an individual reseller agent, so focus on their competitive positioning against other agents rather than wholesale margins.' : 'NOTE: These are recommendations for the platform admin/owner.'}

TASK:
Generate specific, actionable price recommendations. For each recommendation:
1. Name the bundle (network + size)
2. Current price and suggested new price (specific GHS amounts, max 2 decimal places)  
3. One-sentence reason
4. Priority: HIGH/MEDIUM/LOW

Focus on:
- Bundles with thin margins that could be raised without losing sales
- Overpriced slow-movers that need a price cut to activate
- Top sellers where a small increase is unlikely to hurt volume
- Competitive positioning vs Ghana market rates

Return ONLY valid JSON in this exact format, no other text:
{
  "summary": "2-3 sentence overall assessment",
  "recommendations": [
    {
      "bundleKey": "mtn_2gb",
      "network": "mtn",
      "size": "2GB",
      "currentPrice": 8.50,
      "suggestedPrice": 9.00,
      "change": "+0.50",
      "changePct": "+5.9%",
      "reason": "Your top seller with room to grow — 5.9% increase unlikely to dent volume at this price point.",
      "priority": "HIGH"
    }
  ],
  "generalTips": ["tip 1", "tip 2", "tip 3"]
}`;

    // ── 5. Call Gemini 1.5 Flash (free tier) ──────────────────
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured in environment variables' }, { status: 503 });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    console.log('[price-recommendations] Gemini status:', geminiRes.status);

    if (!geminiRes.ok) {
      console.error('[price-recommendations] Gemini error:', JSON.stringify(geminiData));
      return NextResponse.json({ error: 'Gemini API error: ' + (geminiData?.error?.message || 'Unknown') }, { status: 502 });
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) {
      return NextResponse.json({ error: 'Gemini returned empty response' }, { status: 502 });
    }

    // Strip markdown fences if Gemini wrapped the JSON
    const clean = rawText.replace(/```json\n?|```\n?/g, '').trim();
    const recommendations = JSON.parse(clean);

    return NextResponse.json({
      success: true,
      recommendations,
      dataPoints: (orders || []).length,
      periodDays: 60,
    });

  } catch (e) {
    console.error('[price-recommendations]', e);
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}
