import { createStore, useStore, type StoreApi } from 'zustand';
import { applyMutation, planMove, type BoardsState, type Mutation } from '../data/mutations';
import type { BoardRepository } from '../data/repository';
import * as boards from '../domain/board';
import { EMPTY_FILTER, type TaskFilter } from '../domain/filters';
import { createEmptyBoard, createSeedState } from '../domain/seed';
import * as tasks from '../domain/task';
import type { TaskInput } from '../domain/task';
import type { AccentColor, Board, ColumnId, Label, LabelColor, Result } from '../domain/types';

export const SAVE_FAILED_NOTICE = 'Không lưu được thay đổi, đã hoàn tác.';
export const OFFLINE_ERROR = 'Đang offline, không thể chỉnh sửa.';
const NOT_READY_ERROR = 'Dữ liệu chưa sẵn sàng, vui lòng thử lại.';

export type ViewState = BoardsState & { activeBoardId: string };
export type Status = 'signedOut' | 'loading' | 'ready' | 'error';

export type BoardStoreState = {
  status: Status;
  userId: string | null;
  online: boolean;
  saving: boolean;
  app: ViewState;
  notice: string | null;
  filter: TaskFilter;
  /** Clear everything of the previous user, cancel their requests, then load `userId` (null = signed out). */
  switchUser: (userId: string | null) => Promise<void>;
  reload: () => Promise<void>;
  setOnline: (online: boolean) => void;
  /** Resolves when every queued write has settled (tests, sign-out). */
  whenIdle: () => Promise<void>;
  createBoard: (name: string) => string | null;
  renameBoard: (id: string, name: string) => string | null;
  deleteBoard: (id: string) => void;
  setActiveBoard: (id: string) => void;
  setAccent: (id: string, accent: AccentColor) => void;
  addLabel: (name: string, color: LabelColor) => Result<Label>;
  createTask: (input: TaskInput, column: ColumnId) => string | null;
  updateTask: (id: string, patch: Partial<TaskInput>) => string | null;
  deleteTask: (id: string) => void;
  moveTask: (id: string, to: ColumnId, toIndex: number) => void;
  /** Mark a task done on the board that holds it (Today / Overdue views work across boards). */
  completeTask: (boardId: string, taskId: string) => void;
  setFilter: (patch: Partial<TaskFilter>) => void;
  resetFilter: () => void;
  dismissNotice: () => void;
};

export type BoardStore = StoreApi<BoardStoreState>;

type Options = {
  repo: BoardRepository;
  now?: () => Date;
  /** Per-device UI preferences (last active board). Never holds board data. */
  prefs?: Storage | null;
  initialOnline?: boolean;
};

const EMPTY: BoardsState = { boards: {}, boardOrder: [] };
const EMPTY_VIEW: ViewState = { ...EMPTY, activeBoardId: '' };

