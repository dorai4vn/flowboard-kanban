import { Calendar, AlignLeft } from 'lucide-react';
import { formatDueDate } from '../domain/dates';
import { isDueToday, isOverdue } from '../domain/filters';
import { PRIORITY_LABELS, type ColumnId, type Label, type Task } from '../domain/types';
import { LABEL_CLASSES, PRIORITY_BAR, PRIORITY_CLASSES } from './styles';

type Props = {
  task: Task;
  column: ColumnId;
  labels: Label[];
  today: string;
  onOpen: (id: string) => void;
};

export function TaskCardBody({ task, column, labels, today }: Omit<Props, 'onOpen'>) {
  const overdue = isOverdue(task, column, today);
  const dueToday = column !== 'done' && isDueToday(task, today);
  const done = column === 'done';
  const taskLabels = task.labelIds.flatMap((id) => labels.filter((l) => l.id === id));

  let dueText = '';
  let dueClass = 'text-muted';
  if (task.dueDate) {
    dueText = `Hạn chót ${formatDueDate(task.dueDate)}`;
    if (overdue) {
      dueText += ', quá hạn';
      dueClass = 'text-red-300 bg-red-500/10';
    } else if (dueToday) {
      dueText += ', hôm nay';
      dueClass = 'text-amber-200 bg-amber-400/10';
    }
  }

  return (
    <>
      <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${PRIORITY_BAR[task.priority]}`} aria-hidden="true" />
      <p className={`text-sm font-medium leading-snug ${done ? 'text-muted line-through decoration-faint' : 'text-fg'}`}>{task.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASSES[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
        {taskLabels.map((l) => (
          <span key={l.id} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${LABEL_CLASSES[l.color]}`}>
            {l.name}
          </span>
        ))}
        {task.description && <AlignLeft size={13} className="text-faint" aria-label="Có mô tả" />}
        {task.dueDate && (
          <span aria-label={dueText} className={`ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${dueClass}`}>
            <Calendar size={12} aria-hidden="true" />
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>
    </>
  );
}

export function TaskCard(props: Props) {
  const { task, onOpen } = props;
  return (
    <article
      className="group relative cursor-pointer rounded-xl border border-line bg-card p-3 pl-4 shadow-sm shadow-black/20 transition hover:-translate-y-px hover:border-line-strong hover:bg-card-hover"
      tabIndex={0}
      aria-label={task.title}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
    >
      <TaskCardBody {...props} />
    </article>
  );
}
