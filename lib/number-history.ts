// lib/number-history.ts
// Checks your OWN orders table to see whether a phone number has ever been
// delivered to before, and through which provider(s). This matters now
// because MTN/AT/Telecel verification is tied to whichever provider's
// customer database the number was originally submitted in — a number that
// succeeded through Hubnet once is "known" to Hubnet's submitted database,
// even if it's never touched XpresPortal or MyZtaData, and vice versa.
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export interface NumberHistoryResult {
  everOrdered: boolean;
  /** Providers where this number has at least one order that wasn't rejected outright (processing or delivered) */
  knownProviders: string[];
  /** Of those, providers where the order actually completed delivery */
  deliveredProviders: string[];
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  totalOrders: number;
}

/** Normalizes to local format (0XXXXXXXXX) — matches how phone is stored on orders. */
function normalizePhone(phone: string): string {
  return phone.startsWith('233') ? '0' + phone.slice(3) : phone;
}

export async function getNumberOrderHistory(phone: string): Promise<NumberHistoryResult> {
  const supabase = createSupabaseAdminClient();
  const normalized = normalizePhone(phone.trim());

  const { data: orders } = await supabase
    .from('orders')
    .select('delivery_provider, delivery_status, created_at')
    .eq('phone', normalized)
    .eq('status', 'success') // payment succeeded — a delivery attempt was actually made
    .order('created_at', { ascending: true });

  const rows = orders || [];

  // "known" = provider accepted/attempted the order (processing or delivered).
  // A 'failed' delivery_status is excluded — a rejection doesn't prove the
  // provider's submitted database contains this number; it may have failed
  // for the verification reason itself, or for something unrelated.
  const knownRows = rows.filter(o => o.delivery_status === 'processing' || o.delivery_status === 'delivered');
  const deliveredRows = rows.filter(o => o.delivery_status === 'delivered');

  const knownProviders = Array.from(new Set(knownRows.map(o => o.delivery_provider).filter(Boolean))) as string[];
  const deliveredProviders = Array.from(new Set(deliveredRows.map(o => o.delivery_provider).filter(Boolean))) as string[];

  return {
    everOrdered: rows.length > 0,
    knownProviders,
    deliveredProviders,
    firstOrderAt: rows[0]?.created_at ?? null,
    lastOrderAt: rows[rows.length - 1]?.created_at ?? null,
    totalOrders: rows.length,
  };
}
