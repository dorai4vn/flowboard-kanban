import { AlarmClock, CalendarCheck2 } from 'lucide-react';
import { boardStats } from '../domain/filters';
import type { Board } from '../domain/types';

/** Compact board dashboard: where the work sits, how much is done, and what is due. */
export function BoardOverview({ board, today }: { board: Board; today: string }) {
  const s = boardStats(board, today);
  const pct = (n: number) => (s.total === 0 ? 0 : (n / s.total) * 100);
  const legend = [
    { label: 'Cần làm', n: s.todo, dot: 'bg-slate-400/70' },
    { label: 'Đang làm', n: s.doing, dot: 'bg-accent' },
    { label: 'Hoàn thành', n: s.done, dot: 'bg-done' },
  ];

  return (
    <section aria-label="Tổng quan bảng" className="mb-5 flex flex-col gap-4 rounded-2xl border border-line bg-surface/60 px-4 py-4 sm:flex-row sm:items-center sm:gap-8 sm:px-5">
      <div className="flex items-baseline gap-3 sm:min-w-[132px] sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-3xl font-extrabold tabular-nums tracking-tight text-fg">{s.percentDone}%</span>
        <span className="text-xs font-medium text-muted">đã hoàn thành trên {s.total} công việc</span>
      </div>

      <div className="min-w-0 flex-1">
        <div
          role="progressbar"
          aria-label="Tiến độ bảng"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.percentDone}
          className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
        >
          <span className="h-full bg-slate-400/50 transition-[width] duration-300" style={{ width: `${pct(s.todo)}%` }} />
          <span className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct(s.doing)}%` }} />
          <span className="h-full bg-done transition-[width] duration-300" style={{ width: `${pct(s.done)}%` }} />
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {legend.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${l.dot}`} aria-hidden="true" />
              <span className="tabular-nums">{`${l.label} ${l.n}`}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${s.dueToday ? 'bg-today/12 text-today' : 'bg-white/[0.04] text-faint'}`}>
          <CalendarCheck2 size={14} aria-hidden="true" />
          {s.dueToday} đến hạn hôm nay
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${s.overdue ? 'bg-late/12 text-[#ffb3ac]' : 'bg-white/[0.04] text-faint'}`}>
          <AlarmClock size={14} aria-hidden="true" />
          {s.overdue} quá hạn
        </span>
      </div>
    </section>
  );
}
