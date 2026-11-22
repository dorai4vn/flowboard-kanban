import { AlarmClockOff, ArrowLeft, Check, PartyPopper } from 'lucide-react';
import { formatLongDate } from '../domain/dates';
import type { FocusItem, FocusKind } from '../domain/filters';
import { COLUMN_TITLES } from '../domain/types';
import { DueBadge, PriorityBadge } from './badges';
import { ACCENT_SWATCH } from './styles';

type Props = {
  kind: FocusKind;
  items: FocusItem[];
  today: string;
  readOnly: boolean;
  onOpen: (item: FocusItem) => void;
  onComplete: (item: FocusItem) => void;
  onBackToBoard: () => void;
};

const COPY = {
  today: {
    title: 'Hôm nay',
    list: 'Việc đến hạn hôm nay',
    count: (n: number) => (n === 0 ? 'Không còn việc nào đến hạn.' : `${n} việc đến hạn hôm nay`),
    empty: 'Không có việc nào đến hạn hôm nay.',
    hint: 'Việc có hạn chót hôm nay ở mọi bảng sẽ hiện ở đây.',
  },
  overdue: {
    title: 'Quá hạn',
    list: 'Việc quá hạn',
    count: (n: number) => (n === 0 ? 'Bạn đang theo kịp mọi hạn chót.' : `${n} việc đã qua hạn chót`),
    empty: 'Không có việc nào quá hạn.',
    hint: 'Việc chưa xong mà đã qua hạn chót sẽ hiện ở đây.',
  },
} as const;

/** Today / Overdue: a focused list of unfinished tasks gathered from every board. */
export function FocusView({ kind, items, today, readOnly, onOpen, onComplete, onBackToBoard }: Props) {
  const copy = COPY[kind];
  const tone = kind === 'today' ? 'text-today' : 'text-late';

  return (
    <section className="mx-auto w-full max-w-3xl" aria-labelledby="focus-title">
      <header className="mb-6">
        <h2 id="focus-title" className="text-sm font-semibold text-muted">
          {copy.title}
        </h2>
        <p className={`mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl ${kind === 'today' ? 'text-fg' : tone}`}>
          {kind === 'today' ? formatLongDate(today) : copy.count(items.length)}
        </p>
        {kind === 'today' && <p className={`mt-1.5 text-sm font-medium ${items.length ? tone : 'text-muted'}`}>{copy.count(items.length)}</p>}
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
          {kind === 'today' ? <PartyPopper size={28} className="text-today" aria-hidden="true" /> : <AlarmClockOff size={28} className="text-done" aria-hidden="true" />}
          <p className="text-base font-semibold text-fg">{copy.empty}</p>
          <p className="max-w-xs text-sm text-muted">{copy.hint}</p>
          <button
            type="button"
            onClick={onBackToBoard}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-fg/90 transition hover:bg-white/5"
          >
            <ArrowLeft size={15} aria-hidden="true" /> Về bảng công việc
          </button>
        </div>
      ) : (
        <ul aria-label={copy.list} className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface/80">
          {items.map((item) => (
            <li key={item.task.id} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025]">
              <button
                type="button"
                aria-label={`Đánh dấu hoàn thành ${item.task.title}`}
                title="Đánh dấu hoàn thành"
                disabled={readOnly}
                onClick={() => onComplete(item)}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-line-strong text-transparent transition hover:border-done hover:bg-done/15 hover:text-done disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={12} strokeWidth={3} aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" aria-label={`Mở ${item.task.title}`} onClick={() => onOpen(item)} className="block w-full text-left">
                  <h3 className="truncate text-sm font-semibold text-fg group-hover:text-accent-strong">{item.task.title}</h3>
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-fg/80">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT_SWATCH[item.boardAccent] }} aria-hidden="true" />
                    {item.boardName}
                  </span>
                  <span>{COLUMN_TITLES[item.column]}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                <PriorityBadge priority={item.task.priority} />
                <DueBadge dueDate={item.task.dueDate!} today={today} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
