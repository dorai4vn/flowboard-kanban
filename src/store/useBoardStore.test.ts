import { describe, expect, it } from 'vitest';
import { createBoardStore } from './useBoardStore';
import { createMemoryStorage } from './memoryStorage';

const clock = () => new Date(2026, 10, 21, 9, 0);
const activeBoard = (s: ReturnType<typeof createBoardStore>) => {
  const { app } = s.getState();
  return app.boards[app.activeBoardId]!;
};

describe('board store', () => {
  it('persists a created task across store instances', () => {
    const storage = createMemoryStorage();
    const a = createBoardStore(storage, clock);
    expect(a.getState().createTask({ title: 'Nộp bài tập' }, 'todo')).toBeNull();
    const b = createBoardStore(storage, clock);
    expect(Object.values(activeBoard(b).tasks).map((t) => t.title)).toContain('Nộp bài tập');
  });

  it('returns the validation error and leaves state untouched', () => {
    const s = createBoardStore(createMemoryStorage(), clock);
    const before = s.getState().app;
    expect(s.getState().createTask({ title: '' }, 'todo')).toBe('Vui lòng nhập tiêu đề');
    expect(s.getState().app).toBe(before);
  });

  it('moves, updates and deletes tasks', () => {
    const s = createBoardStore(createMemoryStorage(), clock);
    s.getState().createTask({ title: 'X' }, 'todo');
    const id = Object.values(activeBoard(s).tasks).find((t) => t.title === 'X')!.id;
    s.getState().moveTask(id, 'done', 0);
    expect(activeBoard(s).columns.done[0]).toBe(id);
    expect(s.getState().updateTask(id, { title: 'Y' })).toBeNull();
    expect(activeBoard(s).tasks[id]!.title).toBe('Y');
    s.getState().deleteTask(id);
    expect(activeBoard(s).tasks[id]).toBeUndefined();
  });

  it('creates, switches, recolors and renames boards; switching resets the filter', () => {
    const s = createBoardStore(createMemoryStorage(), clock);
    s.getState().setFilter({ query: 'abc' });
    expect(s.getState().createBoard('Đồ án')).toBeNull();
    expect(activeBoard(s).name).toBe('Đồ án');
    expect(s.getState().filter.query).toBe('');
    s.getState().setAccent(activeBoard(s).id, 'rose');
    expect(activeBoard(s).accent).toBe('rose');
    expect(s.getState().renameBoard(activeBoard(s).id, '')).toBe('Vui lòng nhập tên bảng');
    expect(s.getState().createBoard(' ')).toBe('Vui lòng nhập tên bảng');
    expect(s.getState().app.boardOrder).toHaveLength(2);
  });

  it('deleting the active board selects the first remaining one', () => {
    const s = createBoardStore(createMemoryStorage(), clock);
    const first = s.getState().app.boardOrder[0]!;
    s.getState().createBoard('Thứ hai');
    s.getState().deleteBoard(activeBoard(s).id);
    expect(s.getState().app.activeBoardId).toBe(first);
    expect(s.getState().app.boardOrder).toEqual([first]);
  });

  it('deleting the last board recreates "Bảng của tôi"', () => {
    const s = createBoardStore(createMemoryStorage(), clock);
    const only = s.getState().app.activeBoardId;
    s.getState().deleteBoard(only);
    const { app } = s.getState();
    expect(app.boardOrder).toHaveLength(1);
    expect(app.activeBoardId).not.toBe(only);
    expect(activeBoard(s).name).toBe('Bảng của tôi');
  });

  it('adds a label to the active board and returns it', () => {
    const s = createBoardStore(createMemoryStorage(), clock);
    const r = s.getState().addLabel('Nhà', 'pink');
    expect(r).toMatchObject({ ok: true });
    expect(activeBoard(s).labels.map((l) => l.name)).toContain('Nhà');
  });

  it('exposes the load notice and lets it be dismissed', () => {
    const s = createBoardStore(createMemoryStorage({ 'flowboard:state': 'nope' }), clock);
    expect(s.getState().notice).toBe('Dữ liệu cũ bị lỗi, đã sao lưu và tạo bảng mới.');
    s.getState().dismissNotice();
    expect(s.getState().notice).toBeNull();
  });
});
