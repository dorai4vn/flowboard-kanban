import { parseAppState, STORAGE_KEY } from '../domain/schema';
import { createSeedState } from '../domain/seed';
import type { AppState } from '../domain/types';

export const CORRUPT_NOTICE = 'Dữ liệu cũ bị lỗi, đã sao lưu và tạo bảng mới.';
export const BLOCKED_NOTICE = 'Trình duyệt chặn lưu trữ, dữ liệu sẽ mất khi đóng trang.';

export function loadState(storage: Storage | null, now: Date): { state: AppState; notice: string | null } {
  if (!storage) return { state: createSeedState(now), notice: BLOCKED_NOTICE };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: createSeedState(now), notice: BLOCKED_NOTICE };
  }
  if (raw === null) return { state: createSeedState(now), notice: null };

  let parsed: AppState | null;
  try {
    parsed = parseAppState(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    try {
      storage.setItem(`flowboard:backup-${now.getTime()}`, raw);
    } catch {
      // Backup is best effort; we still must not crash.
    }
    return { state: createSeedState(now), notice: CORRUPT_NOTICE };
  }
  if (!parsed.boards[parsed.activeBoardId]) parsed = { ...parsed, activeBoardId: parsed.boardOrder[0]! };
  return { state: parsed, notice: null };
}

export function saveState(storage: Storage | null, state: AppState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage blocked: keep running in memory.
  }
}

/** `window.localStorage`, or null when the browser blocks access to it. */
export function browserStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__flowboard_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
