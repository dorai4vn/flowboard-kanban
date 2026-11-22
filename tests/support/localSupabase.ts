import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createSupabaseClient, type FlowboardClient } from '../../src/lib/supabase';

type Status = { API_URL: string; PUBLISHABLE_KEY?: string; ANON_KEY: string; SECRET_KEY?: string; SERVICE_ROLE_KEY: string };

let cached: Status | null = null;

/**
 * Connection info of the LOCAL Supabase stack, read at run time from `supabase status`.
 * Keys are the public demo keys of the local stack; they are never written to disk or logged.
 */
export function localStatus(): Status {
  if (cached) return cached;
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const json = JSON.parse(out.slice(out.indexOf('{'))) as Status;
  const host = new URL(json.API_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Integration tests only run against Supabase Local');
  cached = json;
  return json;
}

export function publicKey(): string {
  const s = localStatus();
  return s.PUBLISHABLE_KEY ?? s.ANON_KEY;
}

/** Create a confirmed email/password user on the local stack (email auth is enabled only locally). */
export async function createTestUser(label: string): Promise<{ email: string; password: string; id: string }> {
  const s = localStatus();
  const admin = createClient<Database>(s.API_URL, s.SECRET_KEY ?? s.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${label}-${randomUUID().slice(0, 8)}@flowboard.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('could not create local test user');
  return { email, password, id: data.user.id };
}

/** A signed-in client for a fresh local test user (node: no URL detection, no persisted session). */
export async function signedInClient(label: string): Promise<{ client: FlowboardClient; userId: string; email: string; password: string }> {
  const u = await createTestUser(label);
  const client = createSupabaseClient(localStatus().API_URL, publicKey(), { persistSession: false, detectSessionInUrl: false });
  const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error('could not sign in local test user');
  return { client, userId: u.id, email: u.email, password: u.password };
}
