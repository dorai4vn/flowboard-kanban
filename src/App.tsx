import { useEffect, useState } from 'react';
import { toLocalDateKey } from './domain/dates';
import { TaskDialog, type EditorState } from './components/TaskDialog';
import { BoardView } from './components/BoardView';
import { FilterBar } from './components/FilterBar';
import { OfflineBanner } from './components/OfflineBanner';
import { Header } from './components/Header';
import { TodaySummary } from './components/TodaySummary';
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

  return (
    <div data-accent={board.accent} className="board-glow min-h-dvh">
      <Header board={board} account={account} onSignOut={onSignOut} readOnly={!online} saving={saving}>
        <FilterBar board={board} />
      </Header>
      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {!online && <OfflineBanner />}
        {filter.todayMode && <TodaySummary board={board} today={today} />}
        <BoardView board={board} filter={filter} today={today} readOnly={!online} onAdd={(column) => setEditor({ mode: 'create', column })}
          onOpen={(id) => setEditor({ mode: 'edit', id })}
        />
      </main>
      {editor && <TaskDialog key={editor.mode === 'edit' ? editor.id : editor.column} board={board} editor={editor} onClose={() => setEditor(null)} />}
      {notice && <Toast message={notice} onClose={dismissNotice} />}
    </div>
  );
}
