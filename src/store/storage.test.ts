import { describe, expect, it } from 'vitest';
import { BLOCKED_NOTICE, CORRUPT_NOTICE, loadState, saveState } from './storage';
import { createMemoryStorage } from './memoryStorage';
import { STORAGE_KEY } from '../domain/schema';

const now = new Date(2026, 10, 21, 9, 0);

describe('loadState', () => {
  it('seeds a sample board when nothing is stored', () => {
    const { state, notice } = loadState(createMemoryStorage(), now);
    expect(notice).toBeNull();
    expect(state.version).toBe(1);
    expect(state.boardOrder).toHaveLength(1);
    const board = state.boards[state.activeBoardId]!;
    expect(board.name).toBe('Bảng của tôi');
    expect(Object.keys(board.tasks).length).toBeGreaterThanOrEqual(5);
    for (const col of ['todo', 'doing', 'done'] as const) expect(board.columns[col].length).toBeGreaterThan(0);
  });

  it('round-trips a saved state', () => {
    const storage = createMemoryStorage();
    const { state } = loadState(storage, now);
    saveState(storage, state);
    expect(loadState(storage, now)).toEqual({ state, notice: null });
  });

  it('backs up invalid JSON and starts fresh', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: '{bad json' });
    const { state, notice } = loadState(storage, now);
    expect(notice).toBe('Dữ liệu cũ bị lỗi, đã sao lưu và tạo bảng mới.');
    expect(notice).toBe(CORRUPT_NOTICE);
    expect(storage.getItem(`flowboard:backup-${now.getTime()}`)).toBe('{bad json');
    expect(state.boardOrder).toHaveLength(1);
  });

  it('backs up JSON that does not match the schema', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: '{"version":2}' });
    const { notice } = loadState(storage, now);
    expect(notice).toBe(CORRUPT_NOTICE);
    expect(storage.getItem(`flowboard:backup-${now.getTime()}`)).toBe('{"version":2}');
  });

  it('rejects a state whose columns reference missing tasks', () => {
    const storage = createMemoryStorage();
    const { state } = loadState(storage, now);
    const board = state.boards[state.activeBoardId]!;
    board.columns.todo.push('ghost');
    saveState(storage, state);
    expect(loadState(storage, now).notice).toBe(CORRUPT_NOTICE);
  });

  it('falls back to the first board when activeBoardId is unknown', () => {
    const storage = createMemoryStorage();
    const { state } = loadState(storage, now);
    saveState(storage, { ...state, activeBoardId: 'ghost' });
    expect(loadState(storage, now).state.activeBoardId).toBe(state.boardOrder[0]);
  });

  it('keeps working when storage throws or is missing', () => {
    const throwing = { ...createMemoryStorage(), getItem: () => { throw new Error('SecurityError'); } } as Storage;
    expect(loadState(throwing, now).notice).toBe('Trình duyệt chặn lưu trữ, dữ liệu sẽ mất khi đóng trang.');
    expect(loadState(null, now).notice).toBe(BLOCKED_NOTICE);
    expect(loadState(null, now).state.boardOrder).toHaveLength(1);
  });
});

describe('saveState', () => {
  it('swallows quota errors', () => {
    const full = { ...createMemoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } } as Storage;
    const { state } = loadState(createMemoryStorage(), now);
    expect(() => saveState(full, state)).not.toThrow();
  });
});

describe('corrupted data recovery is one-off', () => {
  it('saves the fresh state so a second load neither warns nor backs up again', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: '{bad json' });
    expect(loadState(storage, now).notice).toBe(CORRUPT_NOTICE);
    const later = new Date(now.getTime() + 1000);
    expect(loadState(storage, later).notice).toBeNull();
    const backups = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k?.startsWith('flowboard:backup-'));
    expect(backups).toHaveLength(1);
  });
});
