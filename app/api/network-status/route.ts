// app/api/network-status/route.ts
// GET  — public. Storefronts call this to know which networks to hide.
// PATCH — admin only. Body: { network: 'mtn'|'at'|'telecel', enabled: boolean, message?: string }
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { getNetworkStatus, setNetworkEnabled } from '@/lib/network-status';

export const dynamic = 'force-dynamic'; // never cache — toggles must take effect immediately

export async function GET() {
  const status = await getNetworkStatus();
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { network, enabled, message } = await req.json();
    if (!network || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Missing network or enabled' }, { status: 400 });
    }
    const result = await setNetworkEnabled(network, enabled, message);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
