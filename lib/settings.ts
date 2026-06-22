// lib/settings.ts
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export type DeliveryProvider = 'xpresportal' | 'hubnet';

/**
 * Reads the currently active delivery provider from app_settings.
 * Falls back to 'xpresportal' if the row is missing or the query fails —
 * never silently break order delivery because of a settings hiccup.
 */
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
  } catch (e) {
    console.error('[settings] getActiveProvider error:', e);
    return 'xpresportal';
  }
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
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Decides which provider should handle a given order.
 * Telecel is hardcoded to XpresPortal regardless of the toggle — Hubnet's
 * transaction endpoint does not actually accept telecel as a network value,
 * even though their docs list it in the general network reference table.
 */
export async function resolveProviderForOrder(network: string): Promise<DeliveryProvider> {
  if (network === 'telecel') return 'xpresportal';
  return getActiveProvider();
}
