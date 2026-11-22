import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
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

const DOT: Record<ColumnId, string> = { todo: 'bg-slate-400', doing: 'bg-accent', done: 'bg-emerald-400' };

export function Column({ column, tasks, totalCount, labels, today, highlighted, hiddenOnMobile, onAdd, onOpen, onMove, readOnly = false }: Props) {
  const title = COLUMN_TITLES[column];
  const { setNodeRef } = useDroppable({ id: `column:${column}`, data: { type: 'column', column } });

  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      id={`panel-${column}`}
      className={`min-h-[240px] flex-col rounded-2xl border bg-surface/70 p-3 transition-colors ${highlighted ? 'border-accent/60 bg-accent-soft' : 'border-line'} ${hiddenOnMobile ? 'hidden md:flex' : 'flex'}`}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${DOT[column]}`} aria-hidden="true" />
        <h2 className="text-sm font-semibold text-fg">
          {title}
          <span className="sr-only"> ({tasks.length})</span>
        </h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium tabular-nums text-muted" aria-hidden="true">
          {tasks.length}
        </span>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} column={column} labels={labels} today={today} onOpen={onOpen} onMove={onMove} readOnly={readOnly} />
          ))}
          {tasks.length === 0 && (
            <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-faint">
              {totalCount === 0 ? 'Chưa có công việc' : 'Không tìm thấy công việc phù hợp'}
            </p>
          )}
        </div>
      </SortableContext>

      <button
        type="button"
        onClick={() => onAdd(column)}
        disabled={readOnly}
        aria-label={`Thêm công việc vào cột ${title}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-muted transition hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus size={16} aria-hidden="true" /> Thêm công việc
      </button>
    </section>
  );
}
