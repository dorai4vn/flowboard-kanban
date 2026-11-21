import { toLocalDateKey } from './domain/dates';
import { BoardView } from './components/BoardView';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { useActiveBoard, useBoardStore } from './store/useBoardStore';

export default function App({ today = toLocalDateKey(new Date()) }: { today?: string }) {
  const board = useActiveBoard();
  const filter = useBoardStore((s) => s.filter);
  const notice = useBoardStore((s) => s.notice);
  const dismissNotice = useBoardStore((s) => s.dismissNotice);

  return (
    <div data-accent={board.accent} className="board-glow min-h-dvh">
      <Header board={board} />
      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <BoardView board={board} filter={filter} today={today} onAdd={() => {}} onOpen={() => {}} />
      </main>
      {notice && <Toast message={notice} onClose={dismissNotice} />}
    </div>
  );
}
