import { CalendarClock } from 'lucide-react';
import { PRIORITY_LABELS, type Priority } from '../domain/types';
import { describeDue, type DueTone } from './due';

const PRIORITY_TONE: Record<Priority, string> = {
  low: 'bg-slate-400/10 text-slate-300 [--dot:var(--color-slate-400)]',
  medium: 'bg-sky-400/10 text-sky-200 [--dot:var(--color-sky-400)]',
  high: 'bg-orange-400/12 text-orange-200 [--dot:var(--color-orange-400)]',
  urgent: 'bg-late/15 text-[#ffb3ac] [--dot:var(--color-late)]',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_TONE[priority]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const DUE_TONE: Record<DueTone, string> = {
  late: 'bg-late/15 text-[#ffb3ac]',
  today: 'bg-today/15 text-today',
  soon: 'bg-white/5 text-fg/85',
  normal: 'text-muted',
  done: 'text-faint',
};

export function DueBadge({ dueDate, today, done = false }: { dueDate: string; today: string; done?: boolean }) {
  const d = describeDue(dueDate, today, done);
  return (
    <span aria-label={d.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${DUE_TONE[d.tone]}`}>
      <CalendarClock size={12} aria-hidden="true" />
      {d.text}
    </span>
  );
}
