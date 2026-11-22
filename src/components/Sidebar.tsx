import { AlarmClock, CalendarCheck2, LayoutDashboard } from 'lucide-react';
import type { Board } from '../domain/types';
import { ACCENT_SWATCH } from './styles';

export type View = 'board' | 'today' | 'overdue';

type Props = {
  view: View;
  onView: (v: View) => void;
  counts: { today: number; overdue: number };
  boards: Board[];
  activeBoardId: string;
  onOpenBoard: (id: string) => void;
};

function Logo() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent shadow-lg shadow-accent/25" aria-hidden="true">
      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-bg">
        <rect x="2" y="3" width="4" height="14" rx="1.5" />
        <rect x="8" y="3" width="4" height="10" rx="1.5" />
        <rect x="14" y="3" width="4" height="6" rx="1.5" />
      </svg>
    </span>
  );
}

/** Brand mark used in the mobile top bar (decorative there: the sidebar holds the page heading). */
export function MobileBrand() {
  return (
    <span className="flex items-center gap-2 md:hidden" aria-hidden="true">
      <Logo />
      <span className="text-base font-extrabold tracking-tight">FlowBoard</span>
    </span>
  );
}

/**
 * Desktop: a left rail with views and boards. Mobile: the same <nav> becomes a bottom tab bar and the
 * rest of the rail is hidden — every control is rendered once.
 */
export function Sidebar({ view, onView, counts, boards, activeBoardId, onOpenBoard }: Props) {
  const items = [
    { id: 'board' as const, label: 'Bảng', icon: LayoutDashboard, count: null, tone: '' },
    { id: 'today' as const, label: 'Hôm nay', icon: CalendarCheck2, count: counts.today, tone: 'bg-today/15 text-today' },
    { id: 'overdue' as const, label: 'Quá hạn', icon: AlarmClock, count: counts.overdue, tone: 'bg-late/15 text-[#ffb3ac]' },
  ];

  return (
    <aside className="contents md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6 md:border-r md:border-line md:bg-rail md:px-3 md:py-5">
      <div className="flex items-center gap-2.5 px-2 max-md:sr-only">
        <Logo />
        <h1 className="text-lg font-extrabold tracking-tight">FlowBoard</h1>
      </div>

      <nav
        aria-label="Chế độ xem"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-rail/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur md:static md:flex md:flex-col md:gap-0.5 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
      >
        {items.map(({ id, label, icon: Icon, count, tone }) => {
          const current = view === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={current ? 'page' : undefined}
              aria-label={count === null ? label : `${label} ${count}`}
              onClick={() => onView(id)}
              className={`group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition md:flex-row md:gap-2.5 md:px-2.5 md:py-2 md:text-sm ${
                current ? 'text-fg md:bg-white/[0.06]' : 'text-muted hover:text-fg md:hover:bg-white/[0.03]'
              }`}
            >
              <span className="relative">
                <Icon size={18} className={current ? 'text-accent' : ''} aria-hidden="true" />
                {count !== null && count > 0 && <span className={`absolute -right-2 -top-1 h-2 w-2 rounded-full md:hidden ${id === 'today' ? 'bg-today' : 'bg-late'}`} aria-hidden="true" />}
              </span>
              <span>{label}</span>
              {count !== null && (
                <span className={`ml-auto hidden min-w-6 rounded-md px-1.5 py-0.5 text-center text-[11px] tabular-nums md:inline ${count > 0 ? tone : 'text-faint'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <p id="boards-heading" className="mb-1.5 px-2.5 text-xs font-semibold text-faint">
          Bảng của bạn
        </p>
        <ul aria-labelledby="boards-heading" className="flex flex-col gap-0.5 overflow-y-auto">
          {boards.map((b) => {
            const current = view === 'board' && b.id === activeBoardId;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  aria-label={`Mở bảng ${b.name}`}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onOpenBoard(b.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${current ? 'bg-white/[0.06] font-semibold text-fg' : 'text-muted hover:bg-white/[0.03] hover:text-fg'}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: ACCENT_SWATCH[b.accent] }} aria-hidden="true" />
                  <span className="truncate">{b.name}</span>
                  <span className="ml-auto text-[11px] tabular-nums text-faint" aria-hidden="true">
                    {Object.keys(b.tasks).length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
