import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('orders')
      .update({
        delivery_status: 'delivered',
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
