import { findColumn, moveTask } from '../domain/task';
import type { AccentColor, Board, ColumnId, Label, Task } from '../domain/types';

export type BoardsState = { boards: Record<string, Board>; boardOrder: string[] };

/** A concrete, already-computed change. Applied optimistically to the UI and persisted by a repository. */
export type Mutation =
  | { type: 'createBoard'; board: Board }
  | { type: 'renameBoard'; boardId: string; name: string }
  | { type: 'setAccent'; boardId: string; accent: AccentColor }
  | { type: 'deleteBoard'; boardId: string }
  | { type: 'addLabel'; boardId: string; label: Label }
  | { type: 'createTask'; boardId: string; task: Task; column: ColumnId }
  | { type: 'updateTask'; boardId: string; task: Task }
  | { type: 'deleteTask'; boardId: string; taskId: string }
  | { type: 'moveTask'; boardId: string; taskId: string; to: ColumnId; orderedIds: string[]; completedAt: string | null; updatedAt: string };

const COLUMNS: readonly ColumnId[] = ['todo', 'doing', 'done'];

function withBoard(s: BoardsState, boardId: string, fn: (b: Board) => Board): BoardsState {
  const b = s.boards[boardId];
  if (!b) return s;
  return { ...s, boards: { ...s.boards, [boardId]: fn(b) } };
}

export function applyMutation(s: BoardsState, m: Mutation): BoardsState {
  switch (m.type) {
    case 'createBoard':
      return { boards: { ...s.boards, [m.board.id]: m.board }, boardOrder: [...s.boardOrder.filter((id) => id !== m.board.id), m.board.id] };
    case 'deleteBoard': {
      if (!s.boards[m.boardId]) return s;
      const boards = { ...s.boards };
      delete boards[m.boardId];
      return { boards, boardOrder: s.boardOrder.filter((id) => id !== m.boardId) };
    }
    case 'renameBoard':
      return withBoard(s, m.boardId, (b) => ({ ...b, name: m.name }));
    case 'setAccent':
      return withBoard(s, m.boardId, (b) => ({ ...b, accent: m.accent }));
    case 'addLabel':
      return withBoard(s, m.boardId, (b) => ({ ...b, labels: [...b.labels, m.label] }));
    case 'createTask':
      return withBoard(s, m.boardId, (b) => ({
        ...b,
        tasks: { ...b.tasks, [m.task.id]: m.task },
        columns: { ...b.columns, [m.column]: [...b.columns[m.column], m.task.id] },
      }));
    case 'updateTask':
      return withBoard(s, m.boardId, (b) => (b.tasks[m.task.id] ? { ...b, tasks: { ...b.tasks, [m.task.id]: m.task } } : b));
    case 'deleteTask':
      return withBoard(s, m.boardId, (b) => {
        if (!b.tasks[m.taskId]) return b;
        const tasks = { ...b.tasks };
        delete tasks[m.taskId];
        const columns = Object.fromEntries(COLUMNS.map((c) => [c, b.columns[c].filter((id) => id !== m.taskId)])) as Board['columns'];
        return { ...b, tasks, columns };
      });
    case 'moveTask':
      return withBoard(s, m.boardId, (b) => {
        const task = b.tasks[m.taskId];
        if (!task) return b;
        const columns = Object.fromEntries(
          COLUMNS.map((c) => [c, c === m.to ? m.orderedIds : b.columns[c].filter((id) => id !== m.taskId)]),
        ) as Board['columns'];
        return { ...b, columns, tasks: { ...b.tasks, [m.taskId]: { ...task, completedAt: m.completedAt, updatedAt: m.updatedAt } } };
      });
  }
}

/** Describe moving a task (domain rules for index clamping and completion) as a persistable mutation. */
export function planMove(b: Board, taskId: string, to: ColumnId, toIndex: number, now: string): Extract<Mutation, { type: 'moveTask' }> | null {
  if (!findColumn(b, taskId)) return null;
  const moved = moveTask(b, taskId, to, toIndex, now);
  const task = moved.tasks[taskId]!;
  return { type: 'moveTask', boardId: b.id, taskId, to, orderedIds: moved.columns[to], completedAt: task.completedAt, updatedAt: now };
}
