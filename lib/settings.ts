// lib/settings.ts
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export type DeliveryProvider = 'xpresportal' | 'hubnet';

export async function getActiveProvider(): Promise<DeliveryProvider> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('active_provider')
      .eq('id', 1)
      .single();
    if (error || !data?.active_provider) return 'xpresportal';
    return data.active_provider === 'hubnet' ? 'hubnet' : 'xpresportal';
  } catch { return 'xpresportal'; }
}

export async function setActiveProvider(provider: DeliveryProvider): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('app_settings')
      .update({ active_provider: provider, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function resolveProviderForOrder(network: string): Promise<DeliveryProvider> {
  if (network === 'telecel') return 'xpresportal';
  return getActiveProvider();
}

// ── Referral percentage ───────────────────────────────────────
export async function getReferralPct(): Promise<number> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('app_settings')
      .select('referral_pct')
      .eq('id', 1)
      .single();
    return parseFloat(String(data?.referral_pct ?? 10));
  } catch { return 10; }
}

export async function setReferralPct(pct: number): Promise<{ ok: boolean; error?: string }> {
  if (pct < 0 || pct > 50) return { ok: false, error: 'Percentage must be between 0 and 50' };
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('app_settings')
      .update({ referral_pct: pct, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}
