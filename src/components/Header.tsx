import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus, Settings2, Sparkles } from 'lucide-react';
import type { AuthUser } from '../auth/authClient';
import type { Board } from '../domain/types';
import { useBoardStore } from '../store/useBoardStore';
import { BoardSettings } from './BoardSettings';
import { NewBoardDialog } from './NewBoardDialog';
import { MobileBrand, type View } from './Sidebar';
import { UserMenu } from './UserMenu';

type Props = {
  board: Board;
  view: View;
  children?: ReactNode;
  account?: AuthUser;
  onSignOut?: () => void;
  readOnly?: boolean;
  saving?: boolean;
  /** undefined = assistant not available in this build/session */
  assistantOpen?: boolean;
  onToggleAssistant?: () => void;
};

const iconButton =
  'rounded-lg border border-line-strong p-2 text-muted transition hover:border-accent/50 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40';

/** Top bar: board switcher + tools on the board view, account and save state everywhere. */
export function Header({ board, view, children, account, onSignOut, readOnly = false, saving = false, assistantOpen, onToggleAssistant }: Props) {
  const boardOrder = useBoardStore((s) => s.app.boardOrder);
  const allBoards = useBoardStore((s) => s.app.boards);
  const boards = boardOrder.map((id) => allBoards[id]!);
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6">
        <MobileBrand />

        {view === 'board' && (
          <div className="order-3 flex min-w-0 items-center gap-1.5 md:order-1">
            <div className="relative">
              <select
                aria-label="Chọn bảng"
                value={board.id}
                onChange={(e) => setActiveBoard(e.target.value)}
                className="max-w-[46vw] appearance-none truncate rounded-lg border border-line-strong bg-surface py-1.5 pl-3 pr-8 text-sm font-bold text-fg outline-none transition hover:border-accent/50 focus:border-accent sm:max-w-[260px]"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <button type="button" aria-label="Bảng mới" title="Bảng mới" disabled={readOnly} onClick={() => setCreating(true)} className={iconButton}>
              <Plus size={16} />
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="Tùy chỉnh bảng"
                title="Tùy chỉnh bảng"
                aria-expanded={settingsOpen}
                disabled={readOnly}
                onClick={() => setSettingsOpen((v) => !v)}
                className={`${iconButton} aria-expanded:border-accent aria-expanded:text-accent`}
              >
                <Settings2 size={16} />
              </button>
              {settingsOpen && !readOnly && <BoardSettings key={board.id} board={board} onClose={() => setSettingsOpen(false)} />}
            </div>
          </div>
        )}
        {view !== 'board' && <p className="order-3 hidden text-sm text-muted md:order-1 md:block">Tổng hợp từ mọi bảng của bạn</p>}

        <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
          <span aria-live="polite" className="text-xs text-muted">
            {saving && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
                Đang lưu…
              </span>
            )}
          </span>
          {assistantOpen !== undefined && onToggleAssistant && (
            <button
              type="button"
              aria-label="Trợ lý AI"
              aria-expanded={assistantOpen}
              onClick={onToggleAssistant}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-sm font-semibold text-accent-strong transition hover:border-accent aria-expanded:bg-accent aria-expanded:text-bg"
            >
              <Sparkles size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Trợ lý AI</span>
            </button>
          )}
          {account && onSignOut && <UserMenu account={account} onSignOut={onSignOut} />}
        </div>

        {view === 'board' && children && <div className="order-4 flex w-full items-center gap-2 md:order-2 md:ml-auto md:w-auto">{children}</div>}
      </div>
      {creating && <NewBoardDialog onClose={() => setCreating(false)} />}
    </header>
  );
}
