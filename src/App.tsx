import { useEffect, useState } from 'react';
import { toLocalDateKey } from './domain/dates';
import { TaskDialog, type EditorState } from './components/TaskDialog';
import { BoardView } from './components/BoardView';
import { FilterBar } from './components/FilterBar';
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
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Dialogs are portalled to <body>, so the accent also lives on <html>.
  const accent = board?.accent ?? 'indigo';
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  if (!board) return null;

  return (
    <div data-accent={board.accent} className="board-glow min-h-dvh">
      <Header board={board} account={account} onSignOut={onSignOut}>
        <FilterBar board={board} />
      </Header>
      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {filter.todayMode && <TodaySummary board={board} today={today} />}
        <BoardView board={board} filter={filter} today={today} onAdd={(column) => setEditor({ mode: 'create', column })}
          onOpen={(id) => setEditor({ mode: 'edit', id })}
        />
      </main>
      {editor && <TaskDialog key={editor.mode === 'edit' ? editor.id : editor.column} board={board} editor={editor} onClose={() => setEditor(null)} />}
      {notice && <Toast message={notice} onClose={dismissNotice} />}
    </div>
  );
}
