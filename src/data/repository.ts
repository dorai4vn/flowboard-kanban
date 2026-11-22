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
