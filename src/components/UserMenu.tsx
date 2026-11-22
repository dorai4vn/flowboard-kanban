import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import type { AuthUser } from '../auth/authClient';

export function UserMenu({ account, onSignOut }: { account: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = account.name ?? account.email ?? 'Người dùng';
  const initial = label.trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Tài khoản ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-line-strong bg-accent-soft text-sm font-semibold text-accent-strong transition hover:border-accent/60"
      >
        {account.avatarUrl ? <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initial}
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-line-strong bg-surface p-1.5 shadow-2xl shadow-black/50">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-fg">{label}</p>
            {account.email && account.email !== label && <p className="truncate text-xs text-muted">{account.email}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-fg/90 hover:bg-white/5 focus:bg-white/5 focus:outline-none"
          >
            <LogOut size={15} aria-hidden="true" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
