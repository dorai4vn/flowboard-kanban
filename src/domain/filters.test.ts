import { describe, expect, it } from 'vitest';
import { createBoard } from './board';
import { EMPTY_FILTER, isFilterActive, isOverdue, matchesFilter, toFullIndex, todaySummary, visibleColumn, type TaskFilter } from './filters';
import { createTask } from './task';
import type { TaskInput } from './task';
import type { Board, ColumnId, Task } from './types';

const today = '2026-11-21';
const now = '2026-11-21T01:00:00.000Z';
// Local-time instants so "completed today" does not depend on the machine's time zone.
const todayInstant = new Date(2026, 10, 21, 10, 0).toISOString();
const yesterdayInstant = new Date(2026, 10, 20, 10, 0).toISOString();

type Seed = { col: ColumnId; input: TaskInput; completedAt?: string };

function build(seeds: Seed[]): Board {
  const r0 = createBoard('B', now);
  if (!r0.ok) throw new Error(r0.error);
  let b = r0.value;
  for (const s of seeds) {
    const r = createTask(b, s.input, s.col, now);
    if (!r.ok) throw new Error(r.error);
    b = r.value.board;
    if (s.completedAt) b = { ...b, tasks: { ...b.tasks, [r.value.task.id]: { ...r.value.task, completedAt: s.completedAt } } };
  }
  return b;
}

const f = (patch: Partial<TaskFilter>): TaskFilter => ({ ...EMPTY_FILTER, ...patch });
const visibleTitles = (b: Board, col: ColumnId, filter: TaskFilter) => visibleColumn(b, col, filter, today).map((t) => t.title);
const task = (b: Board, title: string): Task => Object.values(b.tasks).find((t) => t.title === title)!;

describe('isFilterActive', () => {
  it('is false for the empty filter and true once anything is set', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive(f({ query: '  ' }))).toBe(false);
    expect(isFilterActive(f({ query: 'a' }))).toBe(true);
    expect(isFilterActive(f({ due: 'today' }))).toBe(true);
    expect(isFilterActive(f({ todayMode: true }))).toBe(true);
  });
});

describe('search', () => {
  const b = build([
    { col: 'todo', input: { title: 'Báo cáo tuần' } },
    { col: 'todo', input: { title: 'Họp nhóm', description: 'viết BÁO CÁO' } },
    { col: 'todo', input: { title: 'Bài tập' } },
  ]);

  it('matches title or description ignoring case and diacritics', () => {
    expect(visibleTitles(b, 'todo', f({ query: 'bao cao' }))).toEqual(['Báo cáo tuần', 'Họp nhóm']);
  });

  it('shows everything with the empty filter, in column order', () => {
    expect(visibleTitles(b, 'todo', EMPTY_FILTER)).toEqual(['Báo cáo tuần', 'Họp nhóm', 'Bài tập']);
  });
});

describe('priority and label filters', () => {
  it('keeps only selected priorities, combined with the query (AND)', () => {
    const b = build([
      { col: 'todo', input: { title: 'Báo cáo A', priority: 'high' } },
      { col: 'todo', input: { title: 'Báo cáo B', priority: 'low' } },
      { col: 'todo', input: { title: 'Khác', priority: 'urgent' } },
    ]);
    expect(visibleTitles(b, 'todo', f({ priorities: ['high', 'urgent'] }))).toEqual(['Báo cáo A', 'Khác']);
    expect(visibleTitles(b, 'todo', f({ priorities: ['high', 'urgent'], query: 'bao cao' }))).toEqual(['Báo cáo A']);
  });

  it('keeps tasks having at least one selected label', () => {
    const base = build([]);
    const [l1, l2] = [base.labels[0]!.id, base.labels[1]!.id];
    let b = base;
    for (const [title, labelIds] of [['A', [l1]], ['B', [l2]], ['C', []]] as const) {
      const r = createTask(b, { title, labelIds: [...labelIds] }, 'todo', now);
      if (!r.ok) throw new Error(r.error);
      b = r.value.board;
    }
    expect(visibleTitles(b, 'todo', f({ labelIds: [l1] }))).toEqual(['A']);
  });
});