export function createBoardStore({ repo, now = () => new Date(), prefs = null, initialOnline = true }: Options): BoardStore {
  // Session bookkeeping lives outside React state so stale async work can be detected synchronously.
  let epoch = 0; // bumps on every user change
  let generation = 0; // bumps on user change and on rollback: queued writes of an older generation are dropped
  let controller = new AbortController();
  let confirmed: BoardsState = EMPTY; // last state the server acknowledged
  let chain: Promise<void> = Promise.resolve();
  let pending = 0;
  let writeSeq = 0; // bumps on every optimistic change, so a re-sync never hides a newer one

  const prefKey = (userId: string) => `flowboard:activeBoard:${userId}`;
  const readPref = (userId: string) => {
    try {
      return prefs?.getItem(prefKey(userId)) ?? null;
    } catch {
      return null;
    }
  };
  const writePref = (userId: string | null, boardId: string) => {
    if (!userId) return;
    try {
      prefs?.setItem(prefKey(userId), boardId);
    } catch {
      // preferences are best effort
    }
  };

  return createStore<BoardStoreState>((set, get) => {
    const pickActive = (s: BoardsState, preferred: string | null) =>
      preferred && s.boards[preferred] ? preferred : (s.boardOrder[0] ?? '');

    const view = (s: BoardsState): ViewState => ({ ...s, activeBoardId: pickActive(s, get().app.activeBoardId) });

    const loadFor = async (myEpoch: number, userId: string) => {
      const signal = controller.signal;
      const stale = () => myEpoch !== epoch;
      try {
        let data = await repo.load(signal);
        if (stale()) return;
        if (data.boardOrder.length === 0) {
          const seed = createSeedState(now());
          await repo.ensureStarter(seed.boards[seed.boardOrder[0]!]!, signal);
          if (stale()) return;
          data = await repo.load(signal);
          if (stale()) return;
        }
        confirmed = data;
        set({ status: 'ready', app: { ...data, activeBoardId: pickActive(data, readPref(userId)) } });
      } catch {
        if (stale()) return;
        set({ status: 'error' });
      }
    };

    /** Replace the confirmed state with the server's after a failed save. */
    const resync = async (myEpoch: number, seq: number) => {
      if (myEpoch !== epoch) return;
      try {
        const data = await repo.load(controller.signal);
        if (myEpoch !== epoch) return;
        if (seq !== writeSeq) {
          // the user changed something meanwhile: keep their view, the queued writes build on the server state
          confirmed = data;
          return;
        }
        confirmed = data;
        if (data.boardOrder.length === 0) set({ status: 'error', app: view(data) });
        else set({ app: view(data) });
      } catch {
        if (myEpoch !== epoch) return;
        if (confirmed.boardOrder.length === 0 && seq === writeSeq) set({ status: 'error' });
      }
    };

    /** Check that a write may happen now. Returns an error message or null. */
    const blocked = (): string | null => {
      const s = get();
      if (!s.online) return OFFLINE_ERROR;
      if (s.status !== 'ready') return NOT_READY_ERROR;
      return null;
    };

    const enqueue = (m: Mutation) => {
      const myEpoch = epoch;
      const myGen = generation;
      const signal = controller.signal;
      const current = () => myEpoch === epoch && myGen === generation;
      pending++;
      set({ saving: true });
      chain = chain.then(async () => {
        try {
          if (!current()) return;
          await repo.persist(m, signal);
          if (!current()) return;
          confirmed = applyMutation(confirmed, m);
        } catch {
          if (!current()) return;
          generation++; // drop every write queued behind the failed one
          set({ app: view(confirmed), notice: SAVE_FAILED_NOTICE });
          // The write may have reached the server anyway (lost response): re-read the truth.
          const seq = writeSeq;
          chain = chain.then(() => resync(myEpoch, seq));
        } finally {
          if (myEpoch === epoch) {
            pending = Math.max(0, pending - 1);
            if (pending === 0) set({ saving: false });
          }
        }
      });
    };

    /** Apply optimistically, then queue for persistence. */
    const commit = (...ms: Mutation[]) => {
      writeSeq++;
      let next: BoardsState = get().app;
      for (const m of ms) next = applyMutation(next, m);
      set({ app: view(next) });
      ms.forEach(enqueue);
    };

    const active = (): Board | undefined => {
      const { app } = get();
      return app.boards[app.activeBoardId];
    };
    const iso = () => now().toISOString();

    return {
      status: 'signedOut',
      userId: null,
      online: initialOnline,
      saving: false,
      app: EMPTY_VIEW,
      notice: null,
      filter: EMPTY_FILTER,

      switchUser: async (userId) => {
        epoch++;
        generation++;
        controller.abort();
        controller = new AbortController();
        chain = Promise.resolve();
        pending = 0;
        confirmed = EMPTY;
        set({ userId, status: userId ? 'loading' : 'signedOut', app: EMPTY_VIEW, filter: EMPTY_FILTER, notice: null, saving: false });
        if (userId) await loadFor(epoch, userId);
      },

      reload: async () => {
        const { userId } = get();
        if (!userId) return;
        set({ status: 'loading' });
        await loadFor(epoch, userId);
      },

      setOnline: (online) => set({ online }),
      whenIdle: async () => {
        let seen: Promise<void>;
        do {
          seen = chain;
          await seen;
        } while (seen !== chain);
      },

      createBoard: (name) => {
        const err = blocked();
        if (err) return err;
        const r = boards.createBoard(name, iso());
        if (!r.ok) return r.error;
        commit({ type: 'createBoard', board: r.value });
        set({ app: { ...get().app, activeBoardId: r.value.id }, filter: EMPTY_FILTER });
        writePref(get().userId, r.value.id);
        return null;
      },
      renameBoard: (id, name) => {
        const err = blocked();
        if (err) return err;
        const b = get().app.boards[id];
        if (!b) return null;
        const r = boards.renameBoard(b, name);
        if (!r.ok) return r.error;
        commit({ type: 'renameBoard', boardId: id, name: r.value.name });
        return null;
      },
      deleteBoard: (id) => {
        if (blocked() || !get().app.boards[id]) return;
        const ms: Mutation[] = [{ type: 'deleteBoard', boardId: id }];
        if (get().app.boardOrder.length === 1) ms.push({ type: 'createBoard', board: createEmptyBoard(now()) });
        commit(...ms);
        set({ filter: EMPTY_FILTER });
      },
      setActiveBoard: (id) => {
        const { app } = get();
        if (!app.boards[id] || app.activeBoardId === id) return;
        set({ app: { ...app, activeBoardId: id }, filter: EMPTY_FILTER });
        writePref(get().userId, id);
      },
      setAccent: (id, accent) => {
        if (blocked() || !get().app.boards[id]) return;
        commit({ type: 'setAccent', boardId: id, accent });
      },
      addLabel: (name, color) => {
        const err = blocked();
        if (err) return { ok: false, error: err };
        const b = active();
        if (!b) return { ok: false, error: NOT_READY_ERROR };
        const r = boards.addLabel(b, name, color);
        if (!r.ok) return r;
        commit({ type: 'addLabel', boardId: b.id, label: r.value.label });
        return { ok: true, value: r.value.label };
      },
      createTask: (input, column) => {
        const err = blocked();
        if (err) return err;
        const b = active();
        if (!b) return NOT_READY_ERROR;
        const r = tasks.createTask(b, input, column, iso());
        if (!r.ok) return r.error;
        commit({ type: 'createTask', boardId: b.id, task: r.value.task, column });
        return null;
      },
      updateTask: (id, patch) => {
        const err = blocked();
        if (err) return err;
        const b = active();
        if (!b) return NOT_READY_ERROR;
        const r = tasks.updateTask(b, id, patch, iso());
        if (!r.ok) return r.error;
        commit({ type: 'updateTask', boardId: b.id, task: r.value.tasks[id]! });
        return null;
      },
      deleteTask: (id) => {
        const b = active();
        if (blocked() || !b?.tasks[id]) return;
        commit({ type: 'deleteTask', boardId: b.id, taskId: id });
      },
      moveTask: (id, to, toIndex) => {
        const b = active();
        if (blocked() || !b) return;
        const m = planMove(b, id, to, toIndex, iso());
        if (m) commit(m);
      },
      completeTask: (boardId, taskId) => {
        const b = get().app.boards[boardId];
        if (blocked() || !b?.tasks[taskId] || b.columns.done.includes(taskId)) return;
        const m = planMove(b, taskId, 'done', b.columns.done.length, iso());
        if (m) commit(m);
      },
      setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
      resetFilter: () => set({ filter: EMPTY_FILTER }),
      dismissNotice: () => set({ notice: null }),
    };
  });
}

let appStore: BoardStore | null = null;

/** The app-wide store. `main.tsx` installs the Supabase-backed one; tests install their own. */
export function getAppStore(): BoardStore {
  if (!appStore) throw new Error('Board store is not initialised');
  return appStore;
}

export function setAppStore(store: BoardStore | null): void {
  appStore = store;
}

export function useBoardStore<T>(selector: (s: BoardStoreState) => T): T {
  return useStore(getAppStore(), selector);
}

export function useActiveBoard(): Board | undefined {
  return useBoardStore((s) => s.app.boards[s.app.activeBoardId]);
}
