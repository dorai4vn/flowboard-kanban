import { useCallback, useRef, useState } from 'react';
import { AssistantError, type AgentEvent, type ApprovalView, type AssistantApi, type ChatTurn } from './api';

export type ApprovalState = 'pending' | 'working' | 'approved' | 'rejected' | 'failed';
export type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; text: string; events: AgentEvent[] }
  | { id: number; role: 'error'; text: string; retry: string; events: AgentEvent[] }
  | { id: number; role: 'approval'; approval: ApprovalView; state: ApprovalState; note?: string };

const MAX_HISTORY = 24;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Models sometimes answer in Markdown; the chat renders plain text. */
export const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1');

/** Chat state for the current session (kept while the panel is closed; gone on sign-out/reload). */
export function useAssistant(api: AssistantApi, today: string, onChanged: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const next = () => ++seq.current;
  const add = (m: DistributiveOmit<ChatMessage, 'id'>) => setMessages((ms) => [...ms, { ...m, id: next() } as ChatMessage]);

  const history = (ms: ChatMessage[]): ChatTurn[] =>
    ms
      .flatMap((m): ChatTurn[] => (m.role === 'user' ? [{ role: 'user', content: m.text }] : m.role === 'assistant' ? [{ role: 'assistant', content: m.text }] : []))
      .slice(-MAX_HISTORY);

  const send = useCallback(
    async (raw: string, isRetry = false) => {
      const text = raw.trim();
      if (!text || busy) return;
      let past: ChatTurn[] = [];
      setMessages((ms) => {
        const withoutError = isRetry ? ms.filter((m) => !(m.role === 'error' && m.retry === text)) : ms;
        past = history(isRetry ? withoutError.slice(0, -1) : withoutError);
        return isRetry ? withoutError : [...withoutError, { id: next(), role: 'user', text }];
      });
      setBusy(true);
      try {
        const r = await api.chat({ message: text, history: past, today });
        add({ role: 'assistant', text: plain(r.reply), events: r.events });
        if (r.approval) add({ role: 'approval', approval: r.approval, state: 'pending' });
        if (r.changed) onChanged();
      } catch (err) {
        const e = err instanceof AssistantError ? err : new AssistantError('Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại.', 0);
        add({ role: 'error', text: e.message, retry: text, events: e.events });
        if (e.changed) onChanged();
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, busy, today, onChanged],
  );

  const decide = useCallback(
    async (messageId: number, decision: 'approve' | 'reject') => {
      const target = messages.find((m) => m.id === messageId);
      if (!target || target.role !== 'approval' || target.state !== 'pending' || busy) return;
      const patch = (state: ApprovalState, note?: string) =>
        setMessages((ms) => ms.map((m) => (m.id === messageId && m.role === 'approval' ? { ...m, state, note } : m)));
      patch('working');
      setBusy(true);
      try {
        const r = await api.decide(target.approval, decision);
        patch(r.status === 'executed' ? 'approved' : 'rejected');
        add({ role: 'assistant', text: plain(r.reply), events: r.events });
        if (r.approval) add({ role: 'approval', approval: r.approval, state: 'pending' });
        if (r.changed) onChanged();
      } catch (err) {
        patch('failed', err instanceof AssistantError ? err.message : 'Không xử lý được yêu cầu xác nhận.');
        if (err instanceof AssistantError && err.changed) onChanged();
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, busy, messages, onChanged],
  );

  return { messages, busy, send, decide };
}
