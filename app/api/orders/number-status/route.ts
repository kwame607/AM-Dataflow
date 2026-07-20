// app/api/orders/number-status/route.ts — NEW FILE
// Public, rate-limited endpoint used by the storefront checkout flow and
// receipt page to tell the customer whether a phone number is already
// "known" (i.e. likely already verified) based on this system's own order
// history — whether it has a prior processing/delivered order through any
// provider. Intentionally does NOT expose which provider — that detail is
// internal-only, shown to admins via the Orders tab badges instead.
import { NextRequest, NextResponse } from 'next/server';
import { getNumberOrderHistory } from '@/lib/number-history';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const rl = rateLimit(`number-status:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  const phone = req.nextUrl.searchParams.get('phone')?.trim();
  if (!phone) return NextResponse.json({ verified: false });

  const normalized = phone.startsWith('233') ? '0' + phone.slice(3) : phone;
  if (!/^0[2-9]\d{8}$/.test(normalized)) {
    return NextResponse.json({ verified: false });
  }

  try {
    const history = await getNumberOrderHistory(normalized);
    // Fail closed: if lookup errors out, we say "not verified" rather than
    // risk falsely reassuring a customer.
    return NextResponse.json({ verified: history.knownProviders.length > 0 });
  } catch (e) {
    console.error('[number-status]', e);
    return NextResponse.json({ verified: false });
  }
}
