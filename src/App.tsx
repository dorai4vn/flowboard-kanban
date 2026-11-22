import { useEffect, useMemo, useState } from 'react';
import { toLocalDateKey } from './domain/dates';
import { focusTasks, type FocusItem } from './domain/filters';
import { TaskDialog, type EditorState } from './components/TaskDialog';
import { BoardView } from './components/BoardView';
import { FilterBar } from './components/FilterBar';
import { OfflineBanner } from './components/OfflineBanner';
import { FocusView } from './components/FocusView';
import { Header } from './components/Header';
import { Sidebar, type View } from './components/Sidebar';
import { Toast } from './components/Toast';
import { useActiveBoard, useBoardStore } from './store/useBoardStore';
import type { AuthUser } from './auth/authClient';

type Props = { today?: string; account?: AuthUser; onSignOut?: () => void };

export default function App({ today = toLocalDateKey(new Date()), account, onSignOut }: Props) {
  const board = useActiveBoard();
  const filter = useBoardStore((s) => s.filter);
  const notice = useBoardStore((s) => s.notice);
  const dismissNotice = useBoardStore((s) => s.dismissNotice);
  const online = useBoardStore((s) => s.online);
  const setOnline = useBoardStore((s) => s.setOnline);
  const saving = useBoardStore((s) => s.saving);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [view, setView] = useState<View>('board');
  const boards = useBoardStore((s) => s.app.boards);
  const boardOrder = useBoardStore((s) => s.app.boardOrder);
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);
  const completeTask = useBoardStore((s) => s.completeTask);
  const focus = useMemo(
    () => ({ today: focusTasks({ boards, boardOrder }, 'today', today), overdue: focusTasks({ boards, boardOrder }, 'overdue', today) }),
    [boards, boardOrder, today],
  );

  // Dialogs are portalled to <body>, so the accent also lives on <html>.
  // Offline = read-only (no offline write queue by design).
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  // Leaving while a write is still on its way would lose it: let the browser ask first.
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving]);

  const accent = board?.accent ?? 'indigo';
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  if (!board) return null;

  const openFromFocus = (item: FocusItem) => {
    setActiveBoard(item.boardId);
    setEditor({ mode: 'edit', id: item.task.id });
  };
  const openBoard = (id: string) => {
    setActiveBoard(id);
    setView('board');
  };

  return (
    <div data-accent={board.accent} className="board-glow min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <Sidebar
        view={view}
        onView={setView}
        counts={{ today: focus.today.length, overdue: focus.overdue.length }}
        boards={boardOrder.map((id) => boards[id]!)}
        activeBoardId={board.id}
        onOpenBoard={openBoard}
      />
      <div className="min-w-0">
        <Header board={board} view={view} account={account} onSignOut={onSignOut} readOnly={!online} saving={saving}>
          <FilterBar board={board} />
        </Header>
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 md:pb-10">
          {!online && <OfflineBanner />}
          {view === 'board' ? (
            <BoardView
              board={board}
              filter={filter}
              today={today}
              readOnly={!online}
              onAdd={(column) => setEditor({ mode: 'create', column })}
              onOpen={(id) => setEditor({ mode: 'edit', id })}
            />
          ) : (
            <FocusView
              kind={view}
              items={focus[view]}
              today={today}
              readOnly={!online}
              onOpen={openFromFocus}
              onComplete={(item) => completeTask(item.boardId, item.task.id)}
              onBackToBoard={() => setView('board')}
            />
          )}
        </main>
      </div>
      {editor && <TaskDialog key={editor.mode === 'edit' ? editor.id : editor.column} board={board} editor={editor} onClose={() => setEditor(null)} />}
      {notice && <Toast message={notice} onClose={dismissNotice} />}
    </div>
  );
}
