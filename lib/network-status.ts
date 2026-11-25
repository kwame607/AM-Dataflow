// lib/network-status.ts
// Server-side helpers for the global per-network on/off switch.
// Source of truth: app_settings.disabled_networks (text[]) + network_messages (jsonb).
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export const VALID_NETWORKS = ['mtn', 'at', 'telecel'] as const;
export type NetworkKey = (typeof VALID_NETWORKS)[number];

const NET_LABELS: Record<string, string> = { mtn: 'MTN', at: 'AirtelTigo', telecel: 'Telecel' };

export interface NetworkStatus {
  disabled: string[];
  messages: Record<string, string>;
}

// Normalise the several spellings that appear around the codebase
// (validate.ts allows 'airteltigo').
export function normalizeNetwork(n: string): string {
  const v = (n || '').toLowerCase().trim();
  return v === 'airteltigo' ? 'at' : v;
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('app_settings')
      .select('disabled_networks, network_messages')
      .eq('id', 1)
      .single();
    return {
      disabled: Array.isArray(data?.disabled_networks) ? data!.disabled_networks : [],
      messages: (data?.network_messages as Record<string, string>) || {},
    };
  } catch {
    // Fail OPEN: if the settings read fails, don't take the whole store down.
    return { disabled: [], messages: {} };
  }
}

export async function isNetworkDisabled(
  network: string
): Promise<{ disabled: boolean; message: string }> {
  const key = normalizeNetwork(network);
  const status = await getNetworkStatus();
  const disabled = status.disabled.includes(key);
  const label = NET_LABELS[key] || key.toUpperCase();
  return {
    disabled,
    message:
      status.messages[key]?.trim() ||
      `${label} bundles are temporarily unavailable. Please check back soon.`,
  };
}

export async function setNetworkEnabled(
  network: string,
  enabled: boolean,
  message?: string
): Promise<{ ok: boolean; error?: string }> {
  const key = normalizeNetwork(network);
  if (!VALID_NETWORKS.includes(key as NetworkKey)) return { ok: false, error: 'Invalid network' };

  try {
    const supabase = createSupabaseAdminClient();
    const current = await getNetworkStatus();

    const disabledSet = new Set(current.disabled);
    const messages = { ...current.messages };

    if (enabled) {
      disabledSet.delete(key);
      delete messages[key];
    } else {
      disabledSet.add(key);
      if (message?.trim()) messages[key] = message.trim().slice(0, 200);
      else delete messages[key];
    }

    const { error } = await supabase
      .from('app_settings')
      .update({
        disabled_networks: Array.from(disabledSet),
        network_messages: messages,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
