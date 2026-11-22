import { MaxTurnsExceededError, Runner, RunContext, RunState, type AgentInputItem, type Model, type RunResult } from '@openai/agents';
import { z } from 'zod';
import type { BoardRepository } from '../../src/data/repository.js';
import { daysBetween, toLocalDateKey } from '../../src/domain/dates.js';
import { createAgent } from './agent.js';
import { ApprovalError, type ApprovalAction, type ApprovalStore, type ApprovalView } from './approvals.js';
import { LIMITS, type ServerConfig } from './config.js';
import { signRunState, verifyRunState } from './runStateMac.js';
import type { AgentContext } from './tools.js';
import { WorkspaceService, type WorkspaceEvent } from './workspace.js';

/** Everything that depends on the signed-in user, resolved server-side from the access token. */
export type Session = {
  userId: string;
  repo: BoardRepository;
  approvals: ApprovalStore;
  checkRateLimit(): Promise<boolean>;
};

export type HandlerDeps = {
  config: ServerConfig | { missing: string[] };
  authenticate(authorization: string | null): Promise<Session | null>;
  model: string | Model;
  now(): Date;
  limits?: Partial<Record<keyof typeof LIMITS, number>>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['delete_task', 'delete_board'] as const;

const chatBody = z.object({
  message: z.string().trim().min(1).max(LIMITS.messageChars),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(LIMITS.historyChars) }))
    .max(LIMITS.historyTurns * 2)
    .default([]),
  today: z.string().regex(DATE),
});

const approvalBody = z.object({
  approval_id: z.string().regex(UUID),
  action: z.enum(ACTIONS),
  target_id: z.string().regex(UUID),
  decision: z.enum(['approve', 'reject']),
});

