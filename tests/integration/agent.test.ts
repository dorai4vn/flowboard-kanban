import { beforeAll, describe, expect, it } from 'vitest';
import { SupabaseRepository } from '../../src/data/supabaseRepository';
import { createSeedState } from '../../src/domain/seed';
import { handleApproval, handleChat, type HandlerDeps } from '../../server/agent/handlers';
import { productionDeps } from '../../server/agent/productionDeps';
import { withinRateLimit } from '../../server/agent/supabaseServer';
import { call, lastToolResult, say, ScriptedModel, type Step } from '../../server/agent/testing/scriptedModel';
import type { FlowboardClient } from '../../src/lib/supabase';
import { localStatus, publicKey, signedInClient } from '../support/localSupabase';

// Real Supabase Local: real JWT validation, RLS, RPCs and Postgres locking. Only the model is scripted.

type User = { client: FlowboardClient; token: string; repo: SupabaseRepository };
let A: User;
let B: User;
const TODAY = new Date().toISOString().slice(0, 10);

async function user(label: string): Promise<User> {
  const { client } = await signedInClient(label);
  const { data } = await client.auth.getSession();
  const repo = new SupabaseRepository(client);
  const seed = createSeedState(new Date());
  await repo.ensureStarter(seed.boards[seed.boardOrder[0]!]!, new AbortController().signal);
  return { client, token: data.session!.access_token, repo };
}

function deps(model: ScriptedModel): HandlerDeps {
  const env = { SUPABASE_URL: localStatus().API_URL, SUPABASE_PUBLISHABLE_KEY: publicKey(), OPENAI_API_KEY: 'unused-in-scripted-tests', AGENT_STATE_SECRET: 'integration-secret' };
  return { ...productionDeps(env), model };
}

