import { describe, expect, it } from 'vitest';
import { FakeRepository } from '../data/fakeRepository';
import type { BoardsState } from '../data/mutations';
import { createSeedState } from '../domain/seed';
import { createBoardStore, OFFLINE_ERROR, SAVE_FAILED_NOTICE, type BoardStore } from './useBoardStore';

const clock = () => new Date(2026, 10, 22, 9, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));

function seedState(): BoardsState {
  const s = createSeedState(clock());
  return { boards: s.boards, boardOrder: s.boardOrder };
}

const active = (s: BoardStore) => {
  const { app } = s.getState();
  return app.boards[app.activeBoardId]!;
};
const titles = (s: BoardStore, col: 'todo' | 'doing' | 'done') => active(s).columns[col].map((id) => active(s).tasks[id]!.title);
const idOf = (s: BoardStore, title: string) => Object.values(active(s).tasks).find((t) => t.title === title)!.id;

async function ready(repo = new FakeRepository(seedState()), prefs: Storage | null = null) {
  const store = createBoardStore({ repo, now: clock, prefs });
  await store.getState().switchUser('user-a');
  return { store, repo };
}

describe('loading per user', () => {
  it('starts signed out with no data', () => {
    const store = createBoardStore({ repo: new FakeRepository(), now: clock });
    expect(store.getState().status).toBe('signedOut');
    expect(store.getState().app.boardOrder).toEqual([]);
  });

  it('loads the account boards', async () => {
    const { store } = await ready();
    expect(store.getState().status).toBe('ready');
    expect(active(store).name).toBe('Bảng của tôi');
    expect(titles(store, 'doing')).toEqual(['Viết báo cáo tuần']);
  });

  it('creates the starter board for a new account, then loads it', async () => {
    const repo = new FakeRepository();
    const { store } = await ready(repo);
    expect(repo.starterCalls).toBe(1);
    expect(Object.keys(active(store).tasks)).toHaveLength(5);
  });

  it('shows an error state when loading fails, and reload recovers', async () => {
    const repo = new FakeRepository(seedState());
    repo.failLoad = true;
    const { store } = await ready(repo);
    expect(store.getState().status).toBe('error');
    repo.failLoad = false;
    await store.getState().reload();
    expect(store.getState().status).toBe('ready');
  });

  it('remembers the active board per user in preferences', async () => {
    const prefs = new Map<string, string>();
    const storage = { getItem: (k: string) => prefs.get(k) ?? null, setItem: (k: string, v: string) => void prefs.set(k, v) } as Storage;
    const repo = new FakeRepository(seedState());
    const { store } = await ready(repo, storage);
    store.getState().createBoard('Đồ án');
    await store.getState().whenIdle();
    const again = createBoardStore({ repo, now: clock, prefs: storage });
    await again.getState().switchUser('user-a');
    expect(active(again).name).toBe('Đồ án');
  });
});

describe('session isolation', () => {
  it('clears the previous user immediately and ignores their late load result', async () => {
    const repo = new FakeRepository(seedState());
    const store = createBoardStore({ repo, now: clock });
    repo.hold = true;
    const loadingA = store.getState().switchUser('user-a');
    await tick();
    const signalA = repo.signals[0]!;
    const repoB = new FakeRepository();
    void repoB;
    store.getState().setFilter({ query: 'abc' });
    const loadingB = store.getState().switchUser('user-b');
    expect(store.getState().userId).toBe('user-b');
    expect(store.getState().app.boardOrder).toEqual([]);
    expect(store.getState().filter.query).toBe('');
    expect(signalA.aborted).toBe(true);
    repo.release(); // A's load resolves late
    await loadingA;
    expect(store.getState().app.boardOrder).toEqual([]);
    expect(store.getState().status).toBe('loading');
    repo.release();
    await loadingB;
    expect(store.getState().status).toBe('ready');
  });

  it('signing out drops pending writes; their results never reach the store', async () => {
    const { store, repo } = await ready();
    repo.hold = true;
    expect(store.getState().createTask({ title: 'Việc đang lưu' }, 'todo')).toBeNull();
    await tick();
    expect(repo.waiting).toBe(1);
    await store.getState().switchUser(null);
    expect(store.getState().status).toBe('signedOut');
    expect(store.getState().app.boardOrder).toEqual([]);
    expect(store.getState().notice).toBeNull();
    expect(store.getState().saving).toBe(false);
    repo.release();
    await tick();
    expect(store.getState().app.boardOrder).toEqual([]);
    expect(store.getState().notice).toBeNull();
  });

  it('a write failing after the user changed does not roll back into the new session', async () => {
    const { store, repo } = await ready();
    repo.hold = true;
    repo.failWhen = () => true;
    store.getState().createTask({ title: 'Sẽ lỗi' }, 'todo');
    await tick();
    const switching = store.getState().switchUser('user-b');
    repo.release(); // the failing write of user A
    repo.release(); // user B load
    repo.release(); // user B starter
    repo.release(); // user B reload
    await switching;
    expect(store.getState().notice).toBeNull();
    expect(store.getState().userId).toBe('user-b');
  });
});

