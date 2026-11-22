import { describe, expect, it } from 'vitest';
import { createBoard } from './board';
import { boardStats, focusTasks, overdueBuckets, todayPlan } from './filters';
import { createTask } from './task';
import type { Board, ColumnId } from './types';

const today = '2026-11-22';
const now = '2026-11-22T02:00:00.000Z';

function board(name: string, tasks: [string, ColumnId, string | null][]): Board {
  const r = createBoard(name, now);
  if (!r.ok) throw new Error();
  let b = r.value;
  for (const [title, col, dueDate] of tasks) {
    const t = createTask(b, { title, dueDate }, col, now);
    if (!t.ok) throw new Error();
    b = t.value.board;
  }
  return b;
}
const state = (...bs: Board[]) => ({ boards: Object.fromEntries(bs.map((b) => [b.id, b])), boardOrder: bs.map((b) => b.id) });
const titles = (xs: { task: { title: string } }[]) => xs.map((x) => x.task.title);

describe('boardStats', () => {
  it('counts per column, completion percent and open deadlines of one board', () => {
    const b = board('A', [
      ['a', 'todo', '2026-11-22'],
      ['b', 'todo', '2026-11-20'],
      ['c', 'doing', null],
      ['d', 'done', '2026-11-01'],
      ['e', 'done', '2026-11-22'],
    ]);
    expect(boardStats(b, today)).toEqual({ todo: 2, doing: 1, done: 2, total: 5, percentDone: 40, dueToday: 1, overdue: 1 });
  });

  it('is all zeros for an empty board', () => {
    expect(boardStats(board('E', []), today)).toEqual({ todo: 0, doing: 0, done: 0, total: 0, percentDone: 0, dueToday: 0, overdue: 0 });
  });
});

describe('todayPlan', () => {
  it('splits tasks due today into pending and already done, across boards', () => {
    const a = board('A', [['a1', 'todo', '2026-11-22'], ['a2', 'done', '2026-11-22'], ['a3', 'todo', '2026-11-23']]);
    const b = board('B', [['b1', 'doing', '2026-11-22'], ['b2', 'done', '2026-11-21']]);
    const plan = todayPlan(state(a, b), today);
    expect(titles(plan.pending)).toEqual(titles(focusTasks(state(a, b), 'today', today)));
    expect(titles(plan.pending).sort()).toEqual(['a1', 'b1']);
    expect(titles(plan.done)).toEqual(['a2']);
    expect(plan.done[0]).toMatchObject({ boardName: 'A', column: 'done' });
  });
});

describe('overdueBuckets', () => {
  it('groups overdue tasks by how late they are, oldest group first, skipping empty groups', () => {
    const a = board('A', [
      ['10 ngày', 'todo', '2026-11-12'],
      ['8 ngày', 'todo', '2026-11-14'],
      ['7 ngày', 'todo', '2026-11-15'],
      ['2 ngày', 'doing', '2026-11-20'],
      ['1 ngày', 'todo', '2026-11-21'],
    ]);
    const buckets = overdueBuckets(focusTasks(state(a), 'overdue', today));
    expect(buckets.map((g) => [g.title, titles(g.items)])).toEqual([
      ['Trễ hơn 1 tuần', ['10 ngày', '8 ngày']],
      ['Trễ 2–7 ngày', ['7 ngày', '2 ngày']],
      ['Trễ 1 ngày', ['1 ngày']],
    ]);
    expect(overdueBuckets(focusTasks(state(board('B', [['x', 'todo', '2026-11-21']])), 'overdue', today)).map((g) => g.id)).toEqual(['day']);
    expect(overdueBuckets([])).toEqual([]);
  });
});
