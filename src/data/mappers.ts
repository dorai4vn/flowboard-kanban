import type { Database } from '../types/database.js';
import type { AccentColor, Board, ColumnId, LabelColor, Priority, Task } from '../domain/types.js';
import type { BoardsState } from './mutations.js';

type Tables = Database['public']['Tables'];
export type BoardRow = Tables['boards']['Row'];
export type LabelRow = Tables['labels']['Row'];
export type TaskRow = Tables['tasks']['Row'];
export type TaskLabelRow = Tables['task_labels']['Row'];
export type DbRows = { boards: BoardRow[]; labels: LabelRow[]; tasks: TaskRow[]; taskLabels: TaskLabelRow[] };

const COLUMNS: readonly ColumnId[] = ['todo', 'doing', 'done'];
const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

export function rowsToState(rows: DbRows): BoardsState {
  const boardRows = [...rows.boards].sort(byPosition);
  const boards: Record<string, Board> = {};
  for (const r of boardRows) {
    boards[r.id] = {
      id: r.id,
      name: r.name,
      accent: r.accent as AccentColor,
      labels: [],
      columns: { todo: [], doing: [], done: [] },
      tasks: {},
      createdAt: r.created_at,
    };
  }

  const labelBoard = new Map<string, string>();
  for (const l of [...rows.labels].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const b = boards[l.board_id];
    if (!b) continue;
    b.labels.push({ id: l.id, name: l.name, color: l.color as LabelColor });
    labelBoard.set(l.id, l.board_id);
  }

  const labelsOfTask = new Map<string, Set<string>>();
  for (const tl of rows.taskLabels) {
    if (!labelBoard.has(tl.label_id)) continue;
    const set = labelsOfTask.get(tl.task_id) ?? new Set<string>();
    set.add(tl.label_id);
    labelsOfTask.set(tl.task_id, set);
  }

  for (const t of [...rows.tasks].sort(byPosition)) {
    const b = boards[t.board_id];
    if (!b) continue;
    const own = labelsOfTask.get(t.id) ?? new Set<string>();
    const task: Task = {
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority as Priority,
      dueDate: t.due_date,
      // keep the board's label order so cards render labels consistently
      labelIds: b.labels.filter((l) => own.has(l.id)).map((l) => l.id),
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      completedAt: t.completed_at,
    };
    b.tasks[t.id] = task;
    const column = (COLUMNS as readonly string[]).includes(t.status) ? (t.status as ColumnId) : 'todo';
    b.columns[column].push(t.id);
  }

  return { boards, boardOrder: boardRows.map((r) => r.id) };
}

export type TaskPayload = {
  id: string;
  board_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: ColumnId;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function taskToRpc(task: Task, boardId: string, column: ColumnId): { p_task: TaskPayload; p_label_ids: string[] } {
  return {
    p_task: {
      id: task.id,
      board_id: boardId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: column,
      due_date: task.dueDate,
      completed_at: task.completedAt,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    },
    p_label_ids: task.labelIds,
  };
}

export function boardToRpc(board: Board) {
  return {
    p_board: { id: board.id, name: board.name, accent: board.accent, created_at: board.createdAt },
    p_labels: board.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    p_tasks: COLUMNS.flatMap((column) =>
      board.columns[column].map((id, position) => {
        const t = board.tasks[id]!;
        const { p_task } = taskToRpc(t, board.id, column);
        return { ...p_task, position, label_ids: t.labelIds };
      }),
    ),
  };
}
