// app/api/agents/coach/route.ts
// Calls Groq to generate personalized performance coaching for an agent.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 503 });
  }

  try {
    const { agentId, context } = await req.json();
    if (!agentId || !context) {
      return NextResponse.json({ error: 'Missing agentId or context' }, { status: 400 });
    }

    // Ownership check
    const supabase = createSupabaseAdminClient();
    const { data: agentRow } = await supabase
      .from('agents')
      .select('auth_user_id')
      .eq('id', agentId)
      .single();
    if (!agentRow || agentRow.auth_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const prompt = `You are a helpful business coach for data bundle resellers in Ghana.
Analyze the agent's sales data and give practical, specific, actionable advice.
Always respond with valid JSON only — no markdown, no extra text.
The JSON must match this exact shape:
{
  "summary": "2-3 sentence overview of their performance",
  "tips": [
    { "emoji": "🕐", "title": "short tip title", "detail": "1-2 sentence specific actionable advice" },
    { "emoji": "📦", "title": "short tip title", "detail": "1-2 sentence specific actionable advice" },
    { "emoji": "📱", "title": "short tip title", "detail": "1-2 sentence specific actionable advice" }
  ],
  "bestTime": "When they should share their store link for maximum impact, based on their peak times",
  "topBundle": "Their best performing bundle and why they should promote it",
  "growthTip": "One specific thing they can do this week to grow sales"
}
Keep language simple, direct, and encouraging. Reference their actual numbers.

Here is the agent's data:
${context}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1000,
      }),
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      console.error('[coach] Groq error:', JSON.stringify(groqData));
      return NextResponse.json({ error: 'Groq API error: ' + (groqData?.error?.message || 'Unknown') }, { status: 502 });
    }

    const rawText = groqData.choices?.[0]?.message?.content || '';
    if (!rawText) return NextResponse.json({ error: 'Groq returned empty response' }, { status: 502 });

    const clean = rawText.replace(/```json\n?|```\n?/g, '').trim();
    const result = JSON.parse(clean);

    return NextResponse.json({ success: true, result });
  } catch (e) {
    console.error('[coach]', e);
    return NextResponse.json({ error: 'Failed to generate coaching tips' }, { status: 500 });
  }
}
