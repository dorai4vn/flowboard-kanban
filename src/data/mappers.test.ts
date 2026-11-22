import { describe, expect, it } from 'vitest';
import { createSeedState } from '../domain/seed';
import type { Board } from '../domain/types';
import { boardToRpc, rowsToState, taskToRpc, type DbRows } from './mappers';

const USER = 'user-1';

/** What Postgres would store for a create_board RPC call (mirrors the SQL function). */
function rowsFromRpc(rpc: ReturnType<typeof boardToRpc>, position = 0): DbRows {
  const boardId = rpc.p_board.id;
  return {
    boards: [{ id: boardId, user_id: USER, name: rpc.p_board.name, accent: rpc.p_board.accent, position, created_at: rpc.p_board.created_at }],
    labels: rpc.p_labels.map((l, i) => ({ id: l.id, user_id: USER, board_id: boardId, name: l.name, color: l.color, created_at: `2026-11-22T00:00:0${i}.000Z` })),
    tasks: rpc.p_tasks.map((t) => ({
      id: t.id, user_id: USER, board_id: boardId, title: t.title, description: t.description, priority: t.priority, status: t.status,
      position: t.position, due_date: t.due_date, completed_at: t.completed_at, created_at: t.created_at, updated_at: t.updated_at,
    })),
    taskLabels: rpc.p_tasks.flatMap((t) => t.label_ids.map((label_id) => ({ user_id: USER, task_id: t.id, label_id }))),
  };
}

describe('mappers', () => {
  it('round-trips a board through the RPC payload and back from rows', () => {
    const seed = createSeedState(new Date(2026, 10, 22, 9, 0));
    const board = seed.boards[seed.boardOrder[0]!]!;
    const back = rowsToState(rowsFromRpc(boardToRpc(board)));
    expect(back.boardOrder).toEqual([board.id]);
    expect(back.boards[board.id]).toEqual(board);
  });

  it('orders boards by position and tasks by position within their column', () => {
    const seed = createSeedState(new Date(2026, 10, 22, 9, 0));
    const board = seed.boards[seed.boardOrder[0]!]!;
    const rows = rowsFromRpc(boardToRpc(board), 1);
    const second: Board = { ...board, id: 'b2', name: 'Hai', labels: [], tasks: {}, columns: { todo: [], doing: [], done: [] } };
    rows.boards.unshift({ id: 'b2', user_id: USER, name: 'Hai', accent: 'indigo', position: 0, created_at: second.createdAt });
    rows.tasks.reverse();
    const back = rowsToState(rows);
    expect(back.boardOrder).toEqual(['b2', board.id]);
    expect(back.boards[board.id]!.columns).toEqual(board.columns);
  });

  it('maps a task to the save_task payload', () => {
    const seed = createSeedState(new Date(2026, 10, 22, 9, 0));
    const board = seed.boards[seed.boardOrder[0]!]!;
    const task = Object.values(board.tasks)[0]!;
    expect(taskToRpc(task, board.id, 'todo')).toEqual({
      p_task: {
        id: task.id, board_id: board.id, title: task.title, description: task.description, priority: task.priority, status: 'todo',
        due_date: task.dueDate, completed_at: task.completedAt, created_at: task.createdAt, updated_at: task.updatedAt,
      },
      p_label_ids: task.labelIds,
    });
  });

  it('ignores task_labels pointing at unknown labels and tasks in unknown boards', () => {
    const seed = createSeedState(new Date(2026, 10, 22, 9, 0));
    const board = seed.boards[seed.boardOrder[0]!]!;
    const rows = rowsFromRpc(boardToRpc(board));
    rows.taskLabels.push({ user_id: USER, task_id: rows.tasks[0]!.id, label_id: 'ghost' });
    rows.tasks.push({ ...rows.tasks[0]!, id: 'orphan', board_id: 'missing' });
    const back = rowsToState(rows);
    expect(back.boards[board.id]).toEqual(board);
  });
});
