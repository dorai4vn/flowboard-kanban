import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginScreen({ onLogin, error }: { onLogin: () => Promise<string | null>; error: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shown = message ?? error;

  const start = async () => {
    setBusy(true);
    setMessage(null);
    const err = await onLogin();
    if (err) {
      setMessage(err);
      setBusy(false);
    }
  };

  return (
    <div data-accent="indigo" className="board-glow grid min-h-dvh place-items-center px-4">
      <main className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface/90 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent shadow-lg shadow-accent/30" aria-hidden="true">
          <svg viewBox="0 0 20 20" className="h-6 w-6 fill-bg">
            <rect x="2" y="3" width="4" height="14" rx="1.5" />
            <rect x="8" y="3" width="4" height="10" rx="1.5" />
            <rect x="14" y="3" width="4" height="6" rx="1.5" />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">FlowBoard</h1>
        <p className="mt-2 text-sm text-muted">Bảng Kanban cá nhân. Đăng nhập để lưu công việc an toàn trên mọi thiết bị.</p>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg transition hover:bg-slate-100 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
        >
          <GoogleIcon />
          {busy ? 'Đang chuyển tới Google…' : 'Đăng nhập bằng Google'}
        </button>
        {shown && (
          <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {shown}
          </p>
        )}
        <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-faint">
          <ShieldCheck size={14} aria-hidden="true" /> Dữ liệu của bạn chỉ bạn mới xem được.
        </p>
      </main>
    </div>
  );
}
