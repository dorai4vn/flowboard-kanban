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

/**
 * Per-user request budget. The budget (30 requests / 10 minutes) is enforced inside Postgres by
 * agent_rate_limit_hit(), the only writer of the request log, so a user calling the API directly cannot
 * grow the log or erase it either.
 */
export async function withinRateLimit(db: FlowboardClient): Promise<boolean> {
  const { data, error } = await db.rpc('agent_rate_limit_hit');
  if (error) throw new Error('rate_limit_unavailable');
  return data === true;
}
