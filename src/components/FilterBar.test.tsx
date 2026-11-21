import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const SEED = ['Hoàn thành bài tập buổi 8', 'Đọc tài liệu về AI Agent', 'Mua quà sinh nhật', 'Viết báo cáo tuần', 'Thiết lập dự án FlowBoard'];
const visible = () => SEED.filter((t) => screen.queryByText(t));

describe('search and filters', () => {
  it('searches without diacritics', async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole('searchbox', { name: 'Tìm kiếm công việc' }), 'bao cao');
    expect(visible()).toEqual(['Viết báo cáo tuần']);
    expect(screen.getAllByText('Không tìm thấy công việc phù hợp')).toHaveLength(2);
  });

  it('"/" focuses the search box', async () => {
    const { user } = renderApp();
    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Tìm kiếm công việc' })).toHaveFocus();
  });

  it('filters by priority, label and deadline, then clears', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: /^Lọc/ }));
    const panel = screen.getByRole('group', { name: 'Bộ lọc' });
    await user.click(within(panel).getByRole('checkbox', { name: 'Khẩn' }));
    expect(visible()).toEqual(['Viết báo cáo tuần']);
    await user.click(within(panel).getByRole('checkbox', { name: 'Khẩn' }));

    await user.click(within(panel).getByRole('checkbox', { name: 'Cá nhân' }));
    expect(visible()).toEqual(['Mua quà sinh nhật']);
    await user.click(within(panel).getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(visible()).toEqual(SEED);

    await user.click(within(panel).getByRole('radio', { name: 'Không có hạn' }));
    expect(visible()).toEqual(['Mua quà sinh nhật', 'Thiết lập dự án FlowBoard']);
    await user.click(within(panel).getByRole('radio', { name: 'Quá hạn' }));
    expect(visible()).toEqual(['Viết báo cáo tuần']);
    expect(screen.getByRole('button', { name: 'Lọc (1)' })).toBeInTheDocument();
  });

  it('today mode shows due, overdue and completed-today tasks with a summary', async () => {
    const { user } = renderApp();
    const toggle = screen.getByRole('button', { name: 'Hôm nay' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(visible()).toEqual(['Hoàn thành bài tập buổi 8', 'Viết báo cáo tuần', 'Thiết lập dự án FlowBoard']);
    expect(screen.getByText('Hôm nay: 2 việc cần làm · 1 quá hạn · 1 đã xong')).toBeInTheDocument();
    await user.click(toggle);
    expect(visible()).toEqual(SEED);
  });
});

describe('moving tasks without dragging', () => {
  it('moves a task to another column from its menu', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }));
    await user.click(screen.getByRole('menuitem', { name: 'Chuyển sang Đang làm' }));
    expect(within(screen.getByRole('region', { name: 'Đang làm' })).getByText('Mua quà sinh nhật')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cần làm' })).queryByText('Mua quà sinh nhật')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers only the other two columns', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Chuyển công việc Viết báo cáo tuần' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Chuyển sang Cần làm', 'Chuyển sang Hoàn thành']);
  });
});

describe('mobile column tabs', () => {
  it('has a tab per column with counts and selects one', async () => {
    const { user } = renderApp();
    const tabs = within(screen.getByRole('tablist', { name: 'Cột' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Cần làm3', 'Đang làm1', 'Hoàn thành1']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await user.click(tabs[2]!);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });
});
