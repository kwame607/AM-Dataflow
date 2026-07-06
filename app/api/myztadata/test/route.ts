// app/api/myztadata/test/route.ts
// TEMPORARY — delete after testing
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.MYZTADATA_API_KEY || '';

  try {
    const res  = await fetch('https://myztadata.com/api/v1/fetch-data-packages', {
      method:  'GET',
      headers: { 'x-api-key': key, 'Accept': 'application/json' },
      cache:   'no-store',
    });

    const text = await res.text();

    return NextResponse.json({
      status:       res.status,
      contentType:  res.headers.get('content-type'),
      isJson:       text.trim().startsWith('[') || text.trim().startsWith('{'),
      bodyPreview:  text.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
