import { applyMutation, planMove, type BoardsState, type Mutation } from '../../src/data/mutations.js';
import type { BoardRepository } from '../../src/data/repository.js';
import * as boards from '../../src/domain/board.js';
import { boardStats, EMPTY_FILTER, focusTasks, matchesFilter, type FocusKind } from '../../src/domain/filters.js';
import * as tasks from '../../src/domain/task.js';
import { COLUMN_IDS, COLUMN_TITLES, type Board, type ColumnId, type Priority, type Task } from '../../src/domain/types.js';

export type TaskSummary = {
  id: string;
  title: string;
  board_id: string;
  board_name: string;
  status: ColumnId;
  status_label: string;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  description: string;
};

export type WorkspaceEvent =
  | { kind: 'task_created'; title: string; board: string }
  | { kind: 'task_updated'; title: string; board: string }
  | { kind: 'task_moved'; title: string; board: string; status: string }
  | { kind: 'board_created'; title: string; board: string }
  | { kind: 'task_deleted' | 'board_deleted'; title: string; board: string };

type Failure = { ok: false; error: string };
const NOT_FOUND_BOARD: Failure = { ok: false, error: 'Không tìm thấy bảng.' };
const NOT_FOUND_TASK: Failure = { ok: false, error: 'Không tìm thấy công việc.' };
const SAVE_FAILED: Failure = { ok: false, error: 'Không lưu được thay đổi vào cơ sở dữ liệu.' };

type Options = { today: string; now: () => Date; signal: AbortSignal };

/**
 * The only way the AI agent reads or changes Kanban data. Every change goes through the existing domain
 * validation and the user-scoped repository (RLS + RPCs); a change is reported only after the repository
 * confirmed it.
 */
export class WorkspaceService {
  private state: BoardsState = { boards: {}, boardOrder: [] };
  /** Confirmed changes in this request, for UI feedback. */
  readonly events: WorkspaceEvent[] = [];

  constructor(
    private readonly repo: BoardRepository,
    private readonly opts: Options,
  ) {}

  async load(): Promise<void> {
    this.state = await this.repo.load(this.opts.signal);
  }

  /** Re-read after an out-of-band change (e.g. an approved deletion). */
  async reload(): Promise<void> {
    await this.load();
  }

  private iso() {
    return this.opts.now().toISOString();
  }

  private locate(taskId: string): { board: Board; column: ColumnId; task: Task } | null {
    for (const boardId of this.state.boardOrder) {
      const board = this.state.boards[boardId];
      if (!board) continue;
      const task = board.tasks[taskId];
      if (!task) continue;
      const column = tasks.findColumn(board, taskId);
      if (column) return { board, column, task };
    }
    return null;
  }

  private summary(board: Board, column: ColumnId, task: Task): TaskSummary {
    return {
      id: task.id,
      title: task.title,
      board_id: board.id,
      board_name: board.name,
      status: column,
      status_label: COLUMN_TITLES[column],
      priority: task.priority,
      due_date: task.dueDate,
      completed: column === 'done',
      description: task.description.length > 200 ? `${task.description.slice(0, 200)}…` : task.description,
    };
  }

  private async persist(m: Mutation): Promise<boolean> {
    try {
      await this.repo.persist(m, this.opts.signal);
    } catch {
      return false;
    }
    this.state = applyMutation(this.state, m);
    return true;
  }

  // ------------------------------------------------------------------ read
  listBoards() {
    return this.state.boardOrder.flatMap((id) => {
      const b = this.state.boards[id];
      if (!b) return [];
      const s = boardStats(b, this.opts.today);
      return [{ id: b.id, name: b.name, tasks: s.total, todo: s.todo, doing: s.doing, done: s.done, percent_done: s.percentDone, due_today: s.dueToday, overdue: s.overdue }];
    });
  }

  getBoard(boardId: string): { ok: true; board: { id: string; name: string; columns: Record<ColumnId, TaskSummary[]> } } | Failure {
    const b = this.state.boards[boardId];
    if (!b) return NOT_FOUND_BOARD;
    const columns = Object.fromEntries(
      COLUMN_IDS.map((c) => [c, b.columns[c].flatMap((id) => (b.tasks[id] ? [this.summary(b, c, b.tasks[id])] : []))]),
    ) as Record<ColumnId, TaskSummary[]>;
    return { ok: true, board: { id: b.id, name: b.name, columns } };
  }

