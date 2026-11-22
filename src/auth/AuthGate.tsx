import { useEffect, useState } from 'react';
import App from '../App';
import { LoginScreen } from '../components/LoginScreen';
import { StatusScreen } from '../components/StatusScreen';
import { getAppStore, useBoardStore } from '../store/useBoardStore';
import type { AuthClient, AuthUser } from './authClient';

/**
 * Owns the session: restores it, follows sign-in/out/user changes and tells the store to switch user.
 * The store clears the previous user's data synchronously inside switchUser.
 */
export function AuthGate({ auth, today }: { auth: AuthClient; today?: string }) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [redirectError] = useState(() => auth.redirectError?.() ?? null);
  const status = useBoardStore((s) => s.status);
  const reload = useBoardStore((s) => s.reload);

  useEffect(() => {
    let alive = true;
    let changed = false;
    const apply = (u: AuthUser | null) => {
      if (!alive) return;
      const store = getAppStore();
      if ((u?.id ?? null) !== store.getState().userId) void store.getState().switchUser(u?.id ?? null);
      setUser(u);
      setChecking(false);
    };
    const off = auth.onChange((u) => {
      changed = true;
      apply(u);
    });
    auth.getUser().then(
      (u) => !changed && apply(u),
      () => !changed && apply(null),
    );
    return () => {
      alive = false;
      off();
    };
  }, [auth]);

  const signOut = async () => {
    // Clear the board first so nothing of this user stays on screen, then end the session.
    await getAppStore().getState().switchUser(null);
    setUser(null);
    await auth.signOut().catch(() => undefined);
  };

  if (checking) return <StatusScreen title="Đang kiểm tra đăng nhập…" busy />;
  if (!user) return <LoginScreen onLogin={() => auth.signInWithGoogle()} error={redirectError} />;
  if (status === 'loading' || status === 'signedOut') return <StatusScreen title="Đang tải bảng…" busy />;
  if (status === 'error') {
    return (
      <StatusScreen title="Không tải được dữ liệu.">
        <div className="flex gap-2">
          <button type="button" onClick={() => void reload()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg">
            Thử lại
          </button>
          <button type="button" onClick={() => void signOut()} className="rounded-lg border border-line-strong px-4 py-2 text-sm text-muted">
            Đăng xuất
          </button>
        </div>
      </StatusScreen>
    );
  }
  return <App today={today} account={user} onSignOut={() => void signOut()} />;
}
