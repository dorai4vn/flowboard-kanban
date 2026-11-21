import { useRef, useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { toFullIndex, visibleColumn, type TaskFilter } from '../domain/filters';
import { findColumn } from '../domain/task';
import { COLUMN_IDS, COLUMN_TITLES, type Board, type ColumnId, type Task } from '../domain/types';
import { useBoardStore } from '../store/useBoardStore';
import { Column } from './Column';
import { cardClass, TaskCardBody } from './TaskCard';

type Props = {
  board: Board;
  filter: TaskFilter;
  today: string;
  onAdd: (column: ColumnId) => void;
  onOpen: (id: string) => void;
};

type DropData = { type: 'task' | 'column'; column: ColumnId };

export function BoardView({ board, filter, today, onAdd, onOpen }: Props) {
  const moveTask = useBoardStore((s) => s.moveTask);
  const [tab, setTab] = useState<ColumnId>('todo');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ColumnId | null>(null);
  const lastDragEnd = useRef(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const visible = Object.fromEntries(COLUMN_IDS.map((c) => [c, visibleColumn(board, c, filter, today)])) as Record<ColumnId, Task[]>;
  const titleOf = (id: string | number) => board.tasks[String(id)]?.title ?? '';
  const columnOf = (data: unknown) => (data as DropData | undefined)?.column;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Đã nhấc công việc ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const c = columnOf(over?.data.current);
      return c ? `Công việc ${titleOf(active.id)} đang ở cột ${COLUMN_TITLES[c]}.` : `Công việc ${titleOf(active.id)} không nằm trên cột nào.`;
    },
    onDragEnd: ({ active, over }) => {
      const c = columnOf(over?.data.current);
      return c ? `Đã thả công việc ${titleOf(active.id)} vào cột ${COLUMN_TITLES[c]}.` : `Đã thả công việc ${titleOf(active.id)}.`;
    },
    onDragCancel: ({ active }) => `Đã hủy kéo công việc ${titleOf(active.id)}.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragOver = ({ over }: DragOverEvent) => setOverColumn(columnOf(over?.data.current) ?? null);

  const finish = () => {
    setActiveId(null);
    setOverColumn(null);
    lastDragEnd.current = Date.now();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    finish();
    const id = String(active.id);
    const from = findColumn(board, id);
    const data = over?.data.current as DropData | undefined;
    if (!over || !from || !data) return;
    const to = data.column;
    const shownIds = visible[to].map((t) => t.id);
    const without = shownIds.filter((x) => x !== id);
    let pos: number;
    if (data.type === 'column') {
      pos = without.length;
    } else {
      const overId = String(over.id);
      if (overId === id) return;
      const overPos = without.indexOf(overId);
      if (to === from) {
        pos = shownIds.indexOf(id) < shownIds.indexOf(overId) ? overPos + 1 : overPos;
      } else {
        const r = active.rect.current.translated;
        const below = r !== null && r.top + r.height / 2 > over.rect.top + over.rect.height / 2;
        pos = below ? overPos + 1 : overPos;
      }
    }
    moveTask(id, to, toFullIndex(board.columns[to], without, pos, id));
  };

  const open = (id: string) => {
    if (Date.now() - lastDragEnd.current > 250) onOpen(id);
  };
  const moveToEnd = (id: string, to: ColumnId) => moveTask(id, to, board.columns[to].length);
  const activeTask = activeId ? board.tasks[activeId] : undefined;
  const activeColumn = activeId ? findColumn(board, activeId) : null;

  return (
    <>
      <div role="tablist" aria-label="Cột" className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface/70 p-1 md:hidden">
        {COLUMN_IDS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            id={`tab-${c}`}
            aria-selected={tab === c}
            aria-controls={`panel-${c}`}
            onClick={() => setTab(c)}
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-muted transition aria-selected:bg-accent aria-selected:text-bg"
          >
            {COLUMN_TITLES[c]}
            <span className="rounded-full bg-black/20 px-1.5 text-[10px] tabular-nums">{visible[c].length}</span>
          </button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'Nhấn Space để nhấc công việc. Dùng phím mũi tên để di chuyển, nhấn Space để thả, Esc để hủy. Nhấn Enter để mở chi tiết.',
          },
        }}
      >
        <div className="grid items-start gap-4 md:grid-cols-3">
          {COLUMN_IDS.map((c) => (
            <Column
              key={c}
              column={c}
              tasks={visible[c]}
              totalCount={board.columns[c].length}
              labels={board.labels}
              today={today}
              highlighted={activeId !== null && overColumn === c}
              hiddenOnMobile={tab !== c}
              onAdd={onAdd}
              onOpen={open}
              onMove={moveToEnd}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {activeTask && activeColumn ? (
            <div className={`${cardClass} rotate-[1.5deg] cursor-grabbing border-accent/50 bg-card-hover shadow-2xl shadow-black/60 ring-1 ring-accent/40`}>
              <TaskCardBody task={activeTask} column={activeColumn} labels={board.labels} today={today} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