const req = (path: string, token: string, body: unknown) =>
  new Request(`http://local${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const chat = (u: User, model: ScriptedModel, message: string) => handleChat(req('/api/agent/chat', u.token, { message, history: [], today: TODAY }), deps(model));

async function tasksOf(u: User) {
  const s = await u.repo.load(new AbortController().signal);
  return Object.values(s.boards).flatMap((b) => Object.entries(b.columns).flatMap(([col, ids]) => ids.map((id) => ({ ...b.tasks[id]!, col, boardId: b.id }))));
}
const findThen = (query: string, then: (id: string) => ReturnType<typeof call>): Step[] => [
  () => [call('search_tasks', { query, board_id: null, include_done: true })],
  (input) => [then((lastToolResult(input)!.value as { tasks: { id: string }[] }).tasks[0]!.id)],
];

beforeAll(async () => {
  A = await user('agent-a');
  B = await user('agent-b');
});

describe('AI agent on Supabase Local (real auth, RLS, approvals)', () => {
  it('rejects missing or forged tokens with 401', async () => {
    const model = new ScriptedModel([]);
    expect((await handleChat(req('/api/agent/chat', 'not-a-real-token-xxxxxxxxxxxxxxxxx', { message: 'hi', history: [], today: TODAY }), deps(model))).status).toBe(401);
    const forged = A.token.slice(0, -4) + 'abcd';
    expect((await handleChat(req('/api/agent/chat', forged, { message: 'hi', history: [], today: TODAY }), deps(model))).status).toBe(401);
    expect(model.requests).toHaveLength(0);
  });

  it('CREATE: a task created by the agent is stored in Postgres', async () => {
    const boardId = (await A.repo.load(new AbortController().signal)).boardOrder[0]!;
    const model = new ScriptedModel([
      () => [call('create_task', { board_id: boardId, title: 'Agent tạo việc', description: 'từ trợ lý', priority: 'high', due_date: '2026-12-01', status: 'doing' })],
      () => [say('Đã tạo.')],
    ]);
    const body = await (await chat(A, model, 'tạo')).json();
    expect(body.events).toEqual([expect.objectContaining({ kind: 'task_created', title: 'Agent tạo việc' })]);
    expect(await tasksOf(A)).toContainEqual(expect.objectContaining({ title: 'Agent tạo việc', col: 'doing', priority: 'high', dueDate: '2026-12-01' }));
  });

  it('READ + UPDATE: the agent finds a task and edits title, deadline and completion in Postgres', async () => {
    const model = new ScriptedModel([
      ...findThen('Agent tạo việc', (id) => call('update_task', { task_id: id, title: 'Agent đã sửa', description: null, priority: null, due_date: '2026-12-05', clear_due_date: false })),
      ...findThen('Agent đã sửa', (id) => call('move_task', { task_id: id, status: 'done' })),
      () => [say('Xong.')],
    ]);
    expect((await chat(A, model, 'sửa')).status).toBe(200);
    expect(await tasksOf(A)).toContainEqual(expect.objectContaining({ title: 'Agent đã sửa', dueDate: '2026-12-05', col: 'done' }));
  });

  it('ISOLATION: user B can neither see nor write user A data through the agent', async () => {
    const aBoard = (await A.repo.load(new AbortController().signal)).boardOrder[0]!;
    const seen: unknown[] = [];
    const model = new ScriptedModel([
      () => [call('search_tasks', { query: 'Agent đã sửa', board_id: null, include_done: true })],
      (input) => {
        seen.push(lastToolResult(input)!.value);
        return [call('create_task', { board_id: aBoard, title: 'B chen vào A', description: null, priority: null, due_date: null, status: null })];
      },
      (input) => {
        seen.push(lastToolResult(input)!.value);
        return [say('xong')];
      },
    ]);
    await chat(B, model, 'thử');
    expect(seen[0]).toEqual({ ok: true, tasks: [] });
    expect(seen[1]).toEqual({ ok: false, error: 'Không tìm thấy bảng.' });
    expect((await tasksOf(A)).map((t) => t.title)).not.toContain('B chen vào A');
  });

  it('DELETE: requires approval; approval executes once; replay, other account and tampering are rejected', async () => {
    const victim = (await tasksOf(A)).find((t) => t.title === 'Mua quà sinh nhật')!;
    const model = new ScriptedModel([
      ...findThen('Mua quà', (id) => call('delete_task', { task_id: id })),
      () => [say('Đã xóa.')],
    ]);
    const first = await (await chat(A, model, 'xóa mua quà')).json();
    expect(first.approval).toMatchObject({ action: 'delete_task', target_id: victim.id, target_label: 'Mua quà sinh nhật' });
    expect((await tasksOf(A)).map((t) => t.id)).toContain(victim.id);

    const { data: rows } = await A.client.from('agent_approvals').select('status').eq('id', first.approval.id);
    expect(rows).toEqual([{ status: 'pending' }]);

    const decide = (u: User, over: Record<string, unknown> = {}) =>
      handleApproval(req('/api/agent/approval', u.token, { approval_id: first.approval.id, action: 'delete_task', target_id: victim.id, decision: 'approve', ...over }), deps(model));
    expect((await decide(B)).status).toBe(404);
    expect((await decide(A, { target_id: (await tasksOf(A)).find((t) => t.id !== victim.id)!.id })).status).toBe(422);
    expect((await tasksOf(A)).map((t) => t.id)).toContain(victim.id);

    const ok = await decide(A);
    expect(ok.status).toBe(200);
    expect((await tasksOf(A)).map((t) => t.id)).not.toContain(victim.id);
    expect((await decide(A)).status).toBe(409);
  });

  it('CONCURRENCY: parallel approvals of one request delete exactly once', async () => {
    const target = (await tasksOf(A)).find((t) => t.title === 'Đọc tài liệu về AI Agent')!;
    const model = new ScriptedModel(() => [call('delete_task', { task_id: target.id })]);
    const first = await (await chat(A, model, 'xóa')).json();
    const finish = new ScriptedModel(() => [say('Đã xóa.')]);
    const body = { approval_id: first.approval.id, action: 'delete_task', target_id: target.id, decision: 'approve' };
    const results = await Promise.all(Array.from({ length: 5 }, () => handleApproval(req('/api/agent/approval', A.token, body), deps(finish))));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
    const { data } = await A.client.from('agent_approvals').select('status').eq('id', first.approval.id);
    expect(data).toEqual([{ status: 'executed' }]);
  });

  it('RATE LIMIT: the per-user request log caps requests and cannot be erased by the user', async () => {
    const count = async () => (await B.client.from('agent_requests').select('id', { count: 'exact', head: true })).count ?? 0;
    const base = await count();
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await withinRateLimit(B.client, base + 3, 10));
    expect(results).toEqual([true, true, true, false]);
    await B.client.from('agent_requests').delete().gte('created_at', '2000-01-01');
    expect(await count()).toBe(base + 4);
    const { data: others } = await B.client.from('agent_requests').select('user_id');
    expect(new Set(others!.map((r) => r.user_id)).size).toBe(1);
  });
});
