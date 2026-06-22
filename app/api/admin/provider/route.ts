// app/api/admin/provider/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { getActiveProvider, setActiveProvider } from '@/lib/settings';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = await getActiveProvider();
  return NextResponse.json({ provider });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { provider } = await req.json();
    if (provider !== 'xpresportal' && provider !== 'hubnet') {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const result = await setActiveProvider(provider);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    return NextResponse.json({ success: true, provider });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
