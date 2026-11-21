import type { LabelColor, Priority } from '../domain/types';

/** Static class strings so Tailwind can see them. */
export const LABEL_CLASSES: Record<LabelColor, string> = {
  red: 'bg-red-500/15 text-red-300 ring-red-400/25',
  orange: 'bg-orange-500/15 text-orange-300 ring-orange-400/25',
  yellow: 'bg-yellow-500/15 text-yellow-200 ring-yellow-400/25',
  green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25',
  blue: 'bg-sky-500/15 text-sky-300 ring-sky-400/25',
  purple: 'bg-violet-500/15 text-violet-300 ring-violet-400/25',
  pink: 'bg-pink-500/15 text-pink-300 ring-pink-400/25',
  gray: 'bg-slate-500/15 text-slate-300 ring-slate-400/25',
};

export const LABEL_DOT: Record<LabelColor, string> = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-300',
  green: 'bg-emerald-400',
  blue: 'bg-sky-400',
  purple: 'bg-violet-400',
  pink: 'bg-pink-400',
  gray: 'bg-slate-400',
};

export const PRIORITY_CLASSES: Record<Priority, string> = {
  low: 'bg-slate-500/15 text-slate-300',
  medium: 'bg-sky-500/15 text-sky-300',
  high: 'bg-orange-500/15 text-orange-300',
  urgent: 'bg-red-500/20 text-red-300',
};

export const PRIORITY_BAR: Record<Priority, string> = {
  low: 'bg-slate-500/60',
  medium: 'bg-sky-400/70',
  high: 'bg-orange-400',
  urgent: 'bg-red-400',
};

export const ACCENT_SWATCH: Record<string, string> = {
  indigo: '#7c83ff',
  violet: '#a78bfa',
  blue: '#60a5fa',
  emerald: '#34d399',
  amber: '#fbbf24',
  rose: '#fb7185',
};

export const inputClass =
  'w-full rounded-lg border border-line-strong bg-bg/60 px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30';

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.98]';

export const buttonGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-fg/90 transition hover:bg-white/5 active:scale-[0.98]';

export const buttonDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 active:scale-[0.98]';
