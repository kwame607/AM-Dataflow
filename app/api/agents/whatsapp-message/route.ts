// app/api/agents/whatsapp-message/route.ts
// Calls Groq to generate a WhatsApp broadcast message for an agent.
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
    const { agentId, prompt, tone, storeContext } = await req.json();
    if (!agentId || !prompt || !storeContext) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

    const toneDesc = tone === 'friendly'     ? 'warm and friendly, like a trusted friend'
                   : tone === 'professional' ? 'professional and trustworthy, business-like'
                   : 'exciting and energetic with emojis, to create urgency';

    const systemPrompt = `You are a WhatsApp marketing copywriter for a data bundle reseller in Ghana.
Write WhatsApp broadcast messages that are concise, persuasive, and natural-sounding.
Guidelines:
- Keep messages under 200 words
- Write in a ${toneDesc} tone
- Always include the store link naturally
- Use relevant emojis but don't overdo it
- Write in simple English that anyone can understand
- Never use placeholder text like [Name] — write as if speaking to a group
- Include a clear call to action
- If a contact number is provided, include it
- Make it sound like a real person wrote it, not a bot
- Output ONLY the WhatsApp message text, nothing else — no explanation, no quotes around it`;

    const userMessage = `Here is my store information:\n${storeContext}\n\nRequest: ${prompt}\n\nWrite the WhatsApp message now.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      console.error('[whatsapp-gen] Groq error:', JSON.stringify(groqData));
      return NextResponse.json({ error: 'Groq API error: ' + (groqData?.error?.message || 'Unknown') }, { status: 502 });
    }

    const message = (groqData.choices?.[0]?.message?.content || '').trim();
    if (!message) return NextResponse.json({ error: 'Groq returned empty response' }, { status: 502 });

    return NextResponse.json({ success: true, message });
  } catch (e) {
    console.error('[whatsapp-gen]', e);
    return NextResponse.json({ error: 'Failed to generate message' }, { status: 500 });
  }
}