describe('write queue', () => {
  it('applies rapid moves immediately and persists them one at a time, in order', async () => {
    const { store, repo } = await ready();
    repo.hold = true;
    const a = idOf(store, 'Mua quà sinh nhật');
    store.getState().moveTask(a, 'doing', 0);
    store.getState().moveTask(a, 'done', 0);
    store.getState().moveTask(a, 'todo', 0);
    expect(titles(store, 'todo')[0]).toBe('Mua quà sinh nhật');
    expect(store.getState().saving).toBe(true);
    for (let i = 0; i < 3; i++) {
      await tick();
      repo.release();
    }
    await store.getState().whenIdle();
    expect(repo.maxInFlight).toBe(1);
    expect(repo.persisted.map((m) => (m.type === 'moveTask' ? m.to : m.type))).toEqual(['doing', 'done', 'todo']);
    expect(store.getState().saving).toBe(false);
    expect(repo.state.boards[active(store).id]!.columns.todo[0]).toBe(a);
  });

  it('on a failed save, returns to the last confirmed state and cancels the queued writes', async () => {
    const { store, repo } = await ready();
    const a = idOf(store, 'Mua quà sinh nhật');
    repo.failWhen = (_m, index) => index === 1;
    store.getState().moveTask(a, 'doing', 0); // ok
    store.getState().moveTask(a, 'done', 0); // fails
    store.getState().moveTask(a, 'todo', 0); // cancelled
    expect(titles(store, 'todo')[0]).toBe('Mua quà sinh nhật');
    await store.getState().whenIdle();
    expect(titles(store, 'doing')[0]).toBe('Mua quà sinh nhật');
    expect(titles(store, 'todo')).not.toContain('Mua quà sinh nhật');
    expect(repo.persisted).toHaveLength(1);
    expect(store.getState().notice).toBe(SAVE_FAILED_NOTICE);
    expect(SAVE_FAILED_NOTICE).toBe('Không lưu được thay đổi, đã hoàn tác.');
  });

  it('a failed create is rolled back', async () => {
    const { store, repo } = await ready();
    repo.failWhen = () => true;
    store.getState().createTask({ title: 'Không lưu được' }, 'todo');
    expect(titles(store, 'todo')).toContain('Không lưu được');
    await store.getState().whenIdle();
    expect(titles(store, 'todo')).not.toContain('Không lưu được');
  });

  it('writes after a rollback are accepted again', async () => {
    const { store, repo } = await ready();
    repo.failWhen = (_m, i) => i === 0;
    store.getState().createTask({ title: 'Lỗi' }, 'todo');
    await store.getState().whenIdle();
    store.getState().createTask({ title: 'Lần hai' }, 'todo');
    await store.getState().whenIdle();
    expect(titles(store, 'todo')).toContain('Lần hai');
    expect(repo.persisted).toHaveLength(1);
  });

  it('validation errors never reach the repository', async () => {
    const { store, repo } = await ready();
    expect(store.getState().createTask({ title: '  ' }, 'todo')).toBe('Vui lòng nhập tiêu đề');
    expect(store.getState().createBoard('')).toBe('Vui lòng nhập tên bảng');
    await store.getState().whenIdle();
    expect(repo.persisted).toHaveLength(0);
  });
});

