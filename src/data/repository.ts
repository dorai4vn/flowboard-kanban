import type { Board } from '../domain/types';
import type { BoardsState, Mutation } from './mutations';

/** Where the signed-in user's boards live. Implementations must throw on failure and honour `signal`. */
export interface BoardRepository {
  load(signal: AbortSignal): Promise<BoardsState>;
  /** Create `seed` only if the account has no boards yet (idempotent across tabs/reloads). */
  ensureStarter(seed: Board, signal: AbortSignal): Promise<void>;
  persist(m: Mutation, signal: AbortSignal): Promise<void>;
}

/** Thrown by repositories; deliberately carries no database details. */
export class RepositoryError extends Error {
  constructor() {
    super('repository request failed');
    this.name = 'RepositoryError';
  }
}

/** Upper bound for one request: a hung request must not block the write queue forever. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** A signal that aborts when `signal` aborts (sign-out, user switch) or after `ms`. */
export function withTimeout(signal: AbortSignal, ms: number = REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort(signal.reason);
    return controller.signal;
  }
  const timer = setTimeout(() => controller.abort(new DOMException('request timed out', 'TimeoutError')), ms);
  const follow = () => controller.abort(signal.reason);
  signal.addEventListener('abort', follow, { once: true });
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', follow);
    },
    { once: true },
  );
  return controller.signal;
}
