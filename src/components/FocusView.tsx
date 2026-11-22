import { AlarmClock, AlarmClockOff, ArrowLeft, CalendarArrowUp, Check, CircleCheck, PartyPopper } from 'lucide-react';
import { formatLongDate } from '../domain/dates';
import type { FocusItem, OverdueBucket } from '../domain/filters';
import { COLUMN_TITLES } from '../domain/types';
import { DueBadge, PriorityBadge } from './badges';
import { ACCENT_SWATCH } from './styles';

type Actions = {
  today: string;
  readOnly: boolean;
  onOpen: (item: FocusItem) => void;
  onComplete: (item: FocusItem) => void;
  onBackToBoard: () => void;
};

type Props =
  | (Actions & { kind: 'today'; pending: FocusItem[]; done: FocusItem[]; overdueCount: number; onShowOverdue: () => void })
  | (Actions & { kind: 'overdue'; buckets: OverdueBucket[]; onReschedule: (item: FocusItem) => void });

function BoardChip({ item }: { item: FocusItem }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-fg/80">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCENT_SWATCH[item.boardAccent] }} aria-hidden="true" />
      <span className="truncate">{item.boardName}</span>
    </span>
  );
}

function Row({ item, today, readOnly, onOpen, onComplete, onReschedule }: { item: FocusItem; onReschedule?: (item: FocusItem) => void } & Omit<Actions, 'onBackToBoard'>) {
  return (
    <li className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] sm:items-center">
      <button
        type="button"
        aria-label={`Đánh dấu hoàn thành ${item.task.title}`}
        title="Đánh dấu hoàn thành"
        disabled={readOnly}
        onClick={() => onComplete(item)}
        className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-line-strong text-transparent transition hover:border-done hover:bg-done/15 hover:text-done disabled:cursor-not-allowed disabled:opacity-40 sm:mt-0"
      >
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" aria-label={`Mở ${item.task.title}`} onClick={() => onOpen(item)} className="block w-full min-w-0 text-left">
          <h3 className="line-clamp-2 break-words text-sm font-semibold leading-snug text-fg group-hover:text-accent-strong sm:line-clamp-1">{item.task.title}</h3>
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <BoardChip item={item} />
          <span>{COLUMN_TITLES[item.column]}</span>
          <PriorityBadge priority={item.task.priority} />
          <DueBadge dueDate={item.task.dueDate!} today={today} />
        </div>
      </div>
      {onReschedule && (
        <button
          type="button"
          aria-label={`Dời sang hôm nay ${item.task.title}`}
          title="Dời hạn chót sang hôm nay"
          disabled={readOnly}
          onClick={() => onReschedule(item)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-2 py-1.5 text-xs font-semibold text-fg/85 transition hover:border-today/60 hover:text-today disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5"
        >
          <CalendarArrowUp size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Dời sang hôm nay</span>
        </button>
      )}
    </li>
  );
}

function Empty({ icon, title, hint, onBackToBoard }: { icon: React.ReactNode; title: string; hint: string; onBackToBoard: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon}
      <p className="text-base font-semibold text-fg">{title}</p>
      <p className="max-w-xs text-sm text-muted">{hint}</p>
      <button
        type="button"
        onClick={onBackToBoard}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-fg/90 transition hover:bg-white/5"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Về bảng công việc
      </button>
    </div>
  );
}

const listClass = 'divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface/80';

