import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { ACCENT_NAMES, ACCENTS, type Board } from '../domain/types';
import { useBoardStore } from '../store/useBoardStore';
import { ConfirmDialog } from './ConfirmDialog';
import { ACCENT_SWATCH, inputClass } from './styles';

/** Popover with rename, accent color and delete for the active board. */
export function BoardSettings({ board, onClose }: { board: Board; onClose: () => void }) {
  const { renameBoard, setAccent, deleteBoard } = useBoardStore((s) => s);
  const [name, setName] = useState(board.name);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!confirming && ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirming, onClose]);

  const commitName = () => {
    if (name.trim() === board.name) return setError(null);
    setError(renameBoard(board.id, name));
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line-strong bg-surface p-4 shadow-2xl shadow-black/50"
      role="group"
      aria-label="Tùy chỉnh bảng"
    >
      <label htmlFor="rename-board" className="mb-1.5 block text-xs font-medium text-muted">
        Đổi tên bảng
      </label>
      <input
        id="rename-board"
        className={inputClass}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitName();
          }
        }}
      />
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}

      <p id="accent-label" className="mb-2 mt-4 text-xs font-medium text-muted">
        Màu nhấn
      </p>
      <div role="radiogroup" aria-labelledby="accent-label" className="flex flex-wrap gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={board.accent === a}
            aria-label={`Màu ${ACCENT_NAMES[a]}`}
            title={ACCENT_NAMES[a]}
            onClick={() => setAccent(board.id, a)}
            className="grid h-8 w-8 place-items-center rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface transition hover:scale-110 aria-checked:ring-white/70"
            style={{ background: ACCENT_SWATCH[a] }}
          >
            {board.accent === a && <Check size={14} className="text-bg" strokeWidth={3} />}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10"
      >
        <Trash2 size={15} /> Xóa bảng
      </button>

      {confirming && (
        <ConfirmDialog
          title="Xóa bảng?"
          message={`Bảng “${board.name}” và toàn bộ công việc trong đó sẽ bị xóa vĩnh viễn.`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            deleteBoard(board.id);
            onClose();
          }}
        />
      )}
    </div>
  );
}
