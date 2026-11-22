import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FakeRepository } from '../data/fakeRepository';
import type { BoardsState, Mutation } from '../data/mutations';
import type { BoardRepository } from '../data/repository';
import { createSeedState } from '../domain/seed';
import type { Board } from '../domain/types';
import { createBoardStore, setAppStore } from '../store/useBoardStore';
import { AuthGate } from './AuthGate';
import type { AuthClient, AuthUser } from './authClient';

const NOW = new Date(2026, 10, 22, 9, 0);
const userA: AuthUser = { id: 'user-a', email: 'a@example.com', name: 'An Nguyễn', avatarUrl: null };
const userB: AuthUser = { id: 'user-b', email: 'b@example.com', name: 'Bình Trần', avatarUrl: null };

function seeded(rename?: (b: Board) => Board): BoardsState {
  const s = createSeedState(NOW);
  const id = s.boardOrder[0]!;
  return { boards: { [id]: rename ? rename(s.boards[id]!) : s.boards[id]! }, boardOrder: [id] };
}

/** Routes calls to the repository of whoever is signed in, like RLS does on the server. */
class PerUserRepository implements BoardRepository {
  current = '';
  constructor(readonly repos: Record<string, FakeRepository>) {}
  private get repo() {
    return this.repos[this.current]!;
  }
  load(signal: AbortSignal) {
    return this.repo.load(signal);
  }
  ensureStarter(seed: Board, signal: AbortSignal) {
    return this.repo.ensureStarter(seed, signal);
  }
  persist(m: Mutation, signal: AbortSignal) {
    return this.repo.persist(m, signal);
  }
}

