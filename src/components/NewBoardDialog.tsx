import { useState, type FormEvent } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { Modal } from './Modal';
import { buttonGhost, buttonPrimary, inputClass } from './styles';

export function NewBoardDialog({ onClose }: { onClose: () => void }) {
  const createBoard = useBoardStore((s) => s.createBoard);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = createBoard(name);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal title="Tạo bảng mới" onClose={onClose} size="sm">
      <form onSubmit={submit} noValidate>
        <label htmlFor="new-board-name" className="mb-1.5 block text-xs font-medium text-muted">
          Tên bảng
        </label>
        <input
          id="new-board-name"
          className={inputClass}
          value={name}
          maxLength={60}
          placeholder="Ví dụ: Đồ án tốt nghiệp"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'new-board-error' : undefined}
          data-autofocus
        />
        {error && (
          <p id="new-board-error" role="alert" className="mt-1.5 text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonGhost} onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className={buttonPrimary}>
            Tạo bảng
          </button>
        </div>
      </form>
    </Modal>
  );
}
