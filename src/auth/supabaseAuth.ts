import type { User } from '@supabase/supabase-js';
import type { FlowboardClient } from '../lib/supabase';
import { LOGIN_ERROR, type AuthClient, type AuthUser } from './authClient';

function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    id: u.id,
    email: u.email ?? null,
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
  };
}

/** Remove OAuth leftovers (?code, ?error…) from the address bar without reloading. */
function cleanUrl(keys: string[]) {
  const url = new URL(window.location.href);
  let changed = false;
  for (const k of keys) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function createSupabaseAuth(client: FlowboardClient): AuthClient {
  return {
    async getUser() {
      // With PKCE + detectSessionInUrl, getSession() waits for the ?code exchange to finish.
      const hadCode = new URLSearchParams(window.location.search).has('code');
      const { data, error } = await client.auth.getSession();
      cleanUrl(['code']);
      // Returning from Google without a session means the code exchange failed: let the UI explain.
      if (hadCode && (error || !data.session)) throw new Error('oauth code exchange failed');
      if (error) return null;
      return toAuthUser(data.session?.user);
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase advises not to call other Supabase APIs inside this callback: defer.
        setTimeout(() => cb(toAuthUser(session?.user)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      return error ? LOGIN_ERROR : null;
    },
    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async signOut() {
      // Sign out this browser only; the local session is removed even if the network call fails.
      await client.auth.signOut({ scope: 'local' });
    },
    redirectError() {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const failed = params.has('error') || hash.has('error');
      cleanUrl(['error', 'error_code', 'error_description']);
      if (hash.has('error')) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      return failed ? LOGIN_ERROR : null;
    },
  };
}
