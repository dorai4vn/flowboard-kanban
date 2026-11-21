import { newId } from './ids';
import { LIMITS, type AccentColor, type Board, type Label, type LabelColor, type Result } from './types';

const DEFAULT_LABELS: ReadonlyArray<[string, LabelColor]> = [
  ['Học tập', 'blue'],
  ['Công việc', 'purple'],
  ['Cá nhân', 'green'],
  ['Gấp', 'red'],
];

export function validateBoardName(name: string): Result<string> {
  const value = name.trim();
  if (!value) return { ok: false, error: 'Vui lòng nhập tên bảng' };
  if (value.length > LIMITS.boardName) return { ok: false, error: 'Tên bảng tối đa 60 ký tự' };
  return { ok: true, value };
}

export function createBoard(name: string, now: string): Result<Board> {
  const v = validateBoardName(name);
  if (!v.ok) return v;
  return {
    ok: true,
    value: {
      id: newId(),
      name: v.value,
      accent: 'indigo',
      labels: DEFAULT_LABELS.map(([n, color]) => ({ id: newId(), name: n, color })),
      columns: { todo: [], doing: [], done: [] },
      tasks: {},
      createdAt: now,
    },
  };
}

export function renameBoard(b: Board, name: string): Result<Board> {
  const v = validateBoardName(name);
  if (!v.ok) return v;
  return { ok: true, value: { ...b, name: v.value } };
}

export function setAccent(b: Board, accent: AccentColor): Board {
  return { ...b, accent };
}

export function addLabel(b: Board, name: string, color: LabelColor): Result<{ board: Board; label: Label }> {
  const value = name.trim();
  if (!value) return { ok: false, error: 'Vui lòng nhập tên nhãn' };
  if (value.length > LIMITS.labelName) return { ok: false, error: 'Tên nhãn tối đa 30 ký tự' };
  const label: Label = { id: newId(), name: value, color };
  return { ok: true, value: { board: { ...b, labels: [...b.labels, label] }, label } };
}

export function removeLabel(b: Board, labelId: string): Board {
  const tasks = Object.fromEntries(
    Object.entries(b.tasks).map(([id, t]) => [id, t.labelIds.includes(labelId) ? { ...t, labelIds: t.labelIds.filter((l) => l !== labelId) } : t]),
  );
  return { ...b, labels: b.labels.filter((l) => l.id !== labelId), tasks };
}