const MSG = {
  unauthenticated: 'Bạn cần đăng nhập để dùng Trợ lý AI.',
  invalid: 'Yêu cầu không hợp lệ.',
  notConfigured: 'Trợ lý AI chưa được cấu hình trên máy chủ.',
  rateLimited: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
  dataUnavailable: 'Không tải được dữ liệu của bạn. Vui lòng thử lại.',
  provider: 'Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại.',
  timeout: 'Trợ lý AI phản hồi quá lâu. Vui lòng thử lại.',
  maxTurns: 'Yêu cầu này cần quá nhiều bước. Hãy chia nhỏ yêu cầu và thử lại.',
  notFound: 'Không tìm thấy yêu cầu xác nhận này.',
  decided: 'Yêu cầu xác nhận này đã được xử lý trước đó.',
  expired: 'Yêu cầu xác nhận đã hết hạn. Hãy nhờ Trợ lý AI tạo lại.',
  mismatch: 'Thông tin xác nhận không khớp với yêu cầu ban đầu. Không có gì bị xóa.',
  notDeleted: 'Chưa xóa được. Vui lòng thử lại.',
  targetChanged: 'Bảng đã thay đổi kể từ lúc bạn xem thẻ xác nhận (có công việc được thêm hoặc bớt). Chưa có gì bị xóa — hãy nhờ Trợ lý AI tạo yêu cầu mới.',
  tooLarge: 'Yêu cầu quá lớn.',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

class TimeoutError extends Error {}

type Prepared = { session: Session; config: ServerConfig } | Response;

async function prepare(request: Request, deps: HandlerDeps): Promise<Prepared> {
  if (request.method !== 'POST') return json(405, { error: MSG.invalid });
  if ('missing' in deps.config) {
    // variable names go to the server log only, never to (possibly anonymous) callers
    console.error('[agent] missing server configuration:', deps.config.missing.join(', '));
    return json(503, { error: MSG.notConfigured });
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return json(413, { error: MSG.tooLarge });
  const session = await deps.authenticate(request.headers.get('authorization'));
  if (!session) return json(401, { error: MSG.unauthenticated });
  return { session, config: deps.config };
}

const MAX_BODY_BYTES = 64 * 1024;
const TOO_LARGE = Symbol('too large');

/** Reads at most MAX_BODY_BYTES (content-length can be absent or wrong with chunked bodies). */
async function readJson(request: Request): Promise<unknown> {
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return TOO_LARGE;
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return null;
  }
}

async function rateLimited(session: Session): Promise<Response | null> {
  try {
    return (await session.checkRateLimit()) ? null : json(429, { error: MSG.rateLimited });
  } catch {
    return json(503, { error: MSG.dataUnavailable });
  }
}

/** The client's local day is trusted only within one day of the server clock. */
function effectiveToday(clientToday: string, now: Date): string {
  const server = toLocalDateKey(now);
  return Math.abs(daysBetween(server, clientToday)) <= 1 ? clientToday : server;
}

function summary(events: WorkspaceEvent[]) {
  return { events, changed: events.length > 0 };
}

async function runWithTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function failure(err: unknown, events: WorkspaceEvent[]): Response {
  if (err instanceof TimeoutError) return json(504, { error: MSG.timeout, ...summary(events) });
  return json(502, { error: MSG.provider, ...summary(events) });
}

/** Convert an SDK interruption (deletion tool call) into a server-side approval record. */
async function createApproval(
  result: RunResult<AgentContext, never>,
  session: Session,
  config: ServerConfig,
): Promise<{ approval: ApprovalView | null; reply: string }> {
  const [item, ...more] = result.interruptions;
  if (!item || more.length > 0) return { approval: null, reply: 'Mỗi lần mình chỉ xóa được một mục. Hãy chọn một mục cần xóa.' };
  const action = item.name as ApprovalAction;
  if (!ACTIONS.includes(action)) return { approval: null, reply: 'Thao tác này không được hỗ trợ.' };
  let targetId: string;
  try {
    const args = JSON.parse(item.arguments ?? '{}') as Record<string, unknown>;
    targetId = String(action === 'delete_task' ? args.task_id : args.board_id);
  } catch {
    targetId = '';
  }
  if (!UUID.test(targetId)) return { approval: null, reply: 'Mình chưa xác định được mục cần xóa. Bạn mô tả rõ hơn nhé.' };
  const runState = result.state.toString();
  try {
    const approval = await session.approvals.create(action, targetId, runState, signRunState(config.stateSecret, session.userId, action, targetId, runState));
    const what = action === 'delete_task' ? 'công việc' : 'bảng';
    return { approval, reply: `Bạn cần xác nhận trước khi mình xóa ${what} “${approval.target_label}”.` };
  } catch (err) {
    const reason = err instanceof ApprovalError ? err.reason : String((err as Error)?.message);
    if (reason === 'target_not_found') return { approval: null, reply: 'Không tìm thấy mục cần xóa trong dữ liệu của bạn.' };
    if (reason === 'too_many_pending') return { approval: null, reply: 'Bạn đã tạo quá nhiều yêu cầu xóa trong thời gian ngắn. Hãy xử lý các yêu cầu đang chờ hoặc thử lại sau.' };
    if (reason === 'too_large') return { approval: null, reply: 'Cuộc trò chuyện này quá dài để lưu yêu cầu xóa. Hãy mở cuộc trò chuyện mới rồi yêu cầu xóa lại.' };
    throw err;
  }
}

function newContext(session: Session, today: string, now: () => Date, signal: AbortSignal) {
  const workspace = new WorkspaceService(session.repo, { today, now, signal });
  const ctx: AgentContext = { workspace, approvals: session.approvals, today, toJSON: () => ({ today }) };
  return ctx;
}

// ============================================================================ POST /api/agent/chat
export async function handleChat(request: Request, deps: HandlerDeps): Promise<Response> {
  const prep = await prepare(request, deps);
  if (prep instanceof Response) return prep;
  const { session, config } = prep;
  const raw = await readJson(request);
  if (raw === TOO_LARGE) return json(413, { error: MSG.tooLarge });
  const parsed = chatBody.safeParse(raw);
  if (!parsed.success) return json(400, { error: MSG.invalid });
  const limited = await rateLimited(session);
  if (limited) return limited;

  const limits = { ...LIMITS, ...deps.limits };
  const controller = new AbortController();
  const ctx = newContext(session, effectiveToday(parsed.data.today, deps.now()), deps.now, controller.signal);
  try {
    await ctx.workspace.load();
  } catch {
    return json(503, { error: MSG.dataUnavailable });
  }

  const input: AgentInputItem[] = [
    ...parsed.data.history.map((h): AgentInputItem =>
      h.role === 'user'
        ? { role: 'user', content: h.content }
        : { role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: h.content }] },
    ),
    { role: 'user', content: parsed.data.message },
  ];

  const agent = createAgent(deps.model);
  const runner = new Runner({ tracingDisabled: true });
  try {
    const result = await runWithTimeout(
      (signal) => runner.run(agent, input, { context: ctx, maxTurns: limits.maxTurns, signal }),
      limits.runTimeoutMs,
      controller,
    );
    if (result.interruptions.length > 0) {
      const { approval, reply } = await createApproval(result as RunResult<AgentContext, never>, session, config);
      return json(200, { reply, ...summary(ctx.workspace.events), approval });
    }
    return json(200, { reply: String(result.finalOutput ?? ''), ...summary(ctx.workspace.events), approval: null });
  } catch (err) {
    if (err instanceof MaxTurnsExceededError) return json(200, { reply: MSG.maxTurns, ...summary(ctx.workspace.events), approval: null });
    return failure(err, ctx.workspace.events);
  }
}

