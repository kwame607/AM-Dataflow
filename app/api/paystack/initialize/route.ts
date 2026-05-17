import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email, amount, reference, metadata } = await req.json();

    if (!email || !amount || !reference) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
