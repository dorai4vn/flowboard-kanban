import { beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseClient } from '../../src/lib/supabase';
import { SupabaseRepository } from '../../src/data/supabaseRepository';
import { applyMutation, planMove, type BoardsState } from '../../src/data/mutations';
import { RepositoryError } from '../../src/data/repository';
import { createSeedState } from '../../src/domain/seed';
import { createTask, updateTask } from '../../src/domain/task';
import type { Board } from '../../src/domain/types';
import { localStatus, publicKey, signedInClient } from '../support/localSupabase';

const signal = () => new AbortController().signal;
const now = () => new Date().toISOString();
const firstBoard = (s: BoardsState): Board => s.boards[s.boardOrder[0]!]!;

let repoA: SupabaseRepository;
let repoB: SupabaseRepository;

beforeAll(async () => {
  repoA = new SupabaseRepository((await signedInClient('a')).client);
  repoB = new SupabaseRepository((await signedInClient('b')).client);
});

describe('SupabaseRepository (Supabase Local)', () => {
  it('a new account is empty and gets the starter board exactly once', async () => {
    expect((await repoA.load(signal())).boardOrder).toEqual([]);
    const seed = createSeedState(new Date());
    const board = firstBoard(seed);
    await repoA.ensureStarter(board, signal());
    await repoA.ensureStarter(firstBoard(createSeedState(new Date())), signal());
    const loaded = await repoA.load(signal());
    expect(loaded.boardOrder).toEqual([board.id]);
    const got = firstBoard(loaded);
    expect(got.columns).toEqual(board.columns);
    expect(got.labels).toEqual(board.labels);
    const summary = (b: Board) => Object.values(b.tasks).map((t) => [t.title, t.priority, t.dueDate, t.labelIds]).sort();
    expect(summary(got)).toEqual(summary(board));
  });

  it('persists create, update, move and delete so a fresh load matches the optimistic state', async () => {
    let state = await repoA.load(signal());
    const board = firstBoard(state);
    const created = createTask(board, { title: 'Tích hợp', priority: 'urgent', dueDate: '2026-12-01', labelIds: [board.labels[0]!.id] }, 'todo', now());
    if (!created.ok) throw new Error();
    const steps = [{ type: 'createTask' as const, boardId: board.id, task: created.value.task, column: 'todo' as const }];
    for (const m of steps) {
      await repoA.persist(m, signal());
      state = applyMutation(state, m);
    }
    const id = created.value.task.id;
    const updated = updateTask(firstBoard(state), id, { title: 'Tích hợp (sửa)', labelIds: [board.labels[1]!.id] }, now());
    if (!updated.ok) throw new Error();
    const u = { type: 'updateTask' as const, boardId: board.id, task: updated.value.tasks[id]! };
    await repoA.persist(u, signal());
    state = applyMutation(state, u);

    const mv = planMove(firstBoard(state), id, 'done', 0, now())!;
    await repoA.persist(mv, signal());
    state = applyMutation(state, mv);
    const fresh = firstBoard(await repoA.load(signal()));
    expect(fresh.columns).toEqual(firstBoard(state).columns);
    expect(fresh.tasks[id]).toMatchObject({ title: 'Tích hợp (sửa)', priority: 'urgent', dueDate: '2026-12-01', labelIds: [board.labels[1]!.id] });
    expect(fresh.tasks[id]!.completedAt).not.toBeNull();

    await repoA.persist({ type: 'deleteTask', boardId: board.id, taskId: id }, signal());
    expect(firstBoard(await repoA.load(signal())).tasks[id]).toBeUndefined();
  });

  it('persists board changes: rename, accent, label, new board, delete', async () => {
    const board = firstBoard(await repoA.load(signal()));
    await repoA.persist({ type: 'renameBoard', boardId: board.id, name: 'Bảng A' }, signal());
    await repoA.persist({ type: 'setAccent', boardId: board.id, accent: 'emerald' }, signal());
    await repoA.persist({ type: 'addLabel', boardId: board.id, label: { id: crypto.randomUUID(), name: 'Nhà', color: 'pink' } }, signal());
    const extra = { ...firstBoard(createSeedState(new Date())), name: 'Tạm' };
    await repoA.persist({ type: 'createBoard', board: extra }, signal());
    let s = await repoA.load(signal());
    expect(s.boardOrder).toEqual([board.id, extra.id]);
    expect(s.boards[board.id]).toMatchObject({ name: 'Bảng A', accent: 'emerald' });
    expect(s.boards[board.id]!.labels.at(-1)?.name).toBe('Nhà');
    await repoA.persist({ type: 'deleteBoard', boardId: extra.id }, signal());
    s = await repoA.load(signal());
    expect(s.boardOrder).toEqual([board.id]);
  });

  it('an edit of a task deleted elsewhere fails instead of recreating it', async () => {
    const board = firstBoard(await repoA.load(signal()));
    const created = createTask(board, { title: 'Sẽ bị xóa' }, 'todo', now());
    if (!created.ok) throw new Error();
    await repoA.persist({ type: 'createTask', boardId: board.id, task: created.value.task, column: 'todo' }, signal());
    await repoA.persist({ type: 'deleteTask', boardId: board.id, taskId: created.value.task.id }, signal());
    await expect(repoA.persist({ type: 'updateTask', boardId: board.id, task: { ...created.value.task, title: 'x' } }, signal())).rejects.toBeInstanceOf(RepositoryError);
    expect(firstBoard(await repoA.load(signal())).tasks[created.value.task.id]).toBeUndefined();
  });

  describe('user B cannot touch user A', () => {
    it('B sees none of A data', async () => {
      expect((await repoB.load(signal())).boardOrder).toEqual([]);
    });

    it('every write B attempts on A rows fails and changes nothing', async () => {
      const before = firstBoard(await repoA.load(signal()));
      const taskId = before.columns.todo[0]!;
      const task = before.tasks[taskId]!;
      const attempts = [
        { type: 'updateTask' as const, boardId: before.id, task: { ...task, title: 'B sửa' } },
        { type: 'deleteTask' as const, boardId: before.id, taskId },
        { type: 'renameBoard' as const, boardId: before.id, name: 'B đổi tên' },
        { type: 'setAccent' as const, boardId: before.id, accent: 'rose' as const },
        { type: 'deleteBoard' as const, boardId: before.id },
        { type: 'addLabel' as const, boardId: before.id, label: { id: crypto.randomUUID(), name: 'B', color: 'red' as const } },
        { type: 'createTask' as const, boardId: before.id, task: { ...task, id: crypto.randomUUID() }, column: 'todo' as const },
        { ...planMove(before, taskId, 'done', 0, now())! },
      ];
      for (const m of attempts) {
        await expect(repoB.persist(m, signal()), m.type).rejects.toBeInstanceOf(RepositoryError);
      }
      expect(firstBoard(await repoA.load(signal()))).toEqual(before);
    });
  });

  it('an aborted request rejects with RepositoryError', async () => {
    const c = new AbortController();
    c.abort();
    await expect(repoA.load(c.signal)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('an anonymous client reads nothing', async () => {
    const anon = new SupabaseRepository(createSupabaseClient(localStatus().API_URL, publicKey(), { persistSession: false, detectSessionInUrl: false }));
    await expect(anon.load(signal())).rejects.toBeInstanceOf(RepositoryError);
  });
});
