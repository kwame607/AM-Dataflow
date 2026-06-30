// app/api/agents/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email, phone, whatsapp, storeName, slug, password, referredBy } = await req.json();

    if (!firstName || !lastName || !email || !phone || !storeName || !slug || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!/^[a-z0-9]+$/.test(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingSlug } = await supabase
      .from('agents').select('id').eq('slug', slug).single();
    if (existingSlug) {
      return NextResponse.json({ error: 'This store URL slug is already taken' }, { status: 400 });
    }

    const { data: existingEmail } = await supabase
      .from('agents').select('id').eq('email', email).single();
    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
    }

    // Resolve referrer by slug (the link only has the slug) but store
    // the STABLE UUID (referred_by_id) — slug stays only as a display label.
    // Self-referral guard included even though normally impossible (the
    // slug doesn't exist yet at registration time).
    let validReferredById: string | null = null;
    let validReferredBySlug: string | null = null;

    if (referredBy && typeof referredBy === 'string') {
      const cleanRef = referredBy.trim().toLowerCase();
      if (cleanRef !== slug) {
        const { data: referrer } = await supabase
          .from('agents').select('id, slug').eq('slug', cleanRef).eq('status', 'active').single();
        if (referrer) {
          validReferredById  = referrer.id;
          validReferredBySlug = referrer.slug;
        }
      }
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to create account' }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const { error: agentError } = await supabase.from('agents').insert({
      auth_user_id: authData.user.id,
      name:         `${firstName} ${lastName}`,
      email,
      phone,
      whatsapp:     whatsapp || phone,
      slug,
      store_name:   storeName,
      status:       'active',
      referred_by:    validReferredBySlug, // display label, kept for audit history
      referred_by_id: validReferredById,   // stable lookup, used by all logic
    });

    if (agentError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: `Failed to create agent profile: ${agentError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success:  true,
      storeUrl: `${siteUrl}/store/${slug}`,
    });
  } catch (e) {
    console.error('Register error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
