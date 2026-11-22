import type { ReactNode } from 'react';

/** Full-page message used while checking the session, loading, or after a load error. */
export function StatusScreen({ title, children, busy = false }: { title: string; children?: ReactNode; busy?: boolean }) {
  return (
    <div data-accent="indigo" className="board-glow grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center gap-4 text-center" role={busy ? 'status' : undefined}>
        {busy && <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden="true" />}
        <p className="text-sm font-medium text-fg">{title}</p>
        {children}
      </div>
    </div>
  );
}
