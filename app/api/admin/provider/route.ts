// app/api/admin/provider/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { getActiveProvider, setActiveProvider } from '@/lib/settings';
import type { Provider } from '@/lib/settings';

const VALID: Provider[] = ['xpresportal', 'hubnet', 'myztadata'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const provider = await getActiveProvider();
  return NextResponse.json({ provider });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await req.json();
  if (!VALID.includes(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await setActiveProvider(provider as Provider);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, provider });
}
