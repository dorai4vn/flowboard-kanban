import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ColumnId, Label, Task } from '../domain/types';
import { DueBadge, PriorityBadge } from './badges';
import { MoveMenu } from './MoveMenu';
import { LABEL_CLASSES } from './styles';

type BodyProps = { task: Task; column: ColumnId; labels: Label[]; today: string };

export function TaskCardBody({ task, column, labels, today }: BodyProps) {
  const done = column === 'done';
  const taskLabels = task.labelIds.flatMap((id) => labels.filter((l) => l.id === id));

  return (
    <>
      <p className={`pr-7 text-[13.5px] font-semibold leading-snug break-words ${done ? 'text-muted line-through decoration-faint/70' : 'text-fg'}`}>{task.title}</p>
      {task.description && <p className="mt-1 line-clamp-2 pr-2 text-xs leading-relaxed text-muted">{task.description}</p>}
      {taskLabels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {taskLabels.map((l) => (
            <span key={l.id} className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${LABEL_CLASSES[l.color]}`}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5">
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span className="ml-auto">
            <DueBadge dueDate={task.dueDate} today={today} done={done} />
          </span>
        )}
      </div>
    </>
  );
}

type Props = BodyProps & { onOpen: (id: string) => void; onMove: (id: string, to: ColumnId) => void; readOnly?: boolean };

export const cardClass = 'relative rounded-xl border border-line bg-card p-3.5 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset,0_6px_16px_-10px_rgb(0_0_0/0.6)]';

export function TaskCard({ task, column, labels, today, onOpen, onMove, readOnly = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', column },
    disabled: readOnly,
    attributes: { roleDescription: 'công việc có thể kéo thả' },
  });

  return (
    <div className="group relative" style={{ transform: CSS.Translate.toString(transform), transition }}>
      <article
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        data-task-id={task.id}
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isDragging) {
            e.preventDefault();
            onOpen(task.id);
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
        className={`${cardClass} ${readOnly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} touch-manipulation select-none transition-[background,border,opacity] hover:border-line-strong hover:bg-card-hover ${isDragging ? 'opacity-30' : ''}`}
      >
        <TaskCardBody task={task} column={column} labels={labels} today={today} />
      </article>
      <MoveMenu taskTitle={task.title} column={column} disabled={readOnly} onMove={(to) => onMove(task.id, to)} />
    </div>
  );
}