// ============================================================================ POST /api/agent/approval
export async function handleApproval(request: Request, deps: HandlerDeps): Promise<Response> {
  const prep = await prepare(request, deps);
  if (prep instanceof Response) return prep;
  const { session, config } = prep;
  const raw = await readJson(request);
  if (raw === TOO_LARGE) return json(413, { error: MSG.tooLarge });
  const parsed = approvalBody.safeParse(raw);
  if (!parsed.success) return json(400, { error: MSG.invalid });
  const { approval_id, action, target_id, decision } = parsed.data;

  const limited = await rateLimited(session);
  if (limited) return limited;

  if (decision === 'reject') {
    const r = await session.approvals.reject(approval_id, action, target_id).catch(() => ({ code: 'failed' }));
    if (r.code === 'ok') return json(200, { status: 'rejected', reply: 'Đã hủy. Không có gì bị xóa.', events: [], changed: false });
    return codeResponse(r.code);
  }

  const limits = { ...LIMITS, ...deps.limits };
  const controller = new AbortController();
  // the approval's own date context is not critical for deletion; use the server day
  const ctx = newContext(session, toLocalDateKey(deps.now()), deps.now, controller.signal);
  try {
    await ctx.workspace.load();
  } catch {
    return json(503, { error: MSG.dataUnavailable });
  }

  // 1. Atomic claim in Postgres: owner, pending, not expired, exact parameters. Only one caller can win.
  const claim = await session.approvals.claim(approval_id, action, target_id).catch(() => ({ code: 'failed' as const }));
  if (claim.code !== 'ok') return codeResponse(claim.code);

  // 2. The stored run state must be the one this server produced for this user.
  if (!verifyRunState(config.stateSecret, session.userId, action, target_id, claim.run_state, claim.run_state_mac)) return json(422, { error: MSG.mismatch });
  const agent = createAgent(deps.model);
  let state: RunState<AgentContext, typeof agent>;
  try {
    // replace the (minimal) serialized context with this request's live, user-scoped context
    state = await RunState.fromStringWithContext(agent, claim.run_state, new RunContext(ctx), { contextStrategy: 'replace' });
  } catch {
    return json(422, { error: MSG.mismatch });
  }
  const pending = state.getInterruptions();
  const item = pending[0];
  let argsTarget: string;
  try {
    const args = JSON.parse(item?.arguments ?? '{}') as Record<string, unknown>;
    argsTarget = String(action === 'delete_task' ? args.task_id : args.board_id);
  } catch {
    argsTarget = '';
  }
  if (pending.length !== 1 || !item || item.name !== action || argsTarget !== target_id) return json(422, { error: MSG.mismatch });

  // 3. Approve the SDK interruption and resume; the tool executes only with this single-use claim.
  state.approve(item);
  ctx.claim = { approvalId: approval_id, claimToken: claim.claim_token, action, targetId: target_id };
  const runner = new Runner({ tracingDisabled: true });
  const fallbackReply = () => `Đã xóa ${action === 'delete_task' ? 'công việc' : 'bảng'} “${ctx.executed?.label ?? claim.target_label}”.`;
  try {
    const result = await runWithTimeout(
      (signal) => runner.run(agent, state, { context: ctx, maxTurns: limits.maxTurns, signal }),
      limits.runTimeoutMs,
      controller,
    );
    if (!ctx.executed) return notExecuted(ctx);
    if (result.interruptions.length > 0) {
      const next = await createApproval(result as RunResult<AgentContext, never>, session, config);
      return json(200, { status: 'executed', reply: `${fallbackReply()} ${next.reply}`, ...summary(ctx.workspace.events), approval: next.approval });
    }
    return json(200, { status: 'executed', reply: String(result.finalOutput || fallbackReply()), ...summary(ctx.workspace.events), approval: null });
  } catch (err) {
    // A timeout must not race an in-flight deletion: wait for the RPC to settle before answering.
    if (ctx.execution) await ctx.execution;
    // The deletion is the source of truth: if it happened, say so even when the model failed afterwards.
    if (ctx.executed) return json(200, { status: 'executed', reply: fallbackReply(), ...summary(ctx.workspace.events), approval: null });
    if (ctx.refused || err instanceof MaxTurnsExceededError) return notExecuted(ctx);
    return failure(err, ctx.workspace.events);
  }
}

function notExecuted(ctx: AgentContext): Response {
  if (ctx.refused === 'target_changed') return json(409, { error: MSG.targetChanged, ...summary(ctx.workspace.events) });
  return json(500, { error: MSG.notDeleted, ...summary(ctx.workspace.events) });
}

function codeResponse(code: string): Response {
  switch (code) {
    case 'not_found':
      return json(404, { error: MSG.notFound });
    case 'already_decided':
      return json(409, { error: MSG.decided });
    case 'expired':
      return json(410, { error: MSG.expired });
    case 'mismatch':
      return json(422, { error: MSG.mismatch });
    default:
      return json(503, { error: MSG.dataUnavailable });
  }
}
