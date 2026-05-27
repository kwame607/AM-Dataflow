import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { InitializePaymentSchema } from '@/lib/validate';

export async function POST(req: NextRequest) {
  // Rate limit: 10 payment initializations per minute per IP
  const ip = getIp(req);
  const rl = rateLimit(`init:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait before trying again.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter) },
    });
  }

  try {
    const body = await req.json();
    const parsed = InitializePaymentSchema.safeParse(body);
    if (!parsed.success) {
  console.log('VALIDATION ERROR:', JSON.stringify(parsed.error.flatten()));
  return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
}
    const { email, amount, reference, metadata } = parsed.data;

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Payment not configured on server' }, { status: 500 });
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, amount, reference, currency: 'GHS', metadata }),
    });

    const data = await response.json();
    console.log('Paystack initialize response:', data);

    if (!data.status) {
      return NextResponse.json({ error: data.message || 'Paystack initialization failed' }, { status: 400 });
    }

    return NextResponse.json({
      access_code: data.data.access_code,
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (e) {
    console.error('Paystack initialize error:', e);
    return NextResponse.json({ error: 'Server error initializing payment' }, { status: 500 });
  }
}
