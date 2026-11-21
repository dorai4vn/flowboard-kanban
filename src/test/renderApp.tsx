import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createMemoryStorage } from '../store/memoryStorage';
import { createBoardStore, setAppStore } from '../store/useBoardStore';

export const TEST_NOW = new Date(2026, 10, 21, 9, 0);

/** Render the real App against a fresh in-memory store (seeded with the sample board). */
export function renderApp(initial: Record<string, string> = {}) {
  const storage = createMemoryStorage(initial);
  const store = createBoardStore(storage, () => TEST_NOW);
  setAppStore(store);
  const user = userEvent.setup();
  const utils = render(<App today="2026-11-21" />);
  return { ...utils, user, store, storage };
}
