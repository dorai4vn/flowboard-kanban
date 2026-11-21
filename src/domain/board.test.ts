import { describe, expect, it } from 'vitest';
import { addLabel, createBoard, removeLabel, renameBoard, setAccent } from './board';
import { createTask } from './task';
import type { Board } from './types';

const now = '2026-11-21T08:00:00.000Z';

function board(): Board {
  const r = createBoard('Bảng của tôi', now);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('createBoard', () => {
  it('creates an indigo board with three empty columns and four default labels', () => {
    const b = board();
    expect(b.name).toBe('Bảng của tôi');
    expect(b.accent).toBe('indigo');
    expect(b.columns).toEqual({ todo: [], doing: [], done: [] });
    expect(b.labels.map((l) => [l.name, l.color])).toEqual([
      ['Học tập', 'blue'],
      ['Công việc', 'purple'],
      ['Cá nhân', 'green'],
      ['Gấp', 'red'],
    ]);
  });

  it('rejects blank and too long names', () => {
    expect(createBoard('   ', now)).toEqual({ ok: false, error: 'Vui lòng nhập tên bảng' });
    expect(createBoard('a'.repeat(61), now)).toEqual({ ok: false, error: 'Tên bảng tối đa 60 ký tự' });
  });
});

describe('renameBoard / setAccent', () => {
  it('renames with trimming and validates', () => {
    const r = renameBoard(board(), '  Đồ án  ');
    expect(r.ok && r.value.name).toBe('Đồ án');
    expect(renameBoard(board(), '').ok).toBe(false);
  });

  it('changes the accent without mutating the input', () => {
    const b = board();
    const snapshot = structuredClone(b);
    expect(setAccent(b, 'rose').accent).toBe('rose');
    expect(b).toEqual(snapshot);
  });
});

describe('labels', () => {
  it('adds a trimmed label and rejects a blank name', () => {
    const r = addLabel(board(), '  Nhà  ', 'pink');
    expect(r.ok && r.value.label).toMatchObject({ name: 'Nhà', color: 'pink' });
    expect(r.ok && r.value.board.labels).toHaveLength(5);
    expect(addLabel(board(), ' ', 'pink')).toEqual({ ok: false, error: 'Vui lòng nhập tên nhãn' });
  });

  it('removing a label detaches it from every task', () => {
    const b = board();
    const labelId = b.labels[0]!.id;
    const r = createTask(b, { title: 'A', labelIds: [labelId] }, 'todo', now);
    if (!r.ok) throw new Error(r.error);
    const after = removeLabel(r.value.board, labelId);
    expect(after.labels.find((l) => l.id === labelId)).toBeUndefined();
    expect(after.tasks[r.value.task.id]!.labelIds).toEqual([]);
  });
});
