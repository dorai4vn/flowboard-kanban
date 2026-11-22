import { describe, expect, it } from 'vitest';
import type { BoardsState } from '../data/mutations';
import { createBoard } from './board';
import { focusTasks } from './filters';
import { createTask } from './task';
import type { Board, ColumnId, Priority } from './types';

const today = '2026-11-22';
const now = '2026-11-22T02:00:00.000Z';

function board(name: string, tasks: [string, ColumnId, string | null, Priority?][]): Board {
  const r = createBoard(name, now);
  if (!r.ok) throw new Error();
  let b = r.value;
  for (const [title, col, dueDate, priority] of tasks) {
    const t = createTask(b, { title, dueDate, priority }, col, now);
    if (!t.ok) throw new Error();
    b = t.value.board;
  }
  return b;
}

function state(...bs: Board[]): BoardsState {
  return { boards: Object.fromEntries(bs.map((b) => [b.id, b])), boardOrder: bs.map((b) => b.id) };
}

const titles = (items: { task: { title: string } }[]) => items.map((i) => i.task.title);

describe('focusTasks', () => {
  const a = board('Bảng A', [
    ['Hạn hôm nay', 'todo', '2026-11-22', 'low'],
    ['Hôm nay khẩn', 'doing', '2026-11-22', 'urgent'],
    ['Hôm nay đã xong', 'done', '2026-11-22'],
    ['Trễ 1 ngày', 'todo', '2026-11-21', 'medium'],
    ['Trễ đã xong', 'done', '2026-11-01'],
    ['Ngày mai', 'todo', '2026-11-23'],
    ['Không hạn', 'todo', null],
  ]);
  const b = board('Bảng B', [
    ['Trễ 5 ngày', 'doing', '2026-11-17', 'low'],
    ['Trễ 1 ngày khẩn', 'todo', '2026-11-21', 'urgent'],
    ['B hôm nay', 'todo', '2026-11-22', 'medium'],
  ]);
  const s = state(a, b);

  it('today: due today and not done, across every board, highest priority first', () => {
    expect(titles(focusTasks(s, 'today', today))).toEqual(['Hôm nay khẩn', 'B hôm nay', 'Hạn hôm nay']);
  });

  it('overdue: due before today and not done, oldest first then highest priority', () => {
    expect(titles(focusTasks(s, 'overdue', today))).toEqual(['Trễ 5 ngày', 'Trễ 1 ngày khẩn', 'Trễ 1 ngày']);
  });

  it('describes where each task lives and how late it is', () => {
    const [first] = focusTasks(s, 'overdue', today);
    expect(first).toMatchObject({ boardId: b.id, boardName: 'Bảng B', column: 'doing', daysLate: 5 });
    expect(focusTasks(s, 'today', today)[0]).toMatchObject({ boardName: 'Bảng A', column: 'doing', daysLate: 0 });
  });

  it('is empty for an account without boards', () => {
    expect(focusTasks({ boards: {}, boardOrder: [] }, 'today', today)).toEqual([]);
  });
});
