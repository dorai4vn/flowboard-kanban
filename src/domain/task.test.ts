import { describe, expect, it } from 'vitest';
import { createBoard } from './board';
import { createTask, deleteTask, findColumn, moveTask, updateTask } from './task';
import type { Board, ColumnId } from './types';

const now = '2026-11-21T08:00:00.000Z';
const later = '2026-11-21T09:00:00.000Z';

function emptyBoard(): Board {
  const r = createBoard('B', now);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function withTasks(spec: Partial<Record<ColumnId, string[]>>): Board {
  let b = emptyBoard();
  for (const [col, titles] of Object.entries(spec) as [ColumnId, string[]][]) {
    for (const title of titles) {
      const r = createTask(b, { title }, col, now);
      if (!r.ok) throw new Error(r.error);
      b = r.value.board;
    }
  }
  return b;
}

const idOf = (b: Board, title: string) => Object.values(b.tasks).find((t) => t.title === title)!.id;
const titles = (b: Board, col: ColumnId) => b.columns[col].map((id) => b.tasks[id]!.title);

describe('createTask', () => {
  it('rejects a blank title', () => {
    expect(createTask(emptyBoard(), { title: '   ' }, 'todo', now)).toEqual({ ok: false, error: 'Vui lòng nhập tiêu đề' });
  });

  it('rejects titles over 200 characters and descriptions over 2000', () => {
    expect(createTask(emptyBoard(), { title: 'a'.repeat(201) }, 'todo', now)).toEqual({ ok: false, error: 'Tiêu đề tối đa 200 ký tự' });
    expect(createTask(emptyBoard(), { title: 'a'.repeat(200) }, 'todo', now).ok).toBe(true);
    expect(createTask(emptyBoard(), { title: 'a', description: 'x'.repeat(2001) }, 'todo', now)).toEqual({
      ok: false,
      error: 'Mô tả tối đa 2000 ký tự',
    });
  });

  it('trims, defaults to medium priority and appends to the column', () => {
    const b = withTasks({ todo: ['Đầu tiên'] });
    const r = createTask(b, { title: '  Nộp bài  ' }, 'todo', now);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.task).toMatchObject({ title: 'Nộp bài', priority: 'medium', dueDate: null, completedAt: null, description: '' });
    expect(titles(r.value.board, 'todo')).toEqual(['Đầu tiên', 'Nộp bài']);
  });

  it('marks a task created directly in done as completed', () => {
    const r = createTask(emptyBoard(), { title: 'Xong' }, 'done', now);
    expect(r.ok && r.value.task.completedAt).toBe(now);
  });

  it('drops label ids that do not belong to the board', () => {
    const b = emptyBoard();
    const r = createTask(b, { title: 'A', labelIds: [b.labels[0]!.id, 'ghost'] }, 'todo', now);
    expect(r.ok && r.value.task.labelIds).toEqual([b.labels[0]!.id]);
  });

  it('does not mutate the input board', () => {
    const b = emptyBoard();
    const snapshot = structuredClone(b);
    createTask(b, { title: 'A' }, 'todo', now);
    expect(b).toEqual(snapshot);
  });
});

describe('updateTask', () => {
  it('updates fields and updatedAt', () => {
    const b = withTasks({ todo: ['A'] });
    const r = updateTask(b, idOf(b, 'A'), { title: 'B', priority: 'urgent', dueDate: '2026-11-22' }, later);
    if (!r.ok) throw new Error(r.error);
    const t = Object.values(r.value.tasks)[0]!;
    expect(t).toMatchObject({ title: 'B', priority: 'urgent', dueDate: '2026-11-22', updatedAt: later, createdAt: now });
  });

  it('rejects a blank title and leaves an unknown id as an error', () => {
    const b = withTasks({ todo: ['A'] });
    expect(updateTask(b, idOf(b, 'A'), { title: ' ' }, later)).toEqual({ ok: false, error: 'Vui lòng nhập tiêu đề' });
    expect(updateTask(b, 'nope', { title: 'x' }, later).ok).toBe(false);
  });

  it('filters unknown label ids', () => {
    const b = withTasks({ todo: ['A'] });
    const r = updateTask(b, idOf(b, 'A'), { labelIds: ['ghost', b.labels[1]!.id] }, later);
    expect(r.ok && Object.values(r.value.tasks)[0]!.labelIds).toEqual([b.labels[1]!.id]);
  });
});

describe('deleteTask', () => {
  it('removes the task from tasks and its column', () => {
    const b = withTasks({ todo: ['A', 'B'] });
    const after = deleteTask(b, idOf(b, 'A'));
    expect(titles(after, 'todo')).toEqual(['B']);
    expect(Object.keys(after.tasks)).toHaveLength(1);
  });
});

describe('moveTask', () => {
  it('moves into done at the given index and stamps completedAt', () => {
    const b = withTasks({ todo: ['A'], done: ['X'] });
    const after = moveTask(b, idOf(b, 'A'), 'done', 0, later);
    expect(titles(after, 'done')).toEqual(['A', 'X']);
    expect(titles(after, 'todo')).toEqual([]);
    expect(after.tasks[idOf(b, 'A')]!.completedAt).toBe(later);
    expect(findColumn(after, idOf(b, 'A'))).toBe('done');
  });

  it('clears completedAt when leaving done', () => {
    const b = withTasks({ done: ['A'] });
    const after = moveTask(b, idOf(b, 'A'), 'doing', 0, later);
    expect(after.tasks[idOf(b, 'A')]!.completedAt).toBeNull();
  });

  it('keeps completedAt when reordering inside done', () => {
    const b = withTasks({ done: ['A', 'B'] });
    const after = moveTask(b, idOf(b, 'A'), 'done', 1, later);
    expect(titles(after, 'done')).toEqual(['B', 'A']);
    expect(after.tasks[idOf(b, 'A')]!.completedAt).toBe(now);
  });

  it('reorders within a column using the index after removal', () => {
    const b = withTasks({ todo: ['a', 'b', 'c'] });
    expect(titles(moveTask(b, idOf(b, 'a'), 'todo', 2, later), 'todo')).toEqual(['b', 'c', 'a']);
  });

  it('clamps out-of-range indexes', () => {
    const b = withTasks({ todo: ['a'], doing: ['x', 'y'] });
    expect(titles(moveTask(b, idOf(b, 'a'), 'doing', 99, later), 'doing')).toEqual(['x', 'y', 'a']);
    expect(titles(moveTask(b, idOf(b, 'a'), 'doing', -1, later), 'doing')).toEqual(['a', 'x', 'y']);
  });

  it('returns the same board for an unknown id', () => {
    const b = withTasks({ todo: ['a'] });
    expect(moveTask(b, 'ghost', 'done', 0, later)).toBe(b);
  });
});
