import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const goOffline = () => act(() => void window.dispatchEvent(new Event('offline')));
const goOnline = () => act(() => void window.dispatchEvent(new Event('online')));

describe('offline read-only mode', () => {
  it('browser offline/online events toggle a banner and the store flag', async () => {
    const { store } = await renderApp();
    goOffline();
    expect(screen.getByText('Mất kết nối – đang ở chế độ chỉ đọc.')).toBeInTheDocument();
    expect(store.getState().online).toBe(false);
    goOnline();
    expect(screen.queryByText('Mất kết nối – đang ở chế độ chỉ đọc.')).not.toBeInTheDocument();
    expect(store.getState().online).toBe(true);
  });

  it('disables adding, moving and creating boards while offline', async () => {
    await renderApp();
    goOffline();
    for (const name of ['Thêm công việc vào cột Cần làm', 'Thêm công việc vào cột Đang làm', 'Thêm công việc vào cột Hoàn thành', 'Bảng mới', 'Chuyển công việc Mua quà sinh nhật']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /Mua quà sinh nhật.*Thấp/ })).toHaveAttribute('aria-disabled', 'true');
    goOnline();
    expect(screen.getByRole('button', { name: 'Bảng mới' })).toBeEnabled();
  });

  it('a task can still be opened but saving explains that it is offline', async () => {
    const { user } = await renderApp();
    goOffline();
    await user.click(screen.getByText('Mua quà sinh nhật'));
    const dialog = screen.getByRole('dialog', { name: 'Sửa công việc' });
    await user.type(within(dialog).getByLabelText('Tiêu đề'), ' 2');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Đang offline, không thể chỉnh sửa.');
    expect(screen.getAllByText('Mua quà sinh nhật').length).toBeGreaterThan(0);
  });
});
