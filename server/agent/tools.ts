import { tool, type RunContext } from '@openai/agents';
import { z } from 'zod';
import type { ApprovalAction, ApprovalStore } from './approvals.js';
import type { WorkspaceService } from './workspace.js';

/** Per-request context shared by all tools (never sent to the model). */
export type AgentContext = {
  workspace: WorkspaceService;
  approvals: ApprovalStore;
  today: string;
  /** Set only by the approval endpoint after a successful backend claim; single use. */
  claim?: { approvalId: string; claimToken: string; action: ApprovalAction; targetId: string };
  /** Set when an approved deletion really happened. */
  executed?: { action: ApprovalAction; label: string };
  /** Code returned by Postgres when an approved deletion was refused (e.g. 'target_changed'). */
  refused?: string;
  /** The in-flight deletion RPC, so a timeout never reports failure while the delete may still commit. */
  execution?: Promise<void>;
  /**
   * The SDK serializes the run context into the stored run state. Only the date is kept: no board data,
   * repository, Supabase client or credentials ever leave this request.
   */
  toJSON(): { today: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = z.enum(['todo', 'doing', 'done']);
const PRIORITY = z.enum(['low', 'medium', 'high', 'urgent']);

const ctxOf = (rc?: RunContext<AgentContext>): AgentContext => {
  if (!rc?.context) throw new Error('missing agent context');
  return rc.context;
};
const json = (v: unknown) => JSON.stringify(v);
const bad = (error: string) => json({ ok: false, error });

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

export const readTools = [
  tool({
    name: 'list_boards',
    description: 'Liệt kê các bảng của người dùng kèm số công việc theo cột, % hoàn thành, số việc đến hạn hôm nay và quá hạn.',
    parameters: z.object({}),
    execute: async (_input, rc?: RunContext<AgentContext>) => json({ ok: true, boards: ctxOf(rc).workspace.listBoards() }),
  }),
  tool({
    name: 'get_board',
    description: 'Xem toàn bộ công việc của một bảng, nhóm theo cột (todo=Cần làm, doing=Đang làm, done=Hoàn thành).',
    parameters: z.object({ board_id: z.string().max(64) }),
    execute: async ({ board_id }, rc?: RunContext<AgentContext>) =>
      UUID.test(board_id) ? json(ctxOf(rc).workspace.getBoard(board_id)) : bad('board_id không hợp lệ.'),
  }),
  tool({
    name: 'search_tasks',
    description:
      'Tìm công việc theo từ khóa (không phân biệt dấu/hoa thường) trên mọi bảng hoặc một bảng. Trả về id, tiêu đề, bảng, cột, ưu tiên, hạn chót. Dùng trước khi sửa/xóa để lấy đúng id.',
    parameters: z.object({
      query: z.string().max(100),
      board_id: z.string().max(64).nullable(),
      include_done: z.boolean(),
    }),
    execute: async (input, rc?: RunContext<AgentContext>) => {
      if (input.board_id !== null && !UUID.test(input.board_id)) return bad('board_id không hợp lệ.');
      return json({ ok: true, tasks: ctxOf(rc).workspace.searchTasks(input) });
    },
  }),
  tool({
    name: 'get_focus',
    description: 'Danh sách việc đến hạn hôm nay (kind=today) hoặc quá hạn chưa xong (kind=overdue) trên mọi bảng.',
    parameters: z.object({ kind: z.enum(['today', 'overdue']) }),
    execute: async ({ kind }, rc?: RunContext<AgentContext>) => json({ ok: true, kind, today: ctxOf(rc).today, tasks: ctxOf(rc).workspace.focus(kind) }),
  }),
];

export const writeTools = [
  tool({
    name: 'create_board',
    description: 'Tạo bảng mới (tên 1–60 ký tự).',
    parameters: z.object({ name: z.string().max(200) }),
    execute: async (input, rc?: RunContext<AgentContext>) => json(await ctxOf(rc).workspace.createBoard(input)),
  }),
  tool({
    name: 'create_task',
    description: 'Tạo công việc trong một bảng. status mặc định todo. due_date dạng YYYY-MM-DD hoặc null.',
    parameters: z.object({
      board_id: z.string().max(64),
      title: z.string().max(400),
      description: z.string().max(4000).nullable(),
      priority: PRIORITY.nullable(),
      due_date: z.string().max(10).nullable(),
      status: STATUS.nullable(),
    }),
    execute: async (input, rc?: RunContext<AgentContext>) => {
      if (!UUID.test(input.board_id)) return bad('board_id không hợp lệ.');
      if (input.due_date !== null && !validDate(input.due_date)) return bad('Hạn chót phải có dạng YYYY-MM-DD hợp lệ.');
      return json(await ctxOf(rc).workspace.createTask(input));
    },
  }),
  tool({
    name: 'update_task',
    description:
      'Sửa tiêu đề, mô tả, ưu tiên hoặc hạn chót của một công việc. Trường null = giữ nguyên. clear_due_date=true để bỏ hạn chót. Không dùng để đổi cột.',
    parameters: z.object({
      task_id: z.string().max(64),
      title: z.string().max(400).nullable(),
      description: z.string().max(4000).nullable(),
      priority: PRIORITY.nullable(),
      due_date: z.string().max(10).nullable(),
      clear_due_date: z.boolean(),
    }),
    execute: async (input, rc?: RunContext<AgentContext>) => {
      if (!UUID.test(input.task_id)) return bad('task_id không hợp lệ.');
      if (input.due_date !== null && !validDate(input.due_date)) return bad('Hạn chót phải có dạng YYYY-MM-DD hợp lệ.');
      return json(await ctxOf(rc).workspace.updateTask(input));
    },
  }),
  tool({
    name: 'move_task',
    description: 'Chuyển công việc sang cột khác: todo (Cần làm), doing (Đang làm), done (Hoàn thành = đánh dấu đã xong).',
    parameters: z.object({ task_id: z.string().max(64), status: STATUS }),
    execute: async (input, rc?: RunContext<AgentContext>) =>
      UUID.test(input.task_id) ? json(await ctxOf(rc).workspace.moveTask(input)) : bad('task_id không hợp lệ.'),
  }),
];

/**
 * Deletion tools. The SDK interrupts the run before calling them (needsApproval), AND the execute function
 * refuses to act unless the approval endpoint attached a backend-claimed approval for exactly this target.
 * The deletion itself is performed by Postgres in one transaction that consumes the claim.
 */
function deletionTool(action: ApprovalAction, idField: 'task_id' | 'board_id', description: string) {
  return tool({
    name: action,
    description,
    needsApproval: true,
    parameters: z.object({ [idField]: z.string().max(64) }) as z.ZodObject<Record<typeof idField, z.ZodString>>,
    execute: async (input: Record<string, string>, rc?: RunContext<AgentContext>) => {
      const ctx = ctxOf(rc);
      const targetId = input[idField] ?? '';
      const claim = ctx.claim;
      if (!claim || claim.action !== action || claim.targetId !== targetId) {
        return bad('Thao tác xóa cần người dùng phê duyệt trong ứng dụng. Chưa có gì bị xóa.');
      }
      ctx.claim = undefined; // single use
      const pending = ctx.approvals.execute(claim.approvalId, claim.claimToken, action, targetId);
      ctx.execution = pending.then(() => undefined, () => undefined);
      const r = await pending;
      if (r.code !== 'ok') {
        ctx.refused = r.code;
        if (r.code === 'target_changed') return bad('Bảng đã thay đổi sau khi người dùng xem thẻ xác nhận. Chưa có gì bị xóa.');
        if (r.code === 'target_missing') return bad('Mục này đã bị xóa trước đó.');
        return bad('Không xóa được (mục có thể đã bị xóa hoặc phê duyệt không còn hiệu lực).');
      }
      const label = r.target_label ?? '';
      ctx.executed = { action, label };
      ctx.workspace.events.push({ kind: action === 'delete_task' ? 'task_deleted' : 'board_deleted', title: label, board: '' });
      return json({ ok: true, deleted: label });
    },
  });
}

export const deleteTools = [
  deletionTool('delete_task', 'task_id', 'Xóa một công việc theo id. Ứng dụng sẽ hỏi người dùng xác nhận trước khi xóa.'),
  deletionTool('delete_board', 'board_id', 'Xóa một bảng và toàn bộ công việc trong bảng theo id. Ứng dụng sẽ hỏi người dùng xác nhận trước khi xóa.'),
];

export const allTools = [...readTools, ...writeTools, ...deleteTools];
