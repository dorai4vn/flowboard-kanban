import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CircleCheck, CircleDashed, CircleDot, Plus, SearchX } from 'lucide-react';
import { COLUMN_TITLES, type ColumnId, type Label, type Task } from '../domain/types';
import { TaskCard } from './TaskCard';

type Props = {
  column: ColumnId;
  tasks: Task[];
  totalCount: number;
  labels: Label[];
  today: string;
  highlighted: boolean;
  hiddenOnMobile: boolean;
  onAdd: (column: ColumnId) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, to: ColumnId) => void;
  readOnly?: boolean;
};

const ICON = { todo: CircleDashed, doing: CircleDot, done: CircleCheck } as const;
const ICON_TONE: Record<ColumnId, string> = { todo: 'text-muted', doing: 'text-accent', done: 'text-done' };

export function Column({ column, tasks, totalCount, labels, today, highlighted, hiddenOnMobile, onAdd, onOpen, onMove, readOnly = false }: Props) {
  const title = COLUMN_TITLES[column];
  const Icon = ICON[column];
  const { setNodeRef } = useDroppable({ id: `column:${column}`, data: { type: 'column', column } });

  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      id={`panel-${column}`}
      className={`min-h-[260px] flex-col rounded-2xl border p-2.5 transition-colors ${highlighted ? 'border-accent/60 bg-accent-soft' : 'border-line bg-surface/80'} ${hiddenOnMobile ? 'hidden md:flex' : 'flex'}`}
    >
      <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
        <Icon size={16} strokeWidth={2.25} className={ICON_TONE[column]} aria-hidden="true" />
        <h2 className="text-[13px] font-bold tracking-tight text-fg">
          {title}
          <span className="sr-only"> ({tasks.length})</span>
        </h2>
        <span className="ml-auto rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted" aria-hidden="true">
          {tasks.length}
        </span>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} column={column} labels={labels} today={today} onOpen={onOpen} onMove={onMove} readOnly={readOnly} />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-7 text-center">
              {totalCount === 0 ? <Icon size={20} className="text-faint" aria-hidden="true" /> : <SearchX size={20} className="text-faint" aria-hidden="true" />}
              <p className="text-xs font-medium text-muted">{totalCount === 0 ? 'Chưa có công việc' : 'Không tìm thấy công việc phù hợp'}</p>
              {totalCount === 0 && !readOnly && <p className="text-[11px] text-faint">Bấm “Thêm công việc” để bắt đầu.</p>}
            </div>
          )}
        </div>
      </SortableContext>

      <button
        type="button"
        onClick={() => onAdd(column)}
        disabled={readOnly}
        aria-label={`Thêm công việc vào cột ${title}`}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium text-muted transition hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus size={16} aria-hidden="true" /> Thêm công việc
      </button>
    </section>
  );
}
