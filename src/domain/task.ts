import { newId } from './ids';
import { COLUMN_IDS, LIMITS, type Board, type ColumnId, type Priority, type Result, type Task } from './types';

export type TaskInput = {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  labelIds?: string[];
};

function validateTitle(title: string): Result<string> {
  const value = title.trim();
  if (!value) return { ok: false, error: 'Vui lòng nhập tiêu đề' };
  if (value.length > LIMITS.title) return { ok: false, error: 'Tiêu đề tối đa 200 ký tự' };
  return { ok: true, value };
}

function validateDescription(description: string): Result<string> {
  if (description.length > LIMITS.description) return { ok: false, error: 'Mô tả tối đa 2000 ký tự' };
  return { ok: true, value: description };
}

const knownLabels = (b: Board, ids: string[]) => {
  const valid = new Set(b.labels.map((l) => l.id));
  return [...new Set(ids)].filter((id) => valid.has(id));
};

export function findColumn(b: Board, id: string): ColumnId | null {
  return COLUMN_IDS.find((c) => b.columns[c].includes(id)) ?? null;
}

export function createTask(b: Board, input: TaskInput, column: ColumnId, now: string): Result<{ board: Board; task: Task }> {
  const title = validateTitle(input.title);
  if (!title.ok) return title;
  const description = validateDescription(input.description ?? '');
  if (!description.ok) return description;
  const task: Task = {
    id: newId(),
    title: title.value,
    description: description.value,
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    labelIds: knownLabels(b, input.labelIds ?? []),
    createdAt: now,
    updatedAt: now,
    completedAt: column === 'done' ? now : null,
  };
  return {
    ok: true,
    value: {
      board: { ...b, tasks: { ...b.tasks, [task.id]: task }, columns: { ...b.columns, [column]: [...b.columns[column], task.id] } },
      task,
    },
  };
}

export function updateTask(b: Board, id: string, patch: Partial<TaskInput>, now: string): Result<Board> {
  const current = b.tasks[id];
  if (!current) return { ok: false, error: 'Không tìm thấy công việc' };
  const next: Task = { ...current, updatedAt: now };
  if (patch.title !== undefined) {
    const title = validateTitle(patch.title);
    if (!title.ok) return title;
    next.title = title.value;
  }
  if (patch.description !== undefined) {
    const description = validateDescription(patch.description);
    if (!description.ok) return description;
    next.description = description.value;
  }
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.labelIds !== undefined) next.labelIds = knownLabels(b, patch.labelIds);
  return { ok: true, value: { ...b, tasks: { ...b.tasks, [id]: next } } };
}

export function deleteTask(b: Board, id: string): Board {
  const from = findColumn(b, id);
  if (!from && !b.tasks[id]) return b;
  const tasks = { ...b.tasks };
  delete tasks[id];
  return { ...b, tasks, columns: from ? { ...b.columns, [from]: b.columns[from].filter((t) => t !== id) } : b.columns };
}

/** Move a task to `to` at `toIndex`, an index into the target column after the task is removed. */
export function moveTask(b: Board, id: string, to: ColumnId, toIndex: number, now: string): Board {
  const from = findColumn(b, id);
  const task = b.tasks[id];
  if (!from || !task) return b;
  const columns = { ...b.columns, [from]: b.columns[from].filter((t) => t !== id) };
  const target = [...columns[to]];
  const index = Math.max(0, Math.min(Math.trunc(toIndex), target.length));
  target.splice(index, 0, id);
  columns[to] = target;
  let completedAt = task.completedAt;
  if (to === 'done' && from !== 'done') completedAt = now;
  if (to !== 'done') completedAt = null;
  const tasks = completedAt === task.completedAt ? b.tasks : { ...b.tasks, [id]: { ...task, completedAt, updatedAt: now } };
  return { ...b, columns, tasks };
}
