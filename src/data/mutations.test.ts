import { describe, expect, it } from 'vitest';
import { createBoard } from '../domain/board';
import { createSeedState } from '../domain/seed';
import { createTask } from '../domain/task';
import type { Board } from '../domain/types';
import { applyMutation, planMove, type BoardsState } from './mutations';

const now = '2026-11-22T08:00:00.000Z';
const later = '2026-11-22T09:00:00.000Z';

function state(): { s: BoardsState; board: Board } {
  const seed = createSeedState(new Date(2026, 10, 22, 9, 0));
  const s = { boards: seed.boards, boardOrder: seed.boardOrder };
  return { s, board: s.boards[s.boardOrder[0]!]! };
}
const titleIds = (b: Board, title: string) => Object.values(b.tasks).find((t) => t.title === title)!.id;

describe('applyMutation', () => {
  it('createBoard appends the board and its id to the order', () => {
    const { s } = state();
    const r = createBoard('Đồ án', now);
    if (!r.ok) throw new Error();
    const next = applyMutation(s, { type: 'createBoard', board: r.value });
    expect(next.boardOrder).toEqual([...s.boardOrder, r.value.id]);
    expect(next.boards[r.value.id]).toBe(r.value);
  });

  it('renameBoard, setAccent and addLabel change only the target board', () => {
    const { s, board } = state();
    let next = applyMutation(s, { type: 'renameBoard', boardId: board.id, name: 'Việc nhà' });
    next = applyMutation(next, { type: 'setAccent', boardId: board.id, accent: 'rose' });
    next = applyMutation(next, { type: 'addLabel', boardId: board.id, label: { id: 'L9', name: 'Nhà', color: 'pink' } });
    const b = next.boards[board.id]!;
    expect([b.name, b.accent, b.labels.at(-1)?.name]).toEqual(['Việc nhà', 'rose', 'Nhà']);
    expect(s.boards[board.id]!.name).toBe('Bảng của tôi');
  });

  it('deleteBoard removes the board and its order entry', () => {
    const { s, board } = state();
    const next = applyMutation(s, { type: 'deleteBoard', boardId: board.id });
    expect(next.boardOrder).toEqual([]);
    expect(next.boards[board.id]).toBeUndefined();
  });

  it('createTask, updateTask and deleteTask', () => {
    const { s, board } = state();
    const r = createTask(board, { title: 'Mới' }, 'doing', now);
    if (!r.ok) throw new Error();
    let next = applyMutation(s, { type: 'createTask', boardId: board.id, task: r.value.task, column: 'doing' });
    expect(next.boards[board.id]!.columns.doing.at(-1)).toBe(r.value.task.id);
    next = applyMutation(next, { type: 'updateTask', boardId: board.id, task: { ...r.value.task, title: 'Đã sửa' } });
    expect(next.boards[board.id]!.tasks[r.value.task.id]!.title).toBe('Đã sửa');
    next = applyMutation(next, { type: 'deleteTask', boardId: board.id, taskId: r.value.task.id });
    expect(next.boards[board.id]!.tasks[r.value.task.id]).toBeUndefined();
    expect(next.boards[board.id]!.columns.doing).not.toContain(r.value.task.id);
  });

  it('moveTask sets the target order, removes from the source and stamps dates', () => {
    const { s, board } = state();
    const id = titleIds(board, 'Mua quà sinh nhật');
    const doneIds = board.columns.done;
    const next = applyMutation(s, { type: 'moveTask', boardId: board.id, taskId: id, to: 'done', orderedIds: [id, ...doneIds], completedAt: later, updatedAt: later });
    const b = next.boards[board.id]!;
    expect(b.columns.done).toEqual([id, ...doneIds]);
    expect(b.columns.todo).not.toContain(id);
    expect(b.tasks[id]).toMatchObject({ completedAt: later, updatedAt: later });
  });

  it('returns the same state for an unknown board', () => {
    const { s } = state();
    expect(applyMutation(s, { type: 'deleteTask', boardId: 'ghost', taskId: 'x' })).toBe(s);
  });
});

describe('planMove', () => {
  it('describes a move with the full target order and completion time', () => {
    const { board } = state();
    const id = titleIds(board, 'Mua quà sinh nhật');
    const m = planMove(board, id, 'done', 0, later);
    expect(m).toEqual({ type: 'moveTask', boardId: board.id, taskId: id, to: 'done', orderedIds: [id, ...board.columns.done], completedAt: later, updatedAt: later });
  });

  it('clears completion when leaving done and returns null for unknown tasks', () => {
    const { board } = state();
    const id = board.columns.done[0]!;
    expect(planMove(board, id, 'todo', 0, later)).toMatchObject({ completedAt: null, orderedIds: [id, ...board.columns.todo] });
    expect(planMove(board, 'ghost', 'todo', 0, later)).toBeNull();
  });

  it('applying a planned move equals the domain move', () => {
    const { s, board } = state();
    const id = titleIds(board, 'Hoàn thành bài tập buổi 8');
    const m = planMove(board, id, 'todo', 2, later)!;
    expect(applyMutation(s, m).boards[board.id]!.columns.todo).toEqual(m.orderedIds);
    expect(m.orderedIds.at(-1)).toBe(id);
  });
});
