import { useState, type FormEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { COLUMN_TITLES, LABEL_COLOR_NAMES, LABEL_COLORS, PRIORITIES, PRIORITY_LABELS, type Board, type ColumnId, type LabelColor, type Priority } from '../domain/types';
import { useBoardStore } from '../store/useBoardStore';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';
import { LABEL_CLASSES, LABEL_DOT, buttonGhost, buttonPrimary, inputClass } from './styles';

export type EditorState = { mode: 'create'; column: ColumnId } | { mode: 'edit'; id: string };

const fieldLabel = 'mb-1.5 block text-xs font-medium text-muted';

export function TaskDialog({ board, editor, onClose }: { board: Board; editor: EditorState; onClose: () => void }) {
  const { createTask, updateTask, deleteTask, addLabel } = useBoardStore((s) => s);
  const existing = editor.mode === 'edit' ? board.tasks[editor.id] : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(existing?.labelIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newLabelColor, setNewLabelColor] = useState<LabelColor>('blue');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (editor.mode === 'edit' && !existing) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = { title, description, priority, dueDate: dueDate || null, labelIds };
    const err = editor.mode === 'create' ? createTask(input, editor.column) : updateTask(editor.id, input);
    if (err) setError(err);
    else onClose();
  };

  const toggleLabel = (id: string) => setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const createLabel = () => {
    const r = addLabel(newLabel, newLabelColor);
    if (!r.ok) return setLabelError(r.error);
    setLabelIds((ids) => [...ids, r.value.id]);
    setNewLabel('');
    setLabelError(null);
  };

  const heading = editor.mode === 'create' ? 'Công việc mới' : 'Sửa công việc';

  return (
    <Modal title={heading} onClose={onClose}>
      {editor.mode === 'create' && <p className="-mt-2 mb-4 text-xs text-muted">Thêm vào cột “{COLUMN_TITLES[editor.column]}”</p>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="task-title" className={fieldLabel}>
            Tiêu đề
          </label>
          <input
            id="task-title"
            className={inputClass}
            value={title}
            maxLength={200}
            placeholder="Cần làm gì?"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'task-error' : undefined}
            data-autofocus
          />
          {error && (
            <p id="task-error" role="alert" className="mt-1.5 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="task-description" className={fieldLabel}>
            Mô tả
          </label>
          <textarea
            id="task-description"
            className={`${inputClass} min-h-[84px] resize-y`}
            value={description}
            maxLength={2000}
            placeholder="Ghi chú thêm (không bắt buộc)"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-priority" className={fieldLabel}>
              Độ ưu tiên
            </label>
            <select id="task-priority" className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-due" className={fieldLabel}>
              Hạn chót
            </label>
            <div className="flex gap-1">
              <input id="task-due" type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              {dueDate && (
                <button type="button" onClick={() => setDueDate('')} className="rounded-lg px-2 text-xs text-muted hover:bg-white/5 hover:text-fg" aria-label="Bỏ hạn chót">
                  Bỏ
                </button>
              )}
            </div>
          </div>
        </div>

        <fieldset>
          <legend className={fieldLabel}>Nhãn</legend>
          <div className="flex flex-wrap gap-1.5">
            {board.labels.map((l) => {
              const on = labelIds.includes(l.id);
              return (
                <label
                  key={l.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${on ? LABEL_CLASSES[l.color] : 'text-muted ring-line-strong hover:text-fg'}`}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleLabel(l.id)} />
                  {on ? <Check size={12} strokeWidth={3} /> : <span className={`h-2 w-2 rounded-full ${LABEL_DOT[l.color]}`} aria-hidden="true" />}
                  {l.name}
                </label>
              );
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label htmlFor="new-label" className="sr-only">
              Tên nhãn mới
            </label>
            <input
              id="new-label"
              className={`${inputClass} !w-40 !py-1.5 text-xs`}
              value={newLabel}
              maxLength={30}
              placeholder="Nhãn mới…"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  createLabel();
                }
              }}
            />
            <div role="radiogroup" aria-label="Màu nhãn mới" className="flex gap-1">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={newLabelColor === c}
                  aria-label={`Màu ${LABEL_COLOR_NAMES[c]}`}
                  onClick={() => setNewLabelColor(c)}
                  className={`h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-surface transition ${LABEL_DOT[c]} ${newLabelColor === c ? 'ring-white/70' : 'ring-transparent'}`}
                />
              ))}
            </div>
            <button type="button" onClick={createLabel} className={`${buttonGhost} !px-2 !py-1 text-xs`}>
              <Plus size={13} /> Thêm nhãn
            </button>
          </div>
          {labelError && (
            <p role="alert" className="mt-1.5 text-xs text-red-300">
              {labelError}
            </p>
          )}
        </fieldset>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          {editor.mode === 'edit' && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Xóa công việc"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10"
            >
              <Trash2 size={15} /> Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={buttonGhost} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className={buttonPrimary}>
              Lưu
            </button>
          </div>
        </div>
      </form>

      {confirming && editor.mode === 'edit' && (
        <ConfirmDialog
          title="Xóa công việc này?"
          message={`“${existing!.title}” sẽ bị xóa vĩnh viễn.`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            deleteTask(editor.id);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
