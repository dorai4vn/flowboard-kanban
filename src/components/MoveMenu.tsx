import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { COLUMN_IDS, COLUMN_TITLES, type ColumnId } from '../domain/types';

type Props = { taskTitle: string; column: ColumnId; onMove: (to: ColumnId) => void };

/** Small menu to move a task to another column — the non-drag path, essential on phones. */
export function MoveMenu({ taskTitle, column, onMove }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className="absolute right-1.5 top-1.5">
      <button
        type="button"
        aria-label={`Chuyển công việc ${taskTitle}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-faint opacity-100 transition hover:bg-white/5 hover:text-fg focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 aria-expanded:opacity-100"
      >
        <ArrowRightLeft size={14} />
      </button>
      {open && (
        <div role="menu" aria-label="Chuyển sang cột" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-line-strong bg-surface p-1 shadow-xl shadow-black/50">
          {COLUMN_IDS.filter((c) => c !== column).map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMove(c);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-fg/90 hover:bg-white/5 focus:bg-white/5 focus:outline-none"
            >
              Chuyển sang {COLUMN_TITLES[c]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
