export type ColumnId = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type AccentColor = 'indigo' | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose';
export type LabelColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  /** Local calendar day, `YYYY-MM-DD`, or null when there is no deadline. */
  dueDate: string | null;
  labelIds: string[];
  createdAt: string;
  updatedAt: string;
  /** Set when the task enters the `done` column, cleared when it leaves. */
  completedAt: string | null;
}

export interface Board {
  id: string;
  name: string;
  accent: AccentColor;
  labels: Label[];
  columns: Record<ColumnId, string[]>;
  tasks: Record<string, Task>;
  createdAt: string;
}

export interface AppState {
  version: 1;
  boards: Record<string, Board>;
  boardOrder: string[];
  activeBoardId: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const COLUMN_IDS: readonly ColumnId[] = ['todo', 'doing', 'done'];

export const COLUMN_TITLES: Record<ColumnId, string> = {
  todo: 'Cần làm',
  doing: 'Đang làm',
  done: 'Hoàn thành',
};

export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high', 'urgent'];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn',
};

export const ACCENTS: readonly AccentColor[] = ['indigo', 'violet', 'blue', 'emerald', 'amber', 'rose'];

export const ACCENT_NAMES: Record<AccentColor, string> = {
  indigo: 'Indigo',
  violet: 'Tím',
  blue: 'Xanh dương',
  emerald: 'Ngọc lục bảo',
  amber: 'Hổ phách',
  rose: 'Hồng',
};

export const LABEL_COLORS: readonly LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'];

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  red: 'Đỏ',
  orange: 'Cam',
  yellow: 'Vàng',
  green: 'Xanh lá',
  blue: 'Xanh dương',
  purple: 'Tím',
  pink: 'Hồng',
  gray: 'Xám',
};

export const LIMITS = { title: 200, description: 2000, boardName: 60, labelName: 30 } as const;
