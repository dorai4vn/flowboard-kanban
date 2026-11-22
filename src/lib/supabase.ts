import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export type FlowboardClient = SupabaseClient<Database>;

export const AUTH_STORAGE_KEY = 'flowboard-auth';

type ClientOptions = { persistSession?: boolean; detectSessionInUrl?: boolean };

/**
 * Browser/Node client using ONLY the public URL + publishable (anon) key. Row Level Security protects data;
 * a service_role/secret key must never be passed here.
 */
export function createSupabaseClient(url: string, publishableKey: string, options: ClientOptions = {}): FlowboardClient {
  return createClient<Database>(url, publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: options.detectSessionInUrl ?? true,
      persistSession: options.persistSession ?? true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
}

export type SupabaseConfig = { url: string; publishableKey: string };

/** Read the Vite env. Returns null when not configured so the UI can explain instead of crashing. */
export function readSupabaseConfig(env: Record<string, string | undefined> = import.meta.env): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
