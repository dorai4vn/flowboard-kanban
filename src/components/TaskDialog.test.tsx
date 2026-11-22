import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const column = (name: string) => screen.getByRole('region', { name });

describe('task dialog', () => {
  it('creates a task with priority, deadline and label', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Thêm công việc vào cột Cần làm' }));
    const dialog = screen.getByRole('dialog', { name: 'Công việc mới' });
    expect(within(dialog).getByLabelText('Tiêu đề')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Tiêu đề'), 'Nộp bài tập');
    await user.type(within(dialog).getByLabelText('Mô tả'), 'Nộp trên LMS');
    await user.selectOptions(within(dialog).getByLabelText('Độ ưu tiên'), 'Khẩn');
    await user.type(within(dialog).getByLabelText('Hạn chót'), '2026-11-25');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Học tập' }));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const card = within(column('Cần làm')).getByText('Nộp bài tập').closest('article')!;
    expect(within(card).getByText('Khẩn')).toBeInTheDocument();
    expect(within(card).getByText('Học tập')).toBeInTheDocument();
    expect(within(card).getByLabelText('Hạn chót 25/11')).toBeInTheDocument();
  });

  it('adds the task to the column whose add button was used', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Thêm công việc vào cột Đang làm' }));
    await user.type(screen.getByLabelText('Tiêu đề'), 'Đang viết code{Enter}');
    expect(within(column('Đang làm')).getByText('Đang viết code')).toBeInTheDocument();
  });

  it('keeps the dialog open and shows an error for a blank title', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Thêm công việc vào cột Cần làm' }));
    await user.type(screen.getByLabelText('Tiêu đề'), '   ');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập tiêu đề');
    expect(screen.getByRole('dialog', { name: 'Công việc mới' })).toBeInTheDocument();
  });

  it('creates a new label from the dialog and selects it', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Thêm công việc vào cột Cần làm' }));
    await user.type(screen.getByLabelText('Tiêu đề'), 'Đi chợ');
    await user.type(screen.getByLabelText('Tên nhãn mới'), 'Nhà');
    await user.click(screen.getByRole('button', { name: 'Thêm nhãn' }));
    expect(screen.getByRole('checkbox', { name: 'Nhà' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    const card = within(column('Cần làm')).getByText('Đi chợ').closest('article')!;
    expect(within(card).getByText('Nhà')).toBeInTheDocument();
  });

  it('edits an existing task', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByText('Mua quà sinh nhật'));
    const dialog = screen.getByRole('dialog', { name: 'Sửa công việc' });
    const title = within(dialog).getByLabelText('Tiêu đề');
    expect(title).toHaveValue('Mua quà sinh nhật');
    await user.clear(title);
    await user.type(title, 'Mua quà cho mẹ');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(screen.getByText('Mua quà cho mẹ')).toBeInTheDocument();
    expect(screen.queryByText('Mua quà sinh nhật')).not.toBeInTheDocument();
  });

  it('cancel and Escape discard changes', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByText('Mua quà sinh nhật'));
    await user.type(screen.getByLabelText('Tiêu đề'), ' XYZ');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Mua quà sinh nhật')).toBeInTheDocument();
  });

  it('deletes a task after confirmation', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByText('Mua quà sinh nhật'));
    await user.click(screen.getByRole('button', { name: 'Xóa công việc' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Xóa công việc này?' });
    await user.click(within(confirm).getByRole('button', { name: 'Xóa' }));
    expect(screen.queryByText('Mua quà sinh nhật')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a card with the keyboard', async () => {
    const { user } = await renderApp();
    const card = screen.getByText('Mua quà sinh nhật').closest('article')!;
    card.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Sửa công việc' })).toBeInTheDocument();
  });
});
