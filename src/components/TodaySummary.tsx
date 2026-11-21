import { Sun } from 'lucide-react';
import { todaySummary } from '../domain/filters';
import type { Board } from '../domain/types';

export function TodaySummary({ board, today }: { board: Board; today: string }) {
  const { pending, overdue, doneToday } = todaySummary(board, today);
  const total = pending + doneToday;
  const pct = total === 0 ? 0 : Math.round((doneToday / total) * 100);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3">
      <Sun size={18} className="text-accent" aria-hidden="true" />
      <p className="text-sm font-medium text-fg">{`Hôm nay: ${pending} việc cần làm · ${overdue} quá hạn · ${doneToday} đã xong`}</p>
      <div className="ml-auto flex items-center gap-2">
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Tiến độ hôm nay" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted">{pct}%</span>
      </div>
    </div>
  );
}
