/** Browser client for the AI assistant endpoints. Only the user's Supabase access token is sent. */
export type AgentEvent = {
  kind: 'task_created' | 'task_updated' | 'task_moved' | 'board_created' | 'task_deleted' | 'board_deleted';
  title: string;
  board: string;
  status?: string;
};

export type ApprovalView = {
  id: string;
  action: 'delete_task' | 'delete_board';
  target_id: string;
  target_label: string;
  detail: { board_name?: string; task_count?: number; status?: string };
  expires_at: string;
};

export type ChatReply = { reply: string; events: AgentEvent[]; changed: boolean; approval: ApprovalView | null };
export type DecisionReply = { status: 'executed' | 'rejected'; reply: string; events: AgentEvent[]; changed: boolean; approval?: ApprovalView | null };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export interface AssistantApi {
  chat(input: { message: string; history: ChatTurn[]; today: string }): Promise<ChatReply>;
  decide(approval: ApprovalView, decision: 'approve' | 'reject'): Promise<DecisionReply>;
}

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly events: AgentEvent[] = [],
    readonly changed = false,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

const NETWORK = 'Không kết nối được tới máy chủ. Kiểm tra mạng và thử lại.';
const GENERIC = 'Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại.';

export function createAssistantApi(getToken: () => Promise<string | null>, fetchImpl: typeof fetch = (...a) => fetch(...a)): AssistantApi {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const token = await getToken();
    if (!token) throw new AssistantError('Phiên đăng nhập đã hết. Hãy đăng nhập lại.', 401);
    let res: Response;
    try {
      res = await fetchImpl(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    } catch {
      throw new AssistantError(NETWORK, 0);
    }
    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    if (!res.ok) {
      throw new AssistantError(typeof data.error === 'string' ? data.error : GENERIC, res.status, (data.events as AgentEvent[]) ?? [], Boolean(data.changed));
    }
    return data as T;
  }
  return {
    chat: (input) => post<ChatReply>('/api/agent/chat', input),
    decide: (approval, decision) =>
      post<DecisionReply>('/api/agent/approval', { approval_id: approval.id, action: approval.action, target_id: approval.target_id, decision }),
  };
}
