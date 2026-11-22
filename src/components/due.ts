import { daysBetween, formatDueDate } from '../domain/dates';

export type DueTone = 'late' | 'today' | 'soon' | 'normal' | 'done';

/** Visible wording for a deadline relative to today; screen readers keep the “Hạn chót dd/MM…” form. */
export function describeDue(dueDate: string, today: string, done: boolean): { text: string; tone: DueTone; label: string } {
  const diff = daysBetween(today, dueDate);
  const date = formatDueDate(dueDate);
  if (done) return { text: date, tone: 'done', label: `Hạn chót ${date}` };
  if (diff < 0) return { text: `Trễ ${-diff} ngày`, tone: 'late', label: `Hạn chót ${date}, quá hạn` };
  if (diff === 0) return { text: 'Hôm nay', tone: 'today', label: `Hạn chót ${date}, hôm nay` };
  if (diff === 1) return { text: 'Ngày mai', tone: 'soon', label: `Hạn chót ${date}` };
  return { text: date, tone: 'normal', label: `Hạn chót ${date}` };
}

