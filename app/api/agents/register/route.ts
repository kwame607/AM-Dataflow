import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email, phone, whatsapp, storeName, slug, password } = await req.json();

    if (!firstName || !lastName || !email || !phone || !storeName || !slug || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Check slug uniqueness
    const { data: existingSlug } = await supabase
      .from('agents')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingSlug) {
      return NextResponse.json({ error: 'This store URL slug is already taken' }, { status: 400 });
    }

    // Check email uniqueness
    const { data: existingEmail } = await supabase
      .from('agents')
      .select('id')
      .eq('email', email)
      .single();

    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to create account' }, { status: 500 });
    }

    // Create agent profile
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const { error: agentError } = await supabase.from('agents').insert({
      auth_user_id: authData.user.id,
      name: `${firstName} ${lastName}`,
      email,
      phone,
      whatsapp: whatsapp || phone,
      slug,
      store_name: storeName,
      status: 'active',
    });

    if (agentError) {
      console.error('Agent insert error:', agentError);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: `Failed to create agent profile: ${agentError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      storeUrl: `${siteUrl}/store/${slug}`,
    });
  } catch (e) {
    console.error('Register error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
