import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, seededRepository } from '../test/renderApp';

describe('board layout', () => {
  it('shows the three fixed columns with their tasks', async () => {
    await renderApp();
    for (const name of ['Cần làm', 'Đang làm', 'Hoàn thành']) {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(name) })).toBeInTheDocument();
    }
    const todo = screen.getByRole('region', { name: 'Cần làm' });
    expect(within(todo).getByText('Hoàn thành bài tập buổi 8')).toBeInTheDocument();
    expect(within(todo).getByText('Cao')).toBeInTheDocument();
  });

  it('marks overdue and due-today dates', async () => {
    await renderApp();
    expect(screen.getByLabelText('Hạn chót 20/11, quá hạn')).toBeInTheDocument();
    expect(screen.getByLabelText('Hạn chót 21/11, hôm nay')).toBeInTheDocument();
  });

  it('changes the board accent color', async () => {
    const { user, container } = await renderApp();
    expect(container.querySelector('[data-accent]')).toHaveAttribute('data-accent', 'indigo');
    await user.click(screen.getByRole('button', { name: 'Tùy chỉnh bảng' }));
    await user.click(screen.getByRole('radio', { name: 'Màu Ngọc lục bảo' }));
    expect(container.querySelector('[data-accent]')).toHaveAttribute('data-accent', 'emerald');
  });

  it('creates a new board and switches to it', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Bảng mới' }));
    const dialog = screen.getByRole('dialog', { name: 'Tạo bảng mới' });
    await user.type(within(dialog).getByLabelText('Tên bảng'), 'Đồ án');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo bảng' }));
    expect(screen.getByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Đồ án');
    expect(screen.getAllByText('Chưa có công việc')).toHaveLength(3);
  });

  it('shows a blank-name error when creating a board', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Bảng mới' }));
    await user.click(screen.getByRole('button', { name: 'Tạo bảng' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập tên bảng');
  });

  it('renames and deletes a board with confirmation', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Tùy chỉnh bảng' }));
    const name = screen.getByLabelText('Đổi tên bảng');
    await user.clear(name);
    await user.type(name, 'Việc nhà{Enter}');
    expect(screen.getByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Việc nhà');
    await user.click(screen.getByRole('button', { name: 'Xóa bảng' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xóa' }));
    expect(screen.getByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Bảng của tôi');
  });

  it('rolls back a failed save, shows a notice and lets it be dismissed', async () => {
    const repo = seededRepository();
    repo.failWhen = () => true;
    const { user, store } = await renderApp(repo);
    await user.click(screen.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }));
    await user.click(screen.getByRole('menuitem', { name: 'Chuyển sang Hoàn thành' }));
    await act(() => store.getState().whenIdle());
    expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được thay đổi, đã hoàn tác.');
    expect(within(screen.getByRole('region', { name: 'Cần làm' })).getByText('Mua quà sinh nhật')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByText(/Không lưu được/)).not.toBeInTheDocument();
  });
});
