import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export function getAdminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS || '';
  const extra = fromEnv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const legacy = [
    process.env.ADMIN_EMAIL,
    // NOTE: never use NEXT_PUBLIC_ here — it would embed the admin email in the client JS bundle
    'kwameadom607@gmail.com',
  ].filter(Boolean).map(e => (e as string).toLowerCase());
  return Array.from(new Set([...extra, ...legacy]));
}

export async function getSessionUser(req: NextRequest) {
  // Prefer Authorization header (sent explicitly by client)
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  );

  if (bearerToken) {
    const { data: { user } } = await supabase.auth.getUser(bearerToken);
    return user;
  }

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<{ ok: true; email: string } | { ok: false }> {
  const user = await getSessionUser(req);
  if (!user?.email) return { ok: false };
  const admins = getAdminEmails();
  if (!admins.includes(user.email.toLowerCase())) return { ok: false };
  return { ok: true, email: user.email };
}

export async function requireAuth(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false }> {
  const user = await getSessionUser(req);
  if (!user) return { ok: false };
  return { ok: true, userId: user.id };
}