/** Today / Overdue: focused lists of unfinished tasks gathered from every board. */
export function FocusView(props: Props) {
  const { today, readOnly, onOpen, onComplete, onBackToBoard } = props;
  const row = { today, readOnly, onOpen, onComplete };

  if (props.kind === 'today') {
    const { pending, done, overdueCount, onShowOverdue } = props;
    const planned = pending.length + done.length;
    const pct = planned === 0 ? 0 : Math.round((done.length / planned) * 100);
    return (
      <section className="mx-auto w-full max-w-3xl" aria-labelledby="focus-title">
        <header className="mb-6">
          <h2 id="focus-title" className="text-sm font-semibold text-today">
            Hôm nay
          </h2>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-fg sm:text-[2.6rem] sm:leading-[1.1]">{formatLongDate(today)}</p>
          <div className="mt-4 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Tiến độ hôm nay"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.06]"
            >
              <span className="block h-full rounded-full bg-today transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-fg/90">{`Đã xong ${done.length}/${planned}`}</span>
          </div>
        </header>

        {overdueCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-late/25 bg-late/[0.07] px-4 py-3 text-sm">
            <AlarmClock size={16} className="text-late" aria-hidden="true" />
            <span className="text-fg/90">Còn việc trễ hạn từ những ngày trước.</span>
            <button type="button" onClick={onShowOverdue} className="ml-auto rounded-lg bg-late/15 px-2.5 py-1 text-xs font-semibold text-[#ffb3ac] transition hover:bg-late/25">
              {`Xem ${overdueCount} việc quá hạn`}
            </button>
          </div>
        )}

        {pending.length > 0 ? (
          <ul aria-label="Việc đến hạn hôm nay" className={listClass}>
            {pending.map((item) => (
              <Row key={item.task.id} item={item} {...row} />
            ))}
          </ul>
        ) : done.length > 0 ? (
          <Empty
            icon={<PartyPopper size={28} className="text-today" aria-hidden="true" />}
            title="Bạn đã xong mọi việc đến hạn hôm nay."
            hint="Nghỉ ngơi một chút, hoặc kéo thêm việc từ bảng sang Đang làm."
            onBackToBoard={onBackToBoard}
          />
        ) : (
          <Empty
            icon={<CircleCheck size={28} className="text-done" aria-hidden="true" />}
            title="Không có việc nào đến hạn hôm nay."
            hint="Đặt hạn chót cho công việc để chúng xuất hiện ở đây đúng ngày."
            onBackToBoard={onBackToBoard}
          />
        )}

        {done.length > 0 && (
          <div className="mt-6">
            <h3 id="done-today" className="mb-2 text-sm font-semibold text-muted">
              Đã xong hôm nay
            </h3>
            <ul aria-labelledby="done-today" className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {done.map((item) => (
                <li key={item.task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <CircleCheck size={18} className="shrink-0 text-done" aria-hidden="true" />
                  <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 truncate text-left text-sm text-muted line-through decoration-faint/70 hover:text-fg">
                    {item.task.title}
                  </button>
                  <span className="hidden text-xs sm:inline">
                    <BoardChip item={item} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  const { buckets, onReschedule } = props;
  const count = buckets.reduce((n, b) => n + b.items.length, 0);
  return (
    <section className="mx-auto w-full max-w-3xl" aria-labelledby="focus-title">
      <header className="mb-6">
        <h2 id="focus-title" className="text-sm font-semibold text-late">
          Quá hạn
        </h2>
        <p className={`mt-1 text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-[1.1] ${count ? 'text-late' : 'text-fg'}`}>
          {count === 0 ? 'Bạn đang theo kịp mọi hạn chót.' : `${count} việc đã qua hạn chót`}
        </p>
        {count > 0 && <p className="mt-2 text-sm text-muted">Hoàn thành ngay, hoặc dời hạn chót sang hôm nay để lên kế hoạch lại.</p>}
      </header>

      {count === 0 ? (
        <Empty
          icon={<AlarmClockOff size={28} className="text-done" aria-hidden="true" />}
          title="Không có việc nào quá hạn."
          hint="Việc chưa xong mà đã qua hạn chót sẽ hiện ở đây, nhóm theo mức trễ."
          onBackToBoard={onBackToBoard}
        />
      ) : (
        <section aria-label="Việc quá hạn" className="flex flex-col gap-6">
          {buckets.map((b) => (
            <div key={b.id}>
              <h3 id={`bucket-${b.id}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg/90">
                <span className={`h-2 w-2 rounded-full ${b.id === 'week' ? 'bg-late' : b.id === 'days' ? 'bg-late/70' : 'bg-today'}`} aria-hidden="true" />
                {b.title}
                <span className="font-normal tabular-nums text-faint" aria-hidden="true">
                  {b.items.length}
                </span>
              </h3>
              <ul aria-labelledby={`bucket-${b.id}`} className={listClass}>
                {b.items.map((item) => (
                  <Row key={item.task.id} item={item} {...row} onReschedule={onReschedule} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
