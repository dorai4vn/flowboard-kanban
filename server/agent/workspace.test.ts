// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FakeRepository } from '../../src/data/fakeRepository.js';
import { createSeedState } from '../../src/domain/seed.js';
import { WorkspaceService } from './workspace.js';

const TODAY = '2026-11-21';
const NOW = new Date(2026, 10, 21, 9, 0);

async function setup() {
  const seed = createSeedState(NOW);
  const repo = new FakeRepository({ boards: seed.boards, boardOrder: seed.boardOrder });
  const ws = new WorkspaceService(repo, { today: TODAY, now: () => NOW, signal: new AbortController().signal });
  await ws.load();
  return { repo, ws, boardId: seed.boardOrder[0]! };
}

describe('WorkspaceService — read', () => {
  it('lists boards with progress and deadlines', async () => {
    const { ws, boardId } = await setup();
    expect(ws.listBoards()).toEqual([
      { id: boardId, name: 'Bảng của tôi', tasks: 5, todo: 3, doing: 1, done: 1, percent_done: 20, due_today: 1, overdue: 1 },
    ]);
  });

  it('searches tasks without diacritics and returns ids and status', async () => {
    const { ws } = await setup();
    const [hit, ...rest] = ws.searchTasks({ query: 'bao cao', board_id: null, include_done: true });
    expect(rest).toEqual([]);
    expect(hit).toMatchObject({ title: 'Viết báo cáo tuần', status: 'doing', status_label: 'Đang làm', priority: 'urgent', due_date: '2026-11-20' });
    expect(hit!.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('shows one board grouped by column', async () => {
    const { ws, boardId } = await setup();
    const b = ws.getBoard(boardId);
    expect(b.ok && b.board.columns.doing.map((t) => t.title)).toEqual(['Viết báo cáo tuần']);
    expect(ws.getBoard('00000000-0000-4000-8000-000000000000')).toEqual({ ok: false, error: 'Không tìm thấy bảng.' });
  });

  it('summarises today and overdue work across boards', async () => {
    const { ws } = await setup();
    expect(ws.focus('today').map((t) => t.title)).toEqual(['Hoàn thành bài tập buổi 8']);
    expect(ws.focus('overdue')).toEqual([expect.objectContaining({ title: 'Viết báo cáo tuần', days_late: 1 })]);
  });
});

describe('WorkspaceService — create and update (persisted)', () => {
  it('creates a task in the requested column and persists it', async () => {
    const { ws, repo, boardId } = await setup();
    const r = await ws.createTask({ board_id: boardId, title: '  Nộp đồ án  ', description: null, priority: 'high', due_date: '2026-11-25', status: 'doing' });
    expect(r).toMatchObject({ ok: true, task: { title: 'Nộp đồ án', status: 'doing', priority: 'high', due_date: '2026-11-25' } });
    expect(repo.persisted.map((m) => m.type)).toEqual(['createTask']);
    expect(ws.events).toEqual([{ kind: 'task_created', title: 'Nộp đồ án', board: 'Bảng của tôi' }]);
  });

  it('rejects invalid input with the domain message and writes nothing', async () => {
    const { ws, repo, boardId } = await setup();
    expect(await ws.createTask({ board_id: boardId, title: '   ', description: null, priority: null, due_date: null, status: null })).toEqual({
      ok: false,
      error: 'Vui lòng nhập tiêu đề',
    });
    expect(await ws.createTask({ board_id: '00000000-0000-4000-8000-000000000000', title: 'x', description: null, priority: null, due_date: null, status: null })).toEqual({
      ok: false,
      error: 'Không tìm thấy bảng.',
    });
    expect(repo.persisted).toEqual([]);
  });

  it('updates title, deadline and priority; clears a deadline with an empty value', async () => {
    const { ws, repo } = await setup();
    const id = ws.searchTasks({ query: 'Mua quà', board_id: null, include_done: true })[0]!.id;
    const r = await ws.updateTask({ task_id: id, title: 'Mua quà cho mẹ', description: null, priority: 'high', due_date: '2026-11-30', clear_due_date: false });
    expect(r).toMatchObject({ ok: true, task: { title: 'Mua quà cho mẹ', priority: 'high', due_date: '2026-11-30' } });
    const cleared = await ws.updateTask({ task_id: id, title: null, description: null, priority: null, due_date: null, clear_due_date: true });
    expect(cleared).toMatchObject({ ok: true, task: { due_date: null } });
    expect(repo.persisted.map((m) => m.type)).toEqual(['updateTask', 'updateTask']);
  });

  it('moves a task to done (completion) and back', async () => {
    const { ws, repo } = await setup();
    const id = ws.searchTasks({ query: 'Mua quà', board_id: null, include_done: true })[0]!.id;
    expect(await ws.moveTask({ task_id: id, status: 'done' })).toMatchObject({ ok: true, task: { status: 'done', completed: true } });
    expect(await ws.moveTask({ task_id: id, status: 'todo' })).toMatchObject({ ok: true, task: { status: 'todo', completed: false } });
    expect(repo.persisted.map((m) => m.type)).toEqual(['moveTask', 'moveTask']);
  });

  it('creates a board', async () => {
    const { ws, repo } = await setup();
    expect(await ws.createBoard({ name: 'Đồ án' })).toMatchObject({ ok: true, board: { name: 'Đồ án' } });
    expect(ws.listBoards().map((b) => b.name)).toEqual(['Bảng của tôi', 'Đồ án']);
    expect(repo.persisted.map((m) => m.type)).toEqual(['createBoard']);
  });

  it('reports a failed save truthfully and keeps the previous data', async () => {
    const { ws, repo } = await setup();
    repo.failWhen = () => true;
    const id = ws.searchTasks({ query: 'Mua quà', board_id: null, include_done: true })[0]!.id;
    expect(await ws.updateTask({ task_id: id, title: 'Đổi', description: null, priority: null, due_date: null, clear_due_date: false })).toEqual({
      ok: false,
      error: 'Không lưu được thay đổi vào cơ sở dữ liệu.',
    });
    expect(ws.searchTasks({ query: 'Mua quà', board_id: null, include_done: true })[0]!.title).toBe('Mua quà sinh nhật');
    expect(ws.events).toEqual([]);
  });

  it('describes a task for approval without deleting anything', async () => {
    const { ws, repo } = await setup();
    const id = ws.searchTasks({ query: 'Mua quà', board_id: null, include_done: true })[0]!.id;
    expect(ws.findTask(id)).toMatchObject({ title: 'Mua quà sinh nhật', board_name: 'Bảng của tôi' });
    expect(repo.persisted).toEqual([]);
  });
});