class FakeAuth implements AuthClient {
  user: AuthUser | null;
  listeners = new Set<(u: AuthUser | null) => void>();
  signIn = vi.fn(async () => this.signInError);
  signInError: string | null = null;
  signOutCalls = 0;
  pendingGetUser: Promise<AuthUser | null> | null = null;
  constructor(user: AuthUser | null, private readonly repo?: PerUserRepository) {
    this.user = user;
    if (repo && user) repo.current = user.id;
  }
  getUser() {
    return this.pendingGetUser ?? Promise.resolve(this.user);
  }
  onChange(cb: (u: AuthUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  signInWithGoogle() {
    return this.signIn();
  }
  async signOut() {
    this.signOutCalls++;
    this.emit(null);
  }
  emit(u: AuthUser | null) {
    this.user = u;
    if (this.repo && u) this.repo.current = u.id;
    this.listeners.forEach((l) => l(u));
  }
}

function setup(auth: FakeAuth, repo: BoardRepository = new FakeRepository(seeded())) {
  const store = createBoardStore({ repo, now: () => NOW });
  setAppStore(store);
  const user = userEvent.setup();
  render(<AuthGate auth={auth} today="2026-11-22" />);
  return { store, user };
}

describe('AuthGate', () => {
  it('shows a checking screen while the session is being restored', () => {
    const auth = new FakeAuth(null);
    auth.pendingGetUser = new Promise(() => {});
    setup(auth);
    expect(screen.getByText('Đang kiểm tra đăng nhập…')).toBeInTheDocument();
  });

  it('signed out: shows the Google login button and starts the redirect', async () => {
    const auth = new FakeAuth(null);
    const { user } = setup(auth);
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập bằng Google' }));
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Cần làm' })).not.toBeInTheDocument();
  });

  it('shows an error when the Google redirect cannot start', async () => {
    const auth = new FakeAuth(null);
    auth.signInError = 'Không đăng nhập được, vui lòng thử lại.';
    const { user } = setup(auth);
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập bằng Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đăng nhập được, vui lòng thử lại.');
  });

  it('signed in: loads that user board and shows who is signed in', async () => {
    const { store } = setup(new FakeAuth(userA));
    expect(await screen.findByText('Viết báo cáo tuần')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tài khoản An Nguyễn' })).toBeInTheDocument();
    expect(store.getState().userId).toBe('user-a');
  });

  it('switching accounts removes the previous user data before the new data arrives', async () => {
    const repoA = new FakeRepository(seeded((b) => ({ ...b, name: 'Bảng của An' })));
    const repoB = new FakeRepository(seeded((b) => ({ ...b, name: 'Bảng của Bình', tasks: {}, columns: { todo: [], doing: [], done: [] } })));
    const repo = new PerUserRepository({ 'user-a': repoA, 'user-b': repoB });
    const auth = new FakeAuth(userA, repo);
    setup(auth, repo);
    expect(await screen.findByText('Viết báo cáo tuần')).toBeInTheDocument();
    repoB.hold = true;
    act(() => auth.emit(userB));
    expect(screen.queryByText('Viết báo cáo tuần')).not.toBeInTheDocument();
    expect(screen.queryByText('Bảng của An')).not.toBeInTheDocument();
    expect(screen.getByText('Đang tải bảng…')).toBeInTheDocument();
    await act(async () => repoB.release());
    expect(await screen.findByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Bảng của Bình');
    expect(screen.queryByText('Viết báo cáo tuần')).not.toBeInTheDocument();
  });

  it('switching accounts while in the Today view shows none of the previous account’s tasks', async () => {
    const repoA = new FakeRepository(seeded());
    const repoB = new FakeRepository(seeded((b) => ({ ...b, name: 'Bảng của Bình', tasks: {}, columns: { todo: [], doing: [], done: [] } })));
    const repo = new PerUserRepository({ 'user-a': repoA, 'user-b': repoB });
    const auth = new FakeAuth(userA, repo);
    const { user } = setup(auth, repo);
    await screen.findByText('Viết báo cáo tuần');
    await user.click(screen.getByRole('button', { name: /^Hôm nay/ }));
    expect(screen.getByRole('list', { name: 'Việc đến hạn hôm nay' })).toBeInTheDocument();
    act(() => auth.emit(userB));
    expect(await screen.findByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Bảng của Bình');
    expect(screen.queryByText('Hoàn thành bài tập buổi 8')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Việc đến hạn hôm nay' })).not.toBeInTheDocument();
  });

  it('sign out clears the board immediately and returns to the login screen', async () => {
    const auth = new FakeAuth(userA);
    const { user, store } = setup(auth);
    await screen.findByText('Viết báo cáo tuần');
    await user.click(screen.getByRole('button', { name: 'Tài khoản An Nguyễn' }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    expect(auth.signOutCalls).toBe(1);
    expect(await screen.findByRole('button', { name: 'Đăng nhập bằng Google' })).toBeInTheDocument();
    expect(screen.queryByText('Viết báo cáo tuần')).not.toBeInTheDocument();
    expect(store.getState().app.boardOrder).toEqual([]);
  });

  it('a token refresh for the same user does not reload or clear the board', async () => {
    const auth = new FakeAuth(userA);
    const { store } = setup(auth);
    await screen.findByText('Viết báo cáo tuần');
    const app = store.getState().app;
    act(() => auth.emit({ ...userA }));
    expect(store.getState().app).toBe(app);
  });

  it('a failed OAuth code exchange returns to the login screen with an explanation', async () => {
    const auth = new FakeAuth(null);
    auth.pendingGetUser = Promise.reject(new Error('exchange failed'));
    setup(auth);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đăng nhập được, vui lòng thử lại.');
    expect(screen.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeInTheDocument();
  });

  it('a failed load shows an error with a working retry button', async () => {
    const repo = new FakeRepository(seeded());
    repo.failLoad = true;
    const { user } = setup(new FakeAuth(userA), repo);
    expect(await screen.findByText('Không tải được dữ liệu.')).toBeInTheDocument();
    repo.failLoad = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Viết báo cáo tuần')).toBeInTheDocument());
  });
});
