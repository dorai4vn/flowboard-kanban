import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const nav = () => screen.getByRole('navigation', { name: 'Chế độ xem' });
const go = (name: RegExp) => within(nav()).getByRole('button', { name });

describe('board overview', () => {
  it('shows progress by column and the board’s open deadlines', async () => {
    await renderApp();
    const overview = screen.getByRole('region', { name: 'Tổng quan bảng' });
    expect(within(overview).getByRole('progressbar', { name: 'Tiến độ bảng' })).toHaveAttribute('aria-valuenow', '20');
    expect(within(overview).getByText('20%')).toBeInTheDocument();
    for (const t of ['Cần làm 3', 'Đang làm 1', 'Hoàn thành 1']) expect(within(overview).getByText(t)).toBeInTheDocument();
    expect(within(overview).getByText('1 đến hạn hôm nay')).toBeInTheDocument();
    expect(within(overview).getByText('1 quá hạn')).toBeInTheDocument();
  });

  it('updates when a task is completed', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }));
    await user.click(screen.getByRole('menuitem', { name: 'Chuyển sang Hoàn thành' }));
    expect(screen.getByRole('progressbar', { name: 'Tiến độ bảng' })).toHaveAttribute('aria-valuenow', '40');
  });
});

describe('Today view — progress and done group', () => {
  it('tracks progress, lists finished tasks and links to overdue work', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Hôm nay/));
    expect(screen.getByRole('progressbar', { name: 'Tiến độ hôm nay' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Đã xong 0/1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đánh dấu hoàn thành Hoàn thành bài tập buổi 8' }));
    expect(screen.getByText('Đã xong 1/1')).toBeInTheDocument();
    expect(screen.getByText('Bạn đã xong mọi việc đến hạn hôm nay.')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Đã xong hôm nay' })).getByText('Hoàn thành bài tập buổi 8')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xem 1 việc quá hạn' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Quá hạn' })).toBeInTheDocument();
  });
});

describe('Overdue view — groups and reschedule', () => {
  it('groups by lateness and moves a task to today', async () => {
    const { user } = await renderApp();
    await user.click(go(/^Quá hạn/));
    const overdue = screen.getByRole('region', { name: 'Việc quá hạn' });
    expect(within(overdue).getByRole('heading', { level: 3, name: 'Trễ 1 ngày' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dời sang hôm nay Viết báo cáo tuần' }));
    expect(screen.getByText('Không có việc nào quá hạn.')).toBeInTheDocument();
    expect(go(/^Hôm nay/)).toHaveAccessibleName('Hôm nay 2');
    await user.click(go(/^Hôm nay/));
    expect(within(screen.getByRole('list', { name: 'Việc đến hạn hôm nay' })).getByText('Viết báo cáo tuần')).toBeInTheDocument();
  });
});

describe('sidebar', () => {
  it('“Thêm bảng” opens the new board dialog', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Thêm bảng' }));
    expect(screen.getByRole('dialog', { name: 'Tạo bảng mới' })).toBeInTheDocument();
  });
});
