import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, CircleCheck, RotateCcw, Sparkles, Trash2, WifiOff, X } from 'lucide-react';
import type { AgentEvent } from '../../assistant/api';
import type { ChatMessage } from '../../assistant/useAssistant';
import { ApprovalCard } from './ApprovalCard';

const SUGGESTIONS = [
  'Việc nào đang quá hạn?',
  'Tóm tắt việc hôm nay',
  'Tạo công việc “Ôn tập chương 4” hạn ngày mai',
  'Đánh dấu hoàn thành “Viết báo cáo tuần”',
];

function eventText(e: AgentEvent): string {
  switch (e.kind) {
    case 'task_created':
      return `Đã tạo “${e.title}” trong ${e.board}`;
    case 'task_updated':
      return `Đã cập nhật “${e.title}”`;
    case 'task_moved':
      return `Đã chuyển “${e.title}” sang ${e.status ?? ''}`.trim();
    case 'board_created':
      return `Đã tạo bảng “${e.title}”`;
    case 'task_deleted':
      return `Đã xóa công việc “${e.title}”`;
    case 'board_deleted':
      return `Đã xóa bảng “${e.title}”`;
  }
}

function Events({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1" aria-label="Thay đổi đã lưu">
      {events.map((e, i) => (
        <li key={i} className="inline-flex items-start gap-1.5 text-xs font-medium text-done">
          {e.kind.endsWith('deleted') ? <Trash2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> : <CircleCheck size={13} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span className="break-words">{eventText(e)}</span>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  online: boolean;
  onSend: (text: string, isRetry?: boolean) => void;
  onDecide: (messageId: number, decision: 'approve' | 'reject') => void;
  onClose: () => void;
};

/** Right-side panel on desktop, full-screen chat on mobile. */
export function AssistantPanel({ messages, busy, online, onSend, onDecide, onClose }: Props) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, busy]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy || !online) return;
    onSend(text);
    setText('');
  };

  return (
    <aside
      aria-label="Trợ lý AI"
      className="fixed inset-0 z-40 flex flex-col bg-surface md:inset-y-0 md:left-auto md:right-0 md:w-[400px] md:border-l md:border-line-strong md:shadow-2xl md:shadow-black/50"
    >
      <header className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent" aria-hidden="true">
          <Sparkles size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight">Trợ lý AI</h2>
          <p className="text-xs text-muted">Thao tác thật trên dữ liệu của bạn. Xóa luôn cần bạn xác nhận.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng Trợ lý AI" className="rounded-md p-1.5 text-muted transition hover:bg-white/5 hover:text-fg">
          <X size={18} />
        </button>
      </header>

      {!online && (
        <p className="flex items-center gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 text-xs font-medium text-amber-100">
          <WifiOff size={14} aria-hidden="true" /> Mất kết nối: Trợ lý AI tạm dừng.
        </p>
      )}

      <div role="log" aria-live="polite" aria-label="Hội thoại với Trợ lý AI" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Hãy nói việc bạn muốn làm, ví dụ:</p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || !online}
                  onClick={() => onSend(s)}
                  className="rounded-xl border border-line-strong px-3 py-2 text-left text-sm text-fg/90 transition hover:border-accent/50 hover:bg-accent-soft disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === 'user')
            return (
              <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-bg">
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            );
          if (m.role === 'assistant')
            return (
              <div key={m.id} className="mr-6 rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-2.5 text-sm text-fg">
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <Events events={m.events} />
              </div>
            );
          if (m.role === 'error')
            return (
              <div key={m.id} role="alert" className="mr-6 rounded-2xl border border-late/30 bg-late/[0.07] px-3.5 py-2.5 text-sm">
                <p className="text-[#ffb3ac]">{m.text}</p>
                <Events events={m.events} />
                <button
                  type="button"
                  disabled={busy || !online}
                  onClick={() => onSend(m.retry, true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-semibold text-fg/90 hover:bg-white/5 disabled:opacity-40"
                >
                  <RotateCcw size={13} aria-hidden="true" /> Thử lại
                </button>
              </div>
            );
          return <ApprovalCard key={m.id} approval={m.approval} state={m.state} note={m.note} disabled={busy || !online} onDecide={(d) => onDecide(m.id, d)} />;
        })}

        {busy && (
          <p className="inline-flex items-center gap-2 text-sm text-muted" role="status">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden="true" />
            Trợ lý đang xử lý…
          </p>
        )}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-bg/60 p-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <textarea
            ref={box}
            aria-label="Tin nhắn cho Trợ lý AI"
            data-composer=""
            rows={1}
            maxLength={1000}
            disabled={!online}
            value={text}
            placeholder="Ví dụ: dời hạn “Ôn thi” sang thứ Sáu"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-faint outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Gửi"
            disabled={busy || !online || !text.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-bg transition hover:brightness-110 disabled:opacity-40"
          >
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </aside>
  );
}
