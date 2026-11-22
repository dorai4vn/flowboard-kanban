import { addDays, compareDateKeys, daysBetween, toLocalDateKey } from './dates';
import { normalizeText } from './text';
import { COLUMN_IDS, PRIORITIES, type Board, type ColumnId, type Priority, type Task } from './types';

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export type TaskFilter = {
  query: string;
  priorities: Priority[];
  labelIds: string[];
  due: DueFilter;
  todayMode: boolean;
};

export const EMPTY_FILTER: TaskFilter = { query: '', priorities: [], labelIds: [], due: 'all', todayMode: false };

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  all: 'Tất cả',
  overdue: 'Quá hạn',
  today: 'Hôm nay',
  week: '7 ngày tới',
  none: 'Không có hạn',
};

export function isFilterActive(f: TaskFilter): boolean {
  return f.query.trim() !== '' || f.priorities.length > 0 || f.labelIds.length > 0 || f.due !== 'all' || f.todayMode;
}

export function isOverdue(task: Task, column: ColumnId, today: string): boolean {
  return column !== 'done' && task.dueDate !== null && compareDateKeys(task.dueDate, today) < 0;
}

export function isDueToday(task: Task, today: string): boolean {
  return task.dueDate === today;
}

const completedToday = (task: Task, today: string) => task.completedAt !== null && toLocalDateKey(new Date(task.completedAt)) === today;

function matchesDue(task: Task, column: ColumnId, due: DueFilter, today: string): boolean {
  switch (due) {
    case 'all':
      return true;
    case 'overdue':
      return isOverdue(task, column, today);
    case 'today':
      return isDueToday(task, today);
    case 'week':
      return task.dueDate !== null && compareDateKeys(task.dueDate, today) >= 0 && compareDateKeys(task.dueDate, addDays(today, 6)) <= 0;
    case 'none':
      return task.dueDate === null;
  }
}

function matchesToday(task: Task, column: ColumnId, today: string): boolean {
  if (column === 'done') return completedToday(task, today);
  return task.dueDate !== null && compareDateKeys(task.dueDate, today) <= 0;
}

export function matchesFilter(task: Task, column: ColumnId, f: TaskFilter, today: string): boolean {
  const q = normalizeText(f.query);
  if (q && !normalizeText(task.title).includes(q) && !normalizeText(task.description).includes(q)) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(task.priority)) return false;
  if (f.labelIds.length > 0 && !task.labelIds.some((id) => f.labelIds.includes(id))) return false;
  if (!matchesDue(task, column, f.due, today)) return false;
  if (f.todayMode && !matchesToday(task, column, today)) return false;
  return true;
}

export function visibleColumn(b: Board, column: ColumnId, f: TaskFilter, today: string): Task[] {
  return b.columns[column].flatMap((id) => {
    const t = b.tasks[id];
    return t && matchesFilter(t, column, f, today) ? [t] : [];
  });
}

export function todaySummary(b: Board, today: string): { pending: number; overdue: number; doneToday: number } {
  let pending = 0;
  let overdue = 0;
  let doneToday = 0;
  for (const column of ['todo', 'doing', 'done'] as const) {
    for (const id of b.columns[column]) {
      const t = b.tasks[id];
      if (!t) continue;
      if (column === 'done') {
        if (completedToday(t, today)) doneToday++;
      } else if (matchesToday(t, column, today)) {
        pending++;
        if (isOverdue(t, column, today)) overdue++;
      }
    }
  }
  return { pending, overdue, doneToday };
}

/**
 * Convert a drop position in a filtered list into an index in the full column.
 * `visible` and the returned index both exclude `movingId`: the result is what `moveTask` expects.
 */
export function toFullIndex(full: string[], visible: string[], visibleIndex: number, movingId: string): number {
  const rest = full.filter((id) => id !== movingId);
  const shown = visible.filter((id) => id !== movingId);
  const before = shown[visibleIndex];
  if (before !== undefined) {
    const i = rest.indexOf(before);
    if (i >= 0) return i;
  }
  const last = shown[shown.length - 1];
  if (last === undefined) return rest.length;
  const j = rest.indexOf(last);
  return j >= 0 ? j + 1 : rest.length;
}

export type FocusKind = 'today' | 'overdue';

export type FocusItem = { task: Task; boardId: string; boardName: string; boardAccent: Board['accent']; column: ColumnId; daysLate: number };

/** Tasks across every board that are due today / overdue and not yet in “Hoàn thành”. */
export function focusTasks(s: { boards: Record<string, Board>; boardOrder: string[] }, kind: FocusKind, today: string): FocusItem[] {
  const items: FocusItem[] = [];
  for (const boardId of s.boardOrder) {
    const b = s.boards[boardId];
    if (!b) continue;
    for (const column of COLUMN_IDS) {
      if (column === 'done') continue;
      for (const id of b.columns[column]) {
        const task = b.tasks[id];
        if (!task?.dueDate) continue;
        const cmp = compareDateKeys(task.dueDate, today);
        if ((kind === 'today' && cmp === 0) || (kind === 'overdue' && cmp < 0)) {
          items.push({ task, boardId, boardName: b.name, boardAccent: b.accent, column, daysLate: Math.max(0, daysBetween(task.dueDate, today)) });
        }
      }
    }
  }
  const rank = (p: Priority) => PRIORITIES.indexOf(p);
  // stable sort keeps board/column order as the final tie-breaker
  return items.sort((x, y) =>
    kind === 'overdue'
      ? compareDateKeys(x.task.dueDate!, y.task.dueDate!) || rank(y.task.priority) - rank(x.task.priority)
      : rank(y.task.priority) - rank(x.task.priority),
  );
}
