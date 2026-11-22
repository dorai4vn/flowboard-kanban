import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, seededRepository } from '../test/renderApp';

const nav = () => screen.getByRole('navigation', { name: 'Chế độ xem' });
const go = (name: RegExp) => within(nav()).getByRole('button', { name });

describe('M10 review fixes', () => {
  it('cancelling “Thêm bảng” keeps the current view', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    await user.click(screen.getByRole('button', { name: 'Thêm bảng' }));
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(go(/^Hôm nay/)).toHaveAttribute('aria-current', 'page');
  });

  it('creating a board from the sidebar opens it on the board view', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Quá hạn/));
    await user.click(screen.getByRole('button', { name: 'Thêm bảng' }));
    await user.type(screen.getByLabelText('Tên bảng'), 'Đồ án');
    await user.click(screen.getByRole('button', { name: 'Tạo bảng' }));
    expect(go(/^Bảng/)).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('combobox', { name: 'Chọn bảng' })).toHaveDisplayValue('Đồ án');
  });

  it('task titles in focus lists are not headings inside buttons', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    const open = screen.getByRole('button', { name: 'Mở Hoàn thành bài tập buổi 8' });
    expect(within(open).queryByRole('heading')).toBeNull();
  });

  it('after completing the last item, focus moves to the view heading', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    await user.click(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Hoàn thành bài tập buổi 8' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Hôm nay' })).toHaveFocus();
  });

  it('after completing or rescheduling an item, focus moves to the next item', async () => {
    const { user, store } = await renderApp();
    act(() => void store.getState().createTask({ title: 'Trễ thêm', dueDate: '2026-11-20' }, 'todo'));
    await user.click(go(/^Quá hạn/));
    await user.click(screen.getByRole('button', { name: 'Dời sang hôm nay Viết báo cáo tuần' }));
    expect(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Trễ thêm' })).toHaveFocus();
  });

  it('labels the done group by what it contains', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    await user.click(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Hoàn thành bài tập buổi 8' }));
    expect(screen.getByRole('list', { name: 'Đến hạn hôm nay, đã xong' })).toHaveTextContent('Hoàn thành bài tập buổi 8');
  });

  it('an empty board says so instead of “0% … trên 0 công việc”', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Bảng mới' }));
    await user.type(screen.getByLabelText('Tên bảng'), 'Trống');
    await user.click(screen.getByRole('button', { name: 'Tạo bảng' }));
    const overview = screen.getByRole('region', { name: 'Tổng quan bảng' });
    expect(within(overview).getByText('Chưa có công việc nào')).toBeInTheDocument();
    expect(within(overview).queryByText(/trên 0 công việc/)).toBeNull();
  });

  it('a failed complete from the Overdue view is rolled back and explained', async () => {
    const repo = seededRepository();
    repo.failWhen = () => true;
    const { user, store } = await renderApp(repo);
    await user.click(go(/^Quá hạn/));
    await user.click(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Viết báo cáo tuần' }));
    await act(() => store.getState().whenIdle());
    expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được thay đổi, đã hoàn tác.');
    expect(screen.getByRole('region', { name: 'Việc quá hạn' })).toHaveTextContent('Viết báo cáo tuần');
  });

  it('a failed reschedule is rolled back', async () => {
    const repo = seededRepository();
    repo.failWhen = () => true;
    const { user, store } = await renderApp(repo);
    await user.click(go(/^Quá hạn/));
    await user.click(screen.getByRole('button', { name: 'Dời sang hôm nay Viết báo cáo tuần' }));
    await act(() => store.getState().whenIdle());
    expect(screen.getByRole('region', { name: 'Việc quá hạn' })).toHaveTextContent('Viết báo cáo tuần');
    expect(go(/^Hôm nay/)).toHaveAccessibleName('Hôm nay 1');
  });
});
