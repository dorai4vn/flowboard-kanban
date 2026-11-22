import type { FlowboardClient } from '../lib/supabase.js';
import type { Board } from '../domain/types.js';
import { boardToRpc, rowsToState, taskToRpc } from './mappers.js';
import type { BoardsState, Mutation } from './mutations.js';
import { RepositoryError, withTimeout, type BoardRepository } from './repository.js';

type Res<T> = { data: T | null; error: unknown };

/** Throw a detail-free error on any failure (network, RLS, constraint, abort). */
function must<T>(res: Res<T>): T {
  if (res.error || res.data === null) throw new RepositoryError();
  return res.data;
}

/** Updates/deletes that RLS hides affect 0 rows without an error: treat that as a failure. */
function exactlyOne(res: Res<unknown[]>): void {
  if (must(res).length !== 1) throw new RepositoryError();
}

export class SupabaseRepository implements BoardRepository {
  constructor(private readonly db: FlowboardClient) {}

  async load(session: AbortSignal): Promise<BoardsState> {
    const signal = withTimeout(session);
    try {
      const [boards, labels, tasks, taskLabels] = await Promise.all([
        this.db.from('boards').select('id, user_id, name, accent, position, created_at').abortSignal(signal),
        this.db.from('labels').select('id, user_id, board_id, name, color, created_at').abortSignal(signal),
        this.db
          .from('tasks')
          .select('id, user_id, board_id, title, description, priority, status, position, due_date, completed_at, created_at, updated_at')
          .abortSignal(signal),
        this.db.from('task_labels').select('user_id, task_id, label_id').abortSignal(signal),
      ]);
      return rowsToState({ boards: must(boards), labels: must(labels), tasks: must(tasks), taskLabels: must(taskLabels) });
    } catch {
      throw new RepositoryError();
    }
  }

  async ensureStarter(seed: Board, session: AbortSignal): Promise<void> {
    const signal = withTimeout(session);
    await this.call(() => this.db.rpc('create_board', { ...boardToRpc(seed), p_only_if_empty: true }).abortSignal(signal));
  }

  async persist(m: Mutation, session: AbortSignal): Promise<void> {
    try {
      await this.write(m, withTimeout(session));
    } catch {
      throw new RepositoryError();
    }
  }

  private async call(fn: () => PromiseLike<{ error: unknown }>): Promise<void> {
    let res: { error: unknown };
    try {
      res = await fn();
    } catch {
      throw new RepositoryError();
    }
    if (res.error) throw new RepositoryError();
  }

  private async write(m: Mutation, signal: AbortSignal): Promise<void> {
    const db = this.db;
    switch (m.type) {
      case 'createBoard':
        return this.call(() => db.rpc('create_board', { ...boardToRpc(m.board), p_only_if_empty: false }).abortSignal(signal));
      case 'renameBoard':
        return exactlyOne(await db.from('boards').update({ name: m.name }).eq('id', m.boardId).select('id').abortSignal(signal));
      case 'setAccent':
        return exactlyOne(await db.from('boards').update({ accent: m.accent }).eq('id', m.boardId).select('id').abortSignal(signal));
      case 'deleteBoard':
        return exactlyOne(await db.from('boards').delete().eq('id', m.boardId).select('id').abortSignal(signal));
      case 'addLabel':
        return exactlyOne(
          await db
            .from('labels')
            .insert({ id: m.label.id, board_id: m.boardId, name: m.label.name, color: m.label.color })
            .select('id')
            .abortSignal(signal),
        );
      case 'createTask':
        return this.call(() => db.rpc('save_task', { ...taskToRpc(m.task, m.boardId, m.column), p_must_exist: false }).abortSignal(signal));
      case 'updateTask':
        return this.call(() => db.rpc('save_task', { ...taskToRpc(m.task, m.boardId, 'todo'), p_must_exist: true }).abortSignal(signal));
      case 'deleteTask':
        return exactlyOne(await db.from('tasks').delete().eq('id', m.taskId).select('id').abortSignal(signal));
      case 'moveTask':
        return this.call(() =>
          db
            .rpc('move_task', { p_task_id: m.taskId, p_status: m.to, p_ordered_ids: m.orderedIds, p_completed_at: m.completedAt as string })
            .abortSignal(signal),
        );
    }
  }
}
