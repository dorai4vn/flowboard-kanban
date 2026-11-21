import { Modal } from './Modal';
import { buttonDanger, buttonGhost } from './styles';

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel = 'Xóa', onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} role="alertdialog" size="sm">
      <p className="text-sm text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={buttonGhost} onClick={onCancel} data-autofocus>
          Hủy
        </button>
        <button type="button" className={buttonDanger} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
