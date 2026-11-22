import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import type { AuthUser } from '../auth/authClient';
import type { Board } from '../domain/types';
import { useBoardStore } from '../store/useBoardStore';
import { BoardSettings } from './BoardSettings';
import { NewBoardDialog } from './NewBoardDialog';
import { UserMenu } from './UserMenu';

type Props = { board: Board; children?: ReactNode; account?: AuthUser; onSignOut?: () => void; readOnly?: boolean };

export function Header({ board, children, account, onSignOut, readOnly = false }: Props) {
  const boardOrder = useBoardStore((s) => s.app.boardOrder);
  const allBoards = useBoardStore((s) => s.app.boards);
  const boards = boardOrder.map((id) => allBoards[id]!);
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent shadow-lg shadow-accent/30" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-bg">
              <rect x="2" y="3" width="4" height="14" rx="1.5" />
              <rect x="8" y="3" width="4" height="10" rx="1.5" />
              <rect x="14" y="3" width="4" height="6" rx="1.5" />
            </svg>
          </span>
          <h1 className="text-lg font-bold tracking-tight">FlowBoard</h1>
        </div>

        <div className="relative flex min-w-0 items-center gap-1.5">
          <div className="relative">
            <select
              aria-label="Chọn bảng"
              value={board.id}
              onChange={(e) => setActiveBoard(e.target.value)}
              className="max-w-[44vw] appearance-none truncate rounded-lg border border-line-strong bg-surface py-1.5 pl-3 pr-8 text-sm font-medium text-fg outline-none transition hover:border-accent/50 focus:border-accent sm:max-w-[240px]"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          <button
            type="button"
            aria-label="Bảng mới"
            title="Bảng mới"
            disabled={readOnly}
            onClick={() => setCreating(true)}
            className="rounded-lg border border-line-strong p-2 text-muted transition hover:border-accent/50 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
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
              className="rounded-lg border border-line-strong p-2 text-muted transition hover:border-accent/50 hover:text-fg aria-expanded:border-accent aria-expanded:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Settings2 size={16} />
            </button>
            {settingsOpen && !readOnly && <BoardSettings key={board.id} board={board} onClose={() => setSettingsOpen(false)} />}
          </div>
        </div>

        <div className="flex w-full flex-1 items-center gap-2 md:w-auto md:justify-end">
          {children}
          {account && onSignOut && <UserMenu account={account} onSignOut={onSignOut} />}
        </div>
      </div>
      {creating && <NewBoardDialog onClose={() => setCreating(false)} />}
    </header>
  );
}
