import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAdminEmails } from '@/lib/auth-guard';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const path = req.nextUrl.pathname;

  // Only protect /dashboard and /xena (but NOT /xena/login)
  const isAdminLogin = path === '/xena/login' || path.startsWith('/xena/login/');
  if (!path.startsWith('/dashboard') && !path.startsWith('/xena')) return res;
  if (isAdminLogin) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = path.startsWith('/xena') ? '/xena/login' : '/login';
    return NextResponse.redirect(new URL(loginUrl, req.url));
  }

  // Admin check
  if (path.startsWith('/xena')) {
    if (!getAdminEmails().includes((user.email || '').toLowerCase())) {
      return NextResponse.redirect(new URL('/xena/login', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/xena/:path*'],
};
