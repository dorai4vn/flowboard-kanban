import { createStore, useStore, type StoreApi } from 'zustand';
import * as boards from '../domain/board';
import { EMPTY_FILTER, type TaskFilter } from '../domain/filters';
import { createEmptyBoard } from '../domain/seed';
import * as tasks from '../domain/task';
import type { TaskInput } from '../domain/task';
import type { AccentColor, AppState, Board, ColumnId, Label, LabelColor, Result } from '../domain/types';
import { browserStorage, loadState, saveState } from './storage';

export type BoardStoreState = {
  app: AppState;
  notice: string | null;
  filter: TaskFilter;
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
  setFilter: (patch: Partial<TaskFilter>) => void;
  resetFilter: () => void;
  dismissNotice: () => void;
};

export type BoardStore = StoreApi<BoardStoreState>;

export function createBoardStore(storage: Storage | null, now: () => Date = () => new Date()): BoardStore {
  const loaded = loadState(storage, now());

  return createStore<BoardStoreState>((set, get) => {
    const commit = (app: AppState, extra: Partial<BoardStoreState> = {}) => {
      saveState(storage, app);
      set({ app, ...extra });
    };
    const active = (): Board => {
      const { app } = get();
      return app.boards[app.activeBoardId]!;
    };
    const putBoard = (board: Board) => commit({ ...get().app, boards: { ...get().app.boards, [board.id]: board } });

    return {
      app: loaded.state,
      notice: loaded.notice,
      filter: EMPTY_FILTER,

      createBoard: (name) => {
        const r = boards.createBoard(name, now().toISOString());
        if (!r.ok) return r.error;
        const { app } = get();
        commit(
          { ...app, boards: { ...app.boards, [r.value.id]: r.value }, boardOrder: [...app.boardOrder, r.value.id], activeBoardId: r.value.id },
          { filter: EMPTY_FILTER },
        );
        return null;
      },
      renameBoard: (id, name) => {
        const b = get().app.boards[id];
        if (!b) return null;
        const r = boards.renameBoard(b, name);
        if (!r.ok) return r.error;
        putBoard(r.value);
        return null;
      },
      deleteBoard: (id) => {
        const { app } = get();
        if (!app.boards[id]) return;
        const rest = { ...app.boards };
        delete rest[id];
        let order = app.boardOrder.filter((b) => b !== id);
        if (order.length === 0) {
          const fresh = createEmptyBoard(now());
          rest[fresh.id] = fresh;
          order = [fresh.id];
        }
        const activeBoardId = app.activeBoardId === id ? order[0]! : app.activeBoardId;
        commit({ ...app, boards: rest, boardOrder: order, activeBoardId }, { filter: EMPTY_FILTER });
      },
      setActiveBoard: (id) => {
        const { app } = get();
        if (!app.boards[id] || app.activeBoardId === id) return;
        commit({ ...app, activeBoardId: id }, { filter: EMPTY_FILTER });
      },
      setAccent: (id, accent) => {
        const b = get().app.boards[id];
        if (b) putBoard(boards.setAccent(b, accent));
      },
      addLabel: (name, color) => {
        const r = boards.addLabel(active(), name, color);
        if (!r.ok) return r;
        putBoard(r.value.board);
        return { ok: true, value: r.value.label };
      },
      createTask: (input, column) => {
        const r = tasks.createTask(active(), input, column, now().toISOString());
        if (!r.ok) return r.error;
        putBoard(r.value.board);
        return null;
      },
      updateTask: (id, patch) => {
        const r = tasks.updateTask(active(), id, patch, now().toISOString());
        if (!r.ok) return r.error;
        putBoard(r.value);
        return null;
      },
      deleteTask: (id) => putBoard(tasks.deleteTask(active(), id)),
      moveTask: (id, to, toIndex) => {
        const before = active();
        const after = tasks.moveTask(before, id, to, toIndex, now().toISOString());
        if (after !== before) putBoard(after);
      },
      setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
      resetFilter: () => set({ filter: EMPTY_FILTER }),
      dismissNotice: () => set({ notice: null }),
    };
  });
}

let appStore: BoardStore | null = null;

/** The app-wide store, backed by localStorage. Tests may replace it with `setAppStore`. */
export function getAppStore(): BoardStore {
  appStore ??= createBoardStore(browserStorage());
  return appStore;
}

export function setAppStore(store: BoardStore | null): void {
  appStore = store;
}

export function useBoardStore<T>(selector: (s: BoardStoreState) => T): T {
  return useStore(getAppStore(), selector);
}

export function useActiveBoard(): Board {
  return useBoardStore((s) => s.app.boards[s.app.activeBoardId]!);
}
