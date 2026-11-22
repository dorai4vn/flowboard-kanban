import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.js';
import type { FlowboardClient } from '../../src/lib/supabase.js';

/**
 * A Supabase client that acts AS the signed-in user: the request's access token is sent on every call, so
 * Row Level Security applies to everything the agent does. Only the public URL + publishable key are used.
 */
export function userClient(url: string, publishableKey: string, accessToken: string): FlowboardClient {
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Resolve the user server-side (Supabase Auth validates the JWT); null for missing/invalid/expired tokens. */
export async function authenticate(url: string, publishableKey: string, authorization: string | null) {
  const match = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(authorization ?? '');
  if (!match) return null;
  const token = match[1]!;
  const db = userClient(url, publishableKey, token);
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return { db, userId: data.user.id };
  } catch {
    return null;
  }
}

/** Per-user request budget (insert-only log protected by RLS). */
export async function withinRateLimit(db: FlowboardClient, limit: number, windowMinutes: number): Promise<boolean> {
  const { error: insertError } = await db.from('agent_requests').insert({});
  if (insertError) throw new Error('rate_limit_unavailable');
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await db.from('agent_requests').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if (error) throw new Error('rate_limit_unavailable');
  return (count ?? 0) <= limit;
}
