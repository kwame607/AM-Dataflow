/**
 * lib/settings.ts
 * Platform settings stored in app_settings table (id=1).
 * Provider options: 'xpresportal' | 'hubnet' | 'myztadata'
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server';

export type Provider = 'xpresportal' | 'hubnet' | 'myztadata';

export async function getActiveProvider(): Promise<Provider> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('app_settings')
      .select('active_provider')
      .eq('id', 1)
      .single();
    const p = data?.active_provider as Provider;
    return p === 'hubnet' || p === 'myztadata' ? p : 'xpresportal';
  } catch {
    return 'xpresportal';
  }
}

export async function setActiveProvider(provider: Provider): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('app_settings')
      .update({ active_provider: provider, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function getReferralPct(): Promise<number> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('app_settings')
      .select('referral_pct')
      .eq('id', 1)
      .single();
    return parseFloat(String(data?.referral_pct ?? 10));
  } catch {
    return 10;
  }
}

export async function setReferralPct(pct: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('app_settings')
      .update({ referral_pct: pct, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function resolveProviderForOrder(network: string): Promise<Provider> {
  const active = await getActiveProvider();
  // MyZtaData doesn't support AT — fall back to XpresPortal for AT orders
  // even when MyZtaData is the active provider.
  if (active === 'myztadata' && network.toLowerCase() === 'at') {
    console.warn('[settings] MyZtaData active but network is AT — falling back to XpresPortal for this order');
    return 'xpresportal';
  }
  return active;
}
