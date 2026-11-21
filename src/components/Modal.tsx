import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  role?: 'dialog' | 'alertdialog';
  size?: 'sm' | 'md';
};

/** Open modals, innermost last: only the top one handles Escape and Tab. */
const stack: symbol[] = [];

const FOCUSABLE = 'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, role = 'dialog', size = 'md' }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const me = Symbol('modal');
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0) return;
        const [head, tail] = [items[0]!, items[items.length - 1]!];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // Portal to <body>: an ancestor with backdrop-filter (the header) would otherwise trap `position: fixed`.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line-strong bg-surface p-5 shadow-2xl shadow-black/50 sm:rounded-2xl ${size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg'}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold text-fg">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md p-1 text-muted transition hover:bg-white/5 hover:text-fg">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
