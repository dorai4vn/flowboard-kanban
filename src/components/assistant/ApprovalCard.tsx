import { AlertTriangle, Check, Trash2, X } from 'lucide-react';
import type { ApprovalView } from '../../assistant/api';
import type { ApprovalState } from '../../assistant/useAssistant';

const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Explicit human approval for a destructive action proposed by the assistant. */
export function ApprovalCard({ approval, state, note, disabled, onDecide }: {
  approval: ApprovalView;
  state: ApprovalState;
  note?: string;
  disabled: boolean;
  onDecide: (d: 'approve' | 'reject') => void;
}) {
  const isTask = approval.action === 'delete_task';
  const title = isTask
    ? `Xóa công việc “${approval.target_label}”`
    : `Xóa bảng “${approval.target_label}” cùng ${approval.detail.task_count ?? 0} công việc`;

  return (
    <div role="group" aria-label="Xác nhận xóa" className="rounded-2xl border border-late/35 bg-late/[0.07] p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-late" aria-hidden="true" />
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-fg">{title}</p>
          {isTask && approval.detail.board_name && <p className="mt-0.5 text-xs text-muted">{`trong bảng “${approval.detail.board_name}”`}</p>}
          <p className="mt-1.5 text-xs text-[#ffb3ac]">Không thể hoàn tác. Trợ lý chỉ xóa khi bạn bấm Xóa.</p>
          {state === 'pending' && <p className="mt-1 text-[11px] text-faint">{`Hết hạn lúc ${time(approval.expires_at)}`}</p>}
        </div>
      </div>

      {(state === 'pending' || state === 'working') && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={disabled || state === 'working'}
            onClick={() => onDecide('reject')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-fg/90 transition hover:bg-white/5 disabled:opacity-40"
          >
            <X size={14} aria-hidden="true" /> Không xóa
          </button>
          <button
            type="button"
            disabled={disabled || state === 'working'}
            onClick={() => onDecide('approve')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden="true" /> Xóa
          </button>
        </div>
      )}
      {state === 'approved' && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-done">
          <Check size={14} aria-hidden="true" /> Đã xóa theo xác nhận của bạn
        </p>
      )}
      {state === 'rejected' && <p className="mt-2.5 text-xs font-semibold text-muted">Đã hủy, không có gì bị xóa</p>}
      {state === 'failed' && <p className="mt-2.5 text-xs font-semibold text-[#ffb3ac]">{note}</p>}
    </div>
  );
}
