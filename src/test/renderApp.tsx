import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { FakeRepository } from '../data/fakeRepository';
import { createSeedState } from '../domain/seed';
import { createBoardStore, setAppStore } from '../store/useBoardStore';

export const TEST_NOW = new Date(2026, 10, 21, 9, 0);

export function seededRepository(): FakeRepository {
  const seed = createSeedState(TEST_NOW);
  return new FakeRepository({ boards: seed.boards, boardOrder: seed.boardOrder });
}

/** Render the real App, signed in as a test user, against an in-memory repository seeded with the sample board. */
export async function renderApp(repo: FakeRepository = seededRepository()) {
  const store = createBoardStore({ repo, now: () => TEST_NOW });
  setAppStore(store);
  await store.getState().switchUser('test-user');
  const user = userEvent.setup();
  const utils = render(<App today="2026-11-21" />);
  return { ...utils, user, store, repo };
}
