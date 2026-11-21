import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('review fixes', () => {
  it('renders dialogs outside the blurred header (fixed positioning uses the viewport)', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Bảng mới' }));
    expect(screen.getByRole('dialog', { name: 'Tạo bảng mới' }).closest('header')).toBeNull();
  });

  it('keeps the accent color available to portalled dialogs', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Tùy chỉnh bảng' }));
    await user.click(screen.getByRole('radio', { name: 'Màu Hồng' }));
    expect(document.documentElement).toHaveAttribute('data-accent', 'rose');
  });

  it('Escape in the delete confirmation closes only the confirmation', async () => {
    const { user } = renderApp();
    await user.click(screen.getByText('Mua quà sinh nhật'));
    await user.type(screen.getByLabelText('Tiêu đề'), ' (đang sửa)');
    await user.click(screen.getByRole('button', { name: 'Xóa công việc' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Sửa công việc' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Mua quà sinh nhật (đang sửa)');
  });

  it('Tab stays inside the confirmation dialog', async () => {
    const { user } = renderApp();
    await user.click(screen.getByText('Mua quà sinh nhật'));
    await user.click(screen.getByRole('button', { name: 'Xóa công việc' }));
    const confirm = screen.getByRole('alertdialog');
    within(confirm).getByRole('button', { name: 'Xóa' }).focus();
    await user.tab();
    expect(confirm.contains(document.activeElement)).toBe(true);
  });

  it('a task card exposes priority and deadline to screen readers', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /Viết báo cáo tuần.*Khẩn.*Hạn chót 20\/11, quá hạn/ })).toBeInTheDocument();
  });
});