describe('actions persist the right mutations', () => {
  it('update, delete, rename, accent and labels', async () => {
    const { store, repo } = await ready();
    const id = idOf(store, 'Mua quà sinh nhật');
    const boardId = active(store).id;
    expect(store.getState().updateTask(id, { title: 'Mua quà cho mẹ', priority: 'high' })).toBeNull();
    const label = store.getState().addLabel('Nhà', 'pink');
    expect(label.ok).toBe(true);
    store.getState().renameBoard(boardId, 'Việc nhà');
    store.getState().setAccent(boardId, 'rose');
    store.getState().deleteTask(id);
    await store.getState().whenIdle();
    expect(repo.persisted.map((m) => m.type)).toEqual(['updateTask', 'addLabel', 'renameBoard', 'setAccent', 'deleteTask']);
    const saved = repo.state.boards[boardId]!;
    expect([saved.name, saved.accent, saved.tasks[id]]).toEqual(['Việc nhà', 'rose', undefined]);
  });

  it('deleting the last board also creates a fresh "Bảng của tôi"', async () => {
    const { store, repo } = await ready();
    const only = active(store).id;
    store.getState().deleteBoard(only);
    await store.getState().whenIdle();
    expect(repo.persisted.map((m) => m.type)).toEqual(['deleteBoard', 'createBoard']);
    expect(active(store).name).toBe('Bảng của tôi');
    expect(active(store).id).not.toBe(only);
  });
});

describe('offline', () => {
  it('blocks every write while offline and allows them again online', async () => {
    const { store, repo } = await ready();
    store.getState().setOnline(false);
    expect(store.getState().createTask({ title: 'X' }, 'todo')).toBe(OFFLINE_ERROR);
    expect(OFFLINE_ERROR).toBe('Đang offline, không thể chỉnh sửa.');
    expect(store.getState().createBoard('Y')).toBe(OFFLINE_ERROR);
    expect(store.getState().addLabel('Z', 'red')).toEqual({ ok: false, error: OFFLINE_ERROR });
    store.getState().moveTask(idOf(store, 'Mua quà sinh nhật'), 'done', 0);
    expect(titles(store, 'todo')).toContain('Mua quà sinh nhật');
    await store.getState().whenIdle();
    expect(repo.persisted).toHaveLength(0);
    store.getState().setOnline(true);
    expect(store.getState().createTask({ title: 'X' }, 'todo')).toBeNull();
  });
});

describe('review fixes: recovery after a failed save', () => {
  it('deleting the last board when its replacement fails to save ends in a recoverable error, not an empty screen', async () => {
    const { store, repo } = await ready();
    repo.failWhen = (m) => m.type === 'createBoard';
    store.getState().deleteBoard(active(store).id);
    await store.getState().whenIdle();
    expect(store.getState().status).toBe('error');
    repo.failWhen = () => false;
    await store.getState().reload();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().app.boardOrder).toHaveLength(1);
  });

  it('after a rollback the store re-syncs with what the server really has', async () => {
    const { store, repo } = await ready();
    const a = idOf(store, 'Mua quà sinh nhật');
    repo.failAfterCommitWhen = () => true; // server saved the move, the response was lost
    store.getState().moveTask(a, 'done', 0);
    await store.getState().whenIdle();
    expect(store.getState().notice).toBe(SAVE_FAILED_NOTICE);
    expect(titles(store, 'done')[0]).toBe('Mua quà sinh nhật');
  });

  it('the re-sync does not overwrite a change made while it was loading', async () => {
    const { store, repo } = await ready();
    repo.hold = true;
    repo.failWhen = (_m, i) => i === 0;
    store.getState().moveTask(idOf(store, 'Mua quà sinh nhật'), 'done', 0);
    await tick();
    repo.release(); // the move fails → rollback, re-sync load starts
    await tick();
    store.getState().createTask({ title: 'Làm trong lúc đồng bộ' }, 'todo');
    repo.release(); // re-sync load
    await tick();
    repo.release(); // createTask persist
    await store.getState().whenIdle();
    expect(titles(store, 'todo')).toContain('Làm trong lúc đồng bộ');
    expect(Object.values(repo.state.boards[active(store).id]!.tasks).map((t) => t.title)).toContain('Làm trong lúc đồng bộ');
  });
});