  searchTasks(input: { query: string; board_id: string | null; include_done: boolean }): TaskSummary[] {
    const out: TaskSummary[] = [];
    const filter = { ...EMPTY_FILTER, query: input.query };
    for (const boardId of this.state.boardOrder) {
      if (input.board_id && boardId !== input.board_id) continue;
      const b = this.state.boards[boardId];
      if (!b) continue;
      for (const c of COLUMN_IDS) {
        if (c === 'done' && !input.include_done) continue;
        for (const id of b.columns[c]) {
          const t = b.tasks[id];
          if (t && matchesFilter(t, c, filter, this.opts.today)) out.push(this.summary(b, c, t));
        }
      }
    }
    return out.slice(0, 25);
  }

  focus(kind: FocusKind) {
    return focusTasks(this.state, kind, this.opts.today).map((i) => ({
      ...this.summary(this.state.boards[i.boardId]!, i.column, i.task),
      days_late: i.daysLate,
    }));
  }

  /** Read-only lookup used to describe a deletion before approval. */
  findTask(taskId: string): TaskSummary | null {
    const hit = this.locate(taskId);
    return hit ? this.summary(hit.board, hit.column, hit.task) : null;
  }

  // ------------------------------------------------------------------ create / update
  async createBoard(input: { name: string }): Promise<{ ok: true; board: { id: string; name: string } } | Failure> {
    const r = boards.createBoard(input.name, this.iso());
    if (!r.ok) return { ok: false, error: r.error };
    if (!(await this.persist({ type: 'createBoard', board: r.value }))) return SAVE_FAILED;
    this.events.push({ kind: 'board_created', title: r.value.name, board: r.value.name });
    return { ok: true, board: { id: r.value.id, name: r.value.name } };
  }

  async createTask(input: {
    board_id: string;
    title: string;
    description: string | null;
    priority: Priority | null;
    due_date: string | null;
    status: ColumnId | null;
  }): Promise<{ ok: true; task: TaskSummary } | Failure> {
    const b = this.state.boards[input.board_id];
    if (!b) return NOT_FOUND_BOARD;
    const column = input.status ?? 'todo';
    const r = tasks.createTask(
      b,
      { title: input.title, description: input.description ?? '', priority: input.priority ?? undefined, dueDate: input.due_date },
      column,
      this.iso(),
    );
    if (!r.ok) return { ok: false, error: r.error };
    if (!(await this.persist({ type: 'createTask', boardId: b.id, task: r.value.task, column }))) return SAVE_FAILED;
    this.events.push({ kind: 'task_created', title: r.value.task.title, board: b.name });
    return { ok: true, task: this.summary(this.state.boards[b.id]!, column, r.value.task) };
  }

  async updateTask(input: {
    task_id: string;
    title: string | null;
    description: string | null;
    priority: Priority | null;
    due_date: string | null;
    clear_due_date: boolean;
  }): Promise<{ ok: true; task: TaskSummary } | Failure> {
    const hit = this.locate(input.task_id);
    if (!hit) return NOT_FOUND_TASK;
    const patch: Partial<tasks.TaskInput> = {};
    if (input.title !== null) patch.title = input.title;
    if (input.description !== null) patch.description = input.description;
    if (input.priority !== null) patch.priority = input.priority;
    if (input.clear_due_date) patch.dueDate = null;
    else if (input.due_date !== null) patch.dueDate = input.due_date;
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Không có thay đổi nào để lưu.' };
    const r = tasks.updateTask(hit.board, input.task_id, patch, this.iso());
    if (!r.ok) return { ok: false, error: r.error };
    const task = r.value.tasks[input.task_id]!;
    if (!(await this.persist({ type: 'updateTask', boardId: hit.board.id, task }))) return SAVE_FAILED;
    this.events.push({ kind: 'task_updated', title: task.title, board: hit.board.name });
    return { ok: true, task: this.summary(this.state.boards[hit.board.id]!, hit.column, task) };
  }

  async moveTask(input: { task_id: string; status: ColumnId }): Promise<{ ok: true; task: TaskSummary } | Failure> {
    const hit = this.locate(input.task_id);
    if (!hit) return NOT_FOUND_TASK;
    const m = planMove(hit.board, input.task_id, input.status, hit.board.columns[input.status].length, this.iso());
    if (!m) return NOT_FOUND_TASK;
    if (!(await this.persist(m))) return SAVE_FAILED;
    const board = this.state.boards[hit.board.id]!;
    this.events.push({ kind: 'task_moved', title: hit.task.title, board: board.name, status: COLUMN_TITLES[input.status] });
    return { ok: true, task: this.summary(board, input.status, board.tasks[input.task_id]!) };
  }
}
