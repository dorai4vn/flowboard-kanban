export type AuthUser = { id: string; email: string | null; name: string | null; avatarUrl: string | null };

/** The slice of authentication the UI needs; the Supabase implementation lives in supabaseAuth.ts. */
export interface AuthClient {
  getUser(): Promise<AuthUser | null>;
  /** Subscribe to sign-in, sign-out, token refresh and user changes. Returns an unsubscribe function. */
  onChange(cb: (user: AuthUser | null) => void): () => void;
  /** Starts the Google redirect. Resolves with an error message when it could not start. */
  signInWithGoogle(): Promise<string | null>;
  signOut(): Promise<void>;
  /** An OAuth error returned in the redirect URL (e.g. the user cancelled), consumed once. */
  redirectError?(): string | null;
}

export const LOGIN_ERROR = 'Không đăng nhập được, vui lòng thử lại.';
