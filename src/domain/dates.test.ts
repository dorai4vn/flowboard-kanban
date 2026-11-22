import { describe, expect, it } from 'vitest';
import { addDays, compareDateKeys, formatDueDate, toLocalDateKey } from './dates';

describe('dates', () => {
  it('uses the local calendar day, even late at night', () => {
    expect(toLocalDateKey(new Date(2026, 10, 21, 23, 59))).toBe('2026-11-21');
    expect(toLocalDateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('compares date keys', () => {
    expect(compareDateKeys('2026-11-20', '2026-11-21')).toBeLessThan(0);
    expect(compareDateKeys('2026-11-21', '2026-11-21')).toBe(0);
    expect(compareDateKeys('2026-12-01', '2026-11-30')).toBeGreaterThan(0);
  });

  it('formats a due date as dd/MM', () => {
    expect(formatDueDate('2026-11-05')).toBe('05/11');
  });
});

describe('daysBetween', () => {
  it('counts calendar days between two date keys, across months and years', async () => {
    const { daysBetween } = await import('./dates');
    expect(daysBetween('2026-11-20', '2026-11-22')).toBe(2);
    expect(daysBetween('2026-11-22', '2026-11-22')).toBe(0);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-11-22', '2026-11-20')).toBe(-2);
  });
});
