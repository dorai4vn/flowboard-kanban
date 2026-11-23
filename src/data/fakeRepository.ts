import type { Board } from '../domain/types.js';
import { applyMutation, type BoardsState, type Mutation } from './mutations.js';
import { RepositoryError, type BoardRepository } from './repository.js';

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

/**
 * In-memory repository for unit/component tests only. `hold = true` keeps every request pending until
 * `release()` is called, which makes slow networks and races reproducible.
 */
export class FakeRepository implements BoardRepository {
  state: BoardsState;
  hold = false;
  failLoad = false;
  failWhen: (m: Mutation, index: number) => boolean = () => false;
  /** Simulate a write that the server committed but whose response was lost. */
  failAfterCommitWhen: (m: Mutation, index: number) => boolean = () => false;
  readonly persisted: Mutation[] = [];
  readonly signals: AbortSignal[] = [];
  starterCalls = 0;
  inFlight = 0;
  maxInFlight = 0;
  private gates: Deferred[] = [];
  private calls = 0;

  constructor(initial: BoardsState = { boards: {}, boardOrder: [] }) {
    this.state = structuredClone(initial);
  }

  /** Let the oldest held request continue. */
  release(): void {
    this.gates.shift()?.resolve();
  }

  get waiting(): number {
    return this.gates.length;
  }

  private async gate(signal: AbortSignal) {
    this.signals.push(signal);
    if (!this.hold) return;
    const d = deferred();
    this.gates.push(d);
    await d.promise;
  }

  async load(signal: AbortSignal): Promise<BoardsState> {
    await this.gate(signal);
    if (this.failLoad) throw new RepositoryError();
    return structuredClone(this.state);
  }

  async ensureStarter(seed: Board, signal: AbortSignal): Promise<void> {
    await this.gate(signal);
    this.starterCalls++;
    if (this.state.boardOrder.length === 0) this.state = applyMutation(this.state, { type: 'createBoard', board: structuredClone(seed) });
  }

  async persist(m: Mutation, signal: AbortSignal): Promise<void> {
    const index = this.calls++;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await this.gate(signal);
      if (this.failWhen(m, index)) throw new RepositoryError();
      this.persisted.push(m);
      this.state = applyMutation(this.state, structuredClone(m));
      if (this.failAfterCommitWhen(m, index)) throw new RepositoryError();
    } finally {
      this.inFlight--;
    }
  }
}
