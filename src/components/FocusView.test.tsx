import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const nav = () => screen.getByRole('navigation', { name: 'Chế độ xem' });
const go = (name: RegExp) => within(nav()).getByRole('button', { name });

describe('navigation', () => {
  it('offers Board, Today and Overdue with live counts; Board is the default', async () => {
    await renderApp();
    expect(go(/^Bảng/)).toHaveAttribute('aria-current', 'page');
    expect(go(/^Hôm nay/)).toHaveAccessibleName('Hôm nay 1');
    expect(go(/^Quá hạn/)).toHaveAccessibleName('Quá hạn 1');
  });

  it('lists the boards in the sidebar and opens one', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Bảng mới' }));
    await user.type(screen.getByLabelText('Tên bảng'), 'Đồ án');
    await user.click(screen.getByRole('button', { name: 'Tạo bảng' }));
    await user.click(screen.getByRole('button', { name: 'Mở bảng Bảng của tôi' }));
    expect(screen.getByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Bảng của tôi');
  });
});

describe('Today view', () => {
  it('shows the date and only tasks due today that are not done', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    expect(go(/^Hôm nay/)).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 2, name: 'Hôm nay' })).toBeInTheDocument();
    expect(screen.getByText('Thứ Bảy, 21 tháng 11')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Việc đến hạn hôm nay' });
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('h3')?.textContent)).toEqual(['Hoàn thành bài tập buổi 8']);
    expect(within(list).getByText('Bảng của tôi')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cần làm' })).not.toBeInTheDocument();
  });

  it('opens a task for editing from the list', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    await user.click(screen.getByRole('button', { name: 'Mở Hoàn thành bài tập buổi 8' }));
    expect(screen.getByRole('dialog', { name: 'Sửa công việc' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Hoàn thành bài tập buổi 8');
  });

  it('opening a task of another board switches the open board to it', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Bảng mới' }));
    await user.type(screen.getByLabelText('Tên bảng'), 'Khác');
    await user.click(screen.getByRole('button', { name: 'Tạo bảng' }));
    await user.click(go(/^Hôm nay/));
    await user.click(screen.getByRole('button', { name: 'Mở Hoàn thành bài tập buổi 8' }));
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Hoàn thành bài tập buổi 8');
    await user.keyboard('{Escape}');
    await user.click(go(/^Bảng/));
    expect(screen.getByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Bảng của tôi');
  });

  it('empty state points back to the board', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    await user.click(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Hoàn thành bài tập buổi 8' }));
    expect(screen.getByText('Không có việc nào đến hạn hôm nay.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Về bảng công việc' }));
    expect(screen.getByRole('region', { name: 'Hoàn thành' })).toHaveTextContent('Hoàn thành bài tập buổi 8');
  });
});

describe('Overdue view', () => {
  it('lists overdue, unfinished tasks with how late they are', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Quá hạn/));
    expect(screen.getByRole('heading', { level: 2, name: 'Quá hạn' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Việc quá hạn' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Viết báo cáo tuần')).toBeInTheDocument();
    expect(within(list).getByText('Trễ 1 ngày')).toBeInTheDocument();
    expect(within(list).getByText('Khẩn')).toBeInTheDocument();
  });

  it('completing a task removes it, updates the count and moves it to Hoàn thành', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Quá hạn/));
    await user.click(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Viết báo cáo tuần' }));
    expect(screen.getByText('Không có việc nào quá hạn.')).toBeInTheDocument();
    expect(go(/^Quá hạn/)).toHaveAccessibleName('Quá hạn 0');
    await user.click(go(/^Bảng/));
    expect(within(screen.getByRole('region', { name: 'Hoàn thành' })).getByText('Viết báo cáo tuần')).toBeInTheDocument();
  });

  it('cannot complete tasks while offline', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Quá hạn/));
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Viết báo cáo tuần' })).toBeDisabled();
  });
});