describe('due filter', () => {
  const b = build([
    { col: 'todo', input: { title: 'Quá hạn', dueDate: '2026-11-20' } },
    { col: 'done', input: { title: 'Quá hạn nhưng xong', dueDate: '2026-11-20' } },
    { col: 'todo', input: { title: 'Hôm nay', dueDate: '2026-11-21' } },
    { col: 'todo', input: { title: 'Ngày 7', dueDate: '2026-11-27' } },
    { col: 'todo', input: { title: 'Ngày 8', dueDate: '2026-11-28' } },
    { col: 'todo', input: { title: 'Không hạn' } },
  ]);

  it('overdue excludes done tasks', () => {
    expect(visibleTitles(b, 'todo', f({ due: 'overdue' }))).toEqual(['Quá hạn']);
    expect(visibleTitles(b, 'done', f({ due: 'overdue' }))).toEqual([]);
  });

  it('today, week (today..+6) and none', () => {
    expect(visibleTitles(b, 'todo', f({ due: 'today' }))).toEqual(['Hôm nay']);
    expect(visibleTitles(b, 'todo', f({ due: 'week' }))).toEqual(['Hôm nay', 'Ngày 7']);
    expect(visibleTitles(b, 'todo', f({ due: 'none' }))).toEqual(['Không hạn']);
  });

  it('isOverdue only for unfinished tasks before today', () => {
    expect(isOverdue(task(b, 'Quá hạn'), 'todo', today)).toBe(true);
    expect(isOverdue(task(b, 'Quá hạn nhưng xong'), 'done', today)).toBe(false);
    expect(isOverdue(task(b, 'Hôm nay'), 'todo', today)).toBe(false);
  });
});

describe('today mode', () => {
  const b = build([
    { col: 'todo', input: { title: 'Hạn hôm nay', dueDate: '2026-11-21' } },
    { col: 'doing', input: { title: 'Quá hạn', dueDate: '2026-11-19' } },
    { col: 'todo', input: { title: 'Ngày mai', dueDate: '2026-11-22' } },
    { col: 'todo', input: { title: 'Không hạn' } },
    { col: 'done', input: { title: 'Xong hôm nay' }, completedAt: todayInstant },
    { col: 'done', input: { title: 'Xong hôm qua', dueDate: '2026-11-20' }, completedAt: yesterdayInstant },
  ]);
  const tm = f({ todayMode: true });

  it('shows due-or-overdue unfinished tasks plus tasks completed today', () => {
    expect(visibleTitles(b, 'todo', tm)).toEqual(['Hạn hôm nay']);
    expect(visibleTitles(b, 'doing', tm)).toEqual(['Quá hạn']);
    expect(visibleTitles(b, 'done', tm)).toEqual(['Xong hôm nay']);
  });

  it('summarises pending, overdue and done today', () => {
    expect(todaySummary(b, today)).toEqual({ pending: 2, overdue: 1, doneToday: 1 });
  });

  it('matchesFilter agrees with visibleColumn', () => {
    expect(matchesFilter(task(b, 'Ngày mai'), 'todo', tm, today)).toBe(false);
  });
});

describe('toFullIndex', () => {
  const full = ['a', 'x', 'b', 'y', 'c'];
  const visible = ['a', 'b', 'c'];

  it('inserts before the visible task at the drop index', () => {
    expect(toFullIndex(full, visible, 1, 'z')).toBe(2);
    expect(toFullIndex(full, visible, 0, 'z')).toBe(0);
  });

  it('dropping after the last visible task goes right after it', () => {
    expect(toFullIndex(full, visible, 3, 'z')).toBe(5);
    expect(toFullIndex(['a', 'x'], ['a'], 1, 'z')).toBe(1);
  });

  it('computes the index after removing the moving task', () => {
    // moving 'a' down to after 'b' (visible list without a is [b, c]; index 1 = before c)
    expect(toFullIndex(full, ['b', 'c'], 1, 'a')).toBe(3);
  });

  it('empty visible list appends to the end', () => {
    expect(toFullIndex(['x', 'y'], [], 0, 'z')).toBe(2);
  });
});
