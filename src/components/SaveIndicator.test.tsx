import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, seededRepository } from '../test/renderApp';

describe('saving indicator', () => {
  it('shows "Đang lưu…" while a write is pending and warns before leaving the page', async () => {
    const repo = seededRepository();
    const { user, store } = await renderApp(repo);
    repo.hold = true;
    await user.click(screen.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }));
    await user.click(screen.getByRole('menuitem', { name: 'Chuyển sang Đang làm' }));
    expect(screen.getByText('Đang lưu…')).toBeInTheDocument();

    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await act(async () => {
      repo.release();
      await store.getState().whenIdle();
    });
    expect(screen.queryByText('Đang lưu…')).not.toBeInTheDocument();
    const later = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
});
