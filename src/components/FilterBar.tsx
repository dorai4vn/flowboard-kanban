import { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import { DUE_FILTER_LABELS, type DueFilter } from '../domain/filters';
import { PRIORITIES, PRIORITY_LABELS, type Board } from '../domain/types';
import { useBoardStore } from '../store/useBoardStore';
import { LABEL_DOT } from './styles';

const DUE_OPTIONS: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];
const checkRow = 'flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-fg/90 hover:bg-white/5';

export function FilterBar({ board }: { board: Board }) {
  const filter = useBoardStore((s) => s.filter);
  const setFilter = useBoardStore((s) => s.setFilter);
  const resetFilter = useBoardStore((s) => s.resetFilter);
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const count = filter.priorities.length + filter.labelIds.length + (filter.due !== 'all' ? 1 : 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === '/' && !typing && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div ref={wrap} className="relative flex w-full items-center gap-2 md:w-auto">
      <div className="relative min-w-0 flex-1 md:w-64 md:flex-none">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input
          ref={search}
          type="search"
          aria-label="Tìm kiếm công việc"
          placeholder="Tìm công việc…  ( / )"
          value={filter.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          className="w-full rounded-lg border border-line-strong bg-surface py-1.5 pl-9 pr-3 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${count > 0 ? 'border-accent/60 bg-accent-soft text-accent-strong' : 'border-line-strong text-muted hover:text-fg'}`}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        {count > 0 ? `Lọc (${count})` : 'Lọc'}
      </button>

      <button
        type="button"
        aria-pressed={filter.todayMode}
        onClick={() => setFilter({ todayMode: !filter.todayMode })}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${filter.todayMode ? 'border-accent bg-accent text-bg shadow-lg shadow-accent/25' : 'border-line-strong text-muted hover:text-fg'}`}
      >
        <Sun size={15} aria-hidden="true" />
        Hôm nay
      </button>

      {open && (
        <div role="group" aria-label="Bộ lọc" className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-4 shadow-2xl shadow-black/50">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted">Độ ưu tiên</legend>
            <div className="grid grid-cols-2">
              {PRIORITIES.map((p) => (
                <label key={p} className={checkRow}>
                  <input type="checkbox" className="accent-[var(--accent)]" checked={filter.priorities.includes(p)} onChange={() => setFilter({ priorities: toggle(filter.priorities, p) })} />
                  {PRIORITY_LABELS[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-medium text-muted">Nhãn</legend>
            <div className="grid grid-cols-2">
              {board.labels.map((l) => (
                <label key={l.id} className={checkRow}>
                  <input type="checkbox" className="accent-[var(--accent)]" checked={filter.labelIds.includes(l.id)} onChange={() => setFilter({ labelIds: toggle(filter.labelIds, l.id) })} />
                  <span className={`h-2 w-2 shrink-0 rounded-full ${LABEL_DOT[l.color]}`} aria-hidden="true" />
                  <span className="truncate">{l.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-medium text-muted">Hạn chót</legend>
            <div className="grid grid-cols-2">
              {DUE_OPTIONS.map((d) => (
                <label key={d} className={checkRow}>
                  <input type="radio" name="due-filter" className="accent-[var(--accent)]" checked={filter.due === d} onChange={() => setFilter({ due: d })} />
                  {DUE_FILTER_LABELS[d]}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => resetFilter()}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-muted transition hover:text-fg"
          >
            <X size={14} aria-hidden="true" /> Xóa bộ lọc
          </button>
        </div>
      )}
    </div>
  );
}
