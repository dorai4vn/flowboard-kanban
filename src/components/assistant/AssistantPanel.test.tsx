import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantError, type ApprovalView, type AssistantApi, type ChatReply, type DecisionReply } from '../../assistant/api';
import { applyMutation } from '../../data/mutations';
import { createTask } from '../../domain/task';
import { renderApp, seededRepository } from '../../test/renderApp';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};

function fakeApi(chat: AssistantApi['chat'], decide: AssistantApi['decide'] = vi.fn()): AssistantApi & { chat: ReturnType<typeof vi.fn>; decide: ReturnType<typeof vi.fn> } {
  return { chat: vi.fn(chat), decide: vi.fn(decide) } as never;
}
const reply = (over: Partial<ChatReply> = {}): ChatReply => ({ reply: 'Xin chào', events: [], changed: false, approval: null, ...over });

async function open(api: AssistantApi, repo = seededRepository()) {
  const r = await renderApp(repo, { assistant: api });
  await r.user.click(screen.getByRole('button', { name: 'Trợ lý AI' }));
  return { ...r, panel: screen.getByRole('complementary', { name: 'Trợ lý AI' }) };
}

describe('AI assistant panel', () => {
  it('is not shown when the app has no assistant', async () => {
    await renderApp();
    expect(screen.queryByRole('button', { name: 'Trợ lý AI' })).not.toBeInTheDocument();
  });

  it('opens with suggestions; a suggestion is sent with today and an empty history', async () => {
    const api = fakeApi(async () => reply({ reply: 'Có 1 việc quá hạn: **Viết báo cáo tuần**.' }));
    const { user, panel } = await open(api);
    expect(within(panel).getByText('Thao tác thật trên dữ liệu của bạn. Xóa luôn cần bạn xác nhận.')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Việc nào đang quá hạn?' }));
    expect(api.chat).toHaveBeenCalledWith({ message: 'Việc nào đang quá hạn?', history: [], today: '2026-11-21' });
    expect(within(panel).getByText('Có 1 việc quá hạn: Viết báo cáo tuần.')).toBeInTheDocument();
  });

  it('shows progress while waiting and blocks a second send', async () => {
    const d = deferred<ChatReply>();
    const api = fakeApi(() => d.promise);
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'Tóm tắt hôm nay{Enter}');
    expect(within(panel).getByText('Trợ lý đang xử lý…')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Gửi' })).toBeDisabled();
    await act(async () => d.resolve(reply({ reply: 'Hôm nay có 1 việc.' })));
    expect(within(panel).queryByText('Trợ lý đang xử lý…')).not.toBeInTheDocument();
    expect(within(panel).getByText('Hôm nay có 1 việc.')).toBeInTheDocument();
  });

  it('confirmed changes are listed and the board refreshes from the server', async () => {
    const repo = seededRepository();
    const api = fakeApi(async () => {
      const board = repo.state.boards[repo.state.boardOrder[0]!]!;
      const r = createTask(board, { title: 'Việc do AI tạo' }, 'todo', new Date().toISOString());
      if (!r.ok) throw new Error();
      repo.state = applyMutation(repo.state, { type: 'createTask', boardId: board.id, task: r.value.task, column: 'todo' });
      return reply({ reply: 'Đã tạo.', events: [{ kind: 'task_created', title: 'Việc do AI tạo', board: 'Bảng của tôi' }], changed: true });
    });
    const { user, panel } = await open(api, repo);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'tạo việc{Enter}');
    expect(within(panel).getByText('Đã tạo “Việc do AI tạo” trong Bảng của tôi')).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: 'Cần làm' })).findByText('Việc do AI tạo')).toBeInTheDocument();
  });

  it('errors are shown in Vietnamese with a working retry', async () => {
    let n = 0;
    const api = fakeApi(async () => {
      if (n++ === 0) throw new AssistantError('Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại.', 502);
      return reply({ reply: 'Lần này được rồi.' });
    });
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'xin chào{Enter}');
    expect(within(panel).getByRole('alert')).toHaveTextContent('Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại.');
    await user.click(within(panel).getByRole('button', { name: 'Thử lại' }));
    expect(api.chat).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'xin chào' }));
    expect(within(panel).getByText('Lần này được rồi.')).toBeInTheDocument();
  });

  it('sends the previous turns as history', async () => {
    const api = fakeApi(async ({ message }) => reply({ reply: `trả lời ${message}` }));
    const { user, panel } = await open(api);
    const box = within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' });
    await user.type(box, 'một{Enter}');
    await user.type(box, 'hai{Enter}');
    expect(api.chat).toHaveBeenLastCalledWith({
      message: 'hai',
      history: [
        { role: 'user', content: 'một' },
        { role: 'assistant', content: 'trả lời một' },
      ],
      today: '2026-11-21',
    });
  });
});

