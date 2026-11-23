import { createBoard } from './board.js';
import { addDays, toLocalDateKey } from './dates.js';
import { createTask, type TaskInput } from './task.js';
import type { AppState, Board, ColumnId } from './types.js';

/** A fresh board with no tasks, used when the user deletes their last board. */
export function createEmptyBoard(now: Date): Board {
  const r = createBoard('Bảng của tôi', now.toISOString());
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

export function createSeedState(now: Date): AppState {
  const iso = now.toISOString();
  const today = toLocalDateKey(now);
  let board = createEmptyBoard(now);
  const label = (name: string) => board.labels.find((l) => l.name === name)!.id;
  const samples: [ColumnId, TaskInput][] = [
    ['todo', { title: 'Hoàn thành bài tập buổi 8', description: 'Xây dựng ứng dụng Kanban theo Agentic Engineering.', priority: 'high', dueDate: today, labelIds: [label('Học tập')] }],
    ['todo', { title: 'Đọc tài liệu về AI Agent', priority: 'medium', dueDate: addDays(today, 3), labelIds: [label('Học tập')] }],
    ['todo', { title: 'Mua quà sinh nhật', priority: 'low', labelIds: [label('Cá nhân')] }],
    ['doing', { title: 'Viết báo cáo tuần', description: 'Tổng hợp tiến độ và gửi cho nhóm.', priority: 'urgent', dueDate: addDays(today, -1), labelIds: [label('Công việc'), label('Gấp')] }],
    ['done', { title: 'Thiết lập dự án FlowBoard', priority: 'medium', labelIds: [label('Công việc')] }],
  ];
  for (const [column, input] of samples) {
    const r = createTask(board, input, column, iso);
    if (!r.ok) throw new Error(r.error);
    board = r.value.board;
  }
  return { version: 1, boards: { [board.id]: board }, boardOrder: [board.id], activeBoardId: board.id };
}
