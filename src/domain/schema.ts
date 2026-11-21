import { z } from 'zod';
import { ACCENTS, COLUMN_IDS, LABEL_COLORS, LIMITS, PRIORITIES, type AppState } from './types';

export const STORAGE_KEY = 'flowboard:state';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const labelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(LIMITS.labelName),
  color: z.enum(LABEL_COLORS as [string, ...string[]]),
});

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(LIMITS.title),
  description: z.string().max(LIMITS.description),
  priority: z.enum(PRIORITIES as [string, ...string[]]),
  dueDate: dateKey.nullable(),
  labelIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

const boardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(LIMITS.boardName),
    accent: z.enum(ACCENTS as [string, ...string[]]),
    labels: z.array(labelSchema),
    columns: z.object({ todo: z.array(z.string()), doing: z.array(z.string()), done: z.array(z.string()) }),
    tasks: z.record(z.string(), taskSchema),
    createdAt: z.string(),
  })
  .superRefine((b, ctx) => {
    const placed = COLUMN_IDS.flatMap((c) => b.columns[c]);
    const ids = Object.keys(b.tasks);
    if (placed.length !== new Set(placed).size || placed.length !== ids.length || placed.some((id) => !b.tasks[id])) {
      ctx.addIssue({ code: 'custom', message: 'columns and tasks are inconsistent' });
    }
  });

export const appStateSchema = z
  .object({
    version: z.literal(1),
    boards: z.record(z.string(), boardSchema),
    boardOrder: z.array(z.string()).min(1),
    activeBoardId: z.string(),
  })
  .superRefine((s, ctx) => {
    const keys = Object.keys(s.boards);
    if (s.boardOrder.length !== keys.length || s.boardOrder.some((id) => !s.boards[id])) {
      ctx.addIssue({ code: 'custom', message: 'boardOrder does not match boards' });
    }
  });

export function parseAppState(value: unknown): AppState | null {
  const r = appStateSchema.safeParse(value);
  return r.success ? (r.data as AppState) : null;
}