describe('deletion approval card', () => {
  const approval: ApprovalView = {
    id: '11111111-1111-4111-8111-111111111111',
    action: 'delete_task',
    target_id: '22222222-2222-4222-8222-222222222222',
    target_label: 'Mua quà sinh nhật',
    detail: { board_name: 'Bảng của tôi' },
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };
  const asking = () => reply({ reply: 'Bạn cần xác nhận trước khi mình xóa công việc “Mua quà sinh nhật”.', approval });

  it('shows the exact target and consequences, and approves with the exact parameters', async () => {
    const api = fakeApi(async () => asking(), async (): Promise<DecisionReply> => ({ status: 'executed', reply: 'Đã xóa công việc “Mua quà sinh nhật”.', events: [{ kind: 'task_deleted', title: 'Mua quà sinh nhật', board: '' }], changed: true }));
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'xóa mua quà{Enter}');
    const card = within(panel).getByRole('group', { name: 'Xác nhận xóa' });
    expect(card).toHaveTextContent('Xóa công việc “Mua quà sinh nhật”');
    expect(card).toHaveTextContent('trong bảng “Bảng của tôi”');
    expect(card).toHaveTextContent('Không thể hoàn tác');
    await user.click(within(card).getByRole('button', { name: 'Xóa' }));
    expect(api.decide).toHaveBeenCalledWith(approval, 'approve');
    expect(card).toHaveTextContent('Đã xóa');
    expect(within(card).queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
    expect(within(panel).getByText('Đã xóa công việc “Mua quà sinh nhật”.')).toBeInTheDocument();
  });

  it('“Không xóa” rejects; nothing else is sent', async () => {
    const api = fakeApi(async () => asking(), async (): Promise<DecisionReply> => ({ status: 'rejected', reply: 'Đã hủy. Không có gì bị xóa.', events: [], changed: false }));
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'xóa{Enter}');
    await user.click(within(panel).getByRole('button', { name: 'Không xóa' }));
    expect(api.decide).toHaveBeenCalledWith(approval, 'reject');
    expect(within(panel).getByRole('group', { name: 'Xác nhận xóa' })).toHaveTextContent('Đã hủy');
  });

  it('a board deletion explains how many tasks go with it', async () => {
    const boardApproval: ApprovalView = { ...approval, action: 'delete_board', target_label: 'Đồ án', detail: { task_count: 7 } };
    const api = fakeApi(async () => reply({ reply: 'Cần xác nhận', approval: boardApproval }));
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'xóa bảng{Enter}');
    expect(within(panel).getByRole('group', { name: 'Xác nhận xóa' })).toHaveTextContent('Xóa bảng “Đồ án” cùng 7 công việc');
  });

  it('an expired or invalid approval shows the server message and cannot be retried', async () => {
    const api = fakeApi(async () => asking(), async () => {
      throw new AssistantError('Yêu cầu xác nhận đã hết hạn. Hãy nhờ Trợ lý AI tạo lại.', 410);
    });
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'xóa{Enter}');
    await user.click(within(panel).getByRole('button', { name: 'Xóa' }));
    const card = within(panel).getByRole('group', { name: 'Xác nhận xóa' });
    expect(card).toHaveTextContent('Yêu cầu xác nhận đã hết hạn. Hãy nhờ Trợ lý AI tạo lại.');
    expect(within(card).queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
  });
});

describe('panel behaviour', () => {
  it('closes with the close button and with Escape; history survives reopening', async () => {
    const api = fakeApi(async () => reply({ reply: 'Đã nhớ' }));
    const { user, panel } = await open(api);
    await user.type(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' }), 'nhớ nhé{Enter}');
    await user.click(within(panel).getByRole('button', { name: 'Đóng Trợ lý AI' }));
    expect(screen.queryByRole('complementary', { name: 'Trợ lý AI' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trợ lý AI' }));
    expect(screen.getByText('Đã nhớ')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Trợ lý AI' })).not.toBeInTheDocument();
  });

  it('is read-only while offline', async () => {
    const api = fakeApi(async () => reply());
    const { panel } = await open(api);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(within(panel).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' })).toBeDisabled();
    expect(within(panel).getByText('Mất kết nối: Trợ lý AI tạm dừng.')).toBeInTheDocument();
  });
});
