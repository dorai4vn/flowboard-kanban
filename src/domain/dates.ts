const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` for the given instant in the browser's local time zone. */
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = parseKey(key);
  return toLocalDateKey(new Date(y, m - 1, d + n));
}

/** Date keys are zero-padded, so lexical order is calendar order. */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatDueDate(key: string): string {
  const [, m, d] = parseKey(key);
  return `${pad(d)}/${pad(m)}`;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). DST-safe: uses UTC dates. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parseKey(from);
  const [ty, tm, td] = parseKey(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** e.g. “Thứ Bảy, 21 tháng 11”. */
export function formatLongDate(key: string): string {
  const [y, m, d] = parseKey(key);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d} tháng ${m}`;
}
