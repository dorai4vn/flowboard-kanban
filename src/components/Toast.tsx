import { X } from 'lucide-react';

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-amber-400/30 bg-surface/95 p-4 text-sm text-fg shadow-xl backdrop-blur" role="alert">
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onClose} aria-label="Đóng thông báo" className="rounded-md p-0.5 text-muted hover:text-fg">
        <X size={16} />
      </button>
    </div>
  );
}
