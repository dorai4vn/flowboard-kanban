import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, withTimeout } from './repository';

afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('aborts a request that hangs longer than the timeout', () => {
    vi.useFakeTimers();
    const s = withTimeout(new AbortController().signal, 1000);
    vi.advanceTimersByTime(999);
    expect(s.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(s.aborted).toBe(true);
  });

  it('still follows the session signal (sign-out cancels immediately)', () => {
    const parent = new AbortController();
    const s = withTimeout(parent.signal, 60_000);
    parent.abort();
    expect(s.aborted).toBe(true);
  });

  it('uses a 15 second default', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(15_000);
  });
});
