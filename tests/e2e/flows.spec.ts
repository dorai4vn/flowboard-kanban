import { expect, test } from '@playwright/test';
import { card, column, createTask, dragTo } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FlowBoard', level: 1 })).toBeVisible();
});

test('create → edit → drag to Hoàn thành → survives reload', async ({ page }) => {
  await createTask(page, 'Cần làm', 'E2E nộp bài', { priority: 'Khẩn', label: 'Gấp' });
  const created = card(column(page, 'Cần làm'), 'E2E nộp bài');
  await expect(created).toContainText('Khẩn');
  await expect(created).toContainText('Gấp');

  await created.click();
  const dialog = page.getByRole('dialog', { name: 'Sửa công việc' });
  await dialog.getByLabel('Tiêu đề').fill('E2E nộp bài (sửa)');
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  const edited = card(page, 'E2E nộp bài (sửa)');
  await expect(edited).toBeVisible();

  await dragTo(page, edited, column(page, 'Hoàn thành'));
  await expect(card(column(page, 'Hoàn thành'), 'E2E nộp bài (sửa)')).toBeVisible();
  await expect(card(column(page, 'Cần làm'), 'E2E nộp bài (sửa)')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(card(column(page, 'Hoàn thành'), 'E2E nộp bài (sửa)')).toBeVisible();
});

test('reorders within a column by dragging', async ({ page }) => {
  const todo = column(page, 'Cần làm');
  const titles = () => todo.locator('article p').allTextContents();
  expect((await titles())[0]).toBe('Hoàn thành bài tập buổi 8');
  await dragTo(page, card(todo, 'Mua quà sinh nhật'), card(todo, 'Hoàn thành bài tập buổi 8'));
  await expect.poll(titles).toEqual(['Mua quà sinh nhật', 'Hoàn thành bài tập buổi 8', 'Đọc tài liệu về AI Agent']);
});

test('drags with the keyboard (Space, arrow, Space)', async ({ page }) => {
  await card(page, 'Mua quà sinh nhật').focus();
  const live = page.locator('[id^="DndLiveRegion"]');
  await page.keyboard.press('Space');
  await expect(live).toContainText('Mua quà sinh nhật');
  await page.keyboard.press('ArrowRight');
  await expect(live).toHaveText('Công việc Mua quà sinh nhật đang ở cột Đang làm.');
  await page.keyboard.press('Space');
  await expect(live).toHaveText('Đã thả công việc Mua quà sinh nhật vào cột Đang làm.');
  await expect(card(column(page, 'Đang làm'), 'Mua quà sinh nhật')).toBeVisible();
});

test('search without diacritics, filter by priority, clear', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Tìm kiếm công việc' }).fill('bao cao');
  await expect(page.locator('article')).toHaveCount(1);
  await expect(card(page, 'Viết báo cáo tuần')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm kiếm công việc' }).fill('');

  await page.getByRole('button', { name: 'Lọc', exact: true }).click();
  await page.getByRole('group', { name: 'Bộ lọc' }).getByLabel('Thấp').check();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(card(page, 'Mua quà sinh nhật')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(page.locator('article')).toHaveCount(5);
});

test('today mode focuses on due, overdue and done-today tasks', async ({ page }) => {
  await page.getByRole('button', { name: 'Hôm nay' }).click();
  await expect(page.getByText('Hôm nay: 2 việc cần làm · 1 quá hạn · 1 đã xong')).toBeVisible();
  await expect(card(page, 'Mua quà sinh nhật')).toHaveCount(0);
  await expect(card(page, 'Hoàn thành bài tập buổi 8')).toBeVisible();
  await expect(card(page, 'Viết báo cáo tuần')).toBeVisible();
});

test('new board with its own accent color persists', async ({ page }) => {
  await page.getByRole('button', { name: 'Bảng mới' }).click();
  await page.getByRole('dialog', { name: 'Tạo bảng mới' }).getByLabel('Tên bảng').fill('Đồ án');
  await page.getByRole('button', { name: 'Tạo bảng' }).click();
  await expect(page.getByRole('combobox', { name: 'Chọn bảng' })).toHaveValue(/.+/);
  await expect(page.getByText('Chưa có công việc')).toHaveCount(3);

  await page.getByRole('button', { name: 'Tùy chỉnh bảng' }).click();
  await page.getByRole('radio', { name: 'Màu Hồng' }).click();
  await expect(page.locator('[data-accent]')).toHaveAttribute('data-accent', 'rose');

  await page.reload();
  await expect(page.locator('[data-accent]')).toHaveAttribute('data-accent', 'rose');
  await expect(page.getByRole('combobox', { name: 'Chọn bảng' }).locator('option:checked')).toHaveText('Đồ án');
  await page.getByRole('combobox', { name: 'Chọn bảng' }).selectOption({ label: 'Bảng của tôi' });
  await expect(page.locator('[data-accent]')).toHaveAttribute('data-accent', 'indigo');
});

test('delete a task with confirmation; stays deleted after reload', async ({ page }) => {
  await card(page, 'Mua quà sinh nhật').click();
  await page.getByRole('button', { name: 'Xóa công việc' }).click();
  await page.getByRole('alertdialog', { name: 'Xóa công việc này?' }).getByRole('button', { name: 'Xóa' }).click();
  await expect(card(page, 'Mua quà sinh nhật')).toHaveCount(0);
  await page.reload();
  await expect(card(page, 'Mua quà sinh nhật')).toHaveCount(0);
  await expect(page.locator('article')).toHaveCount(4);
});

test('corrupted saved data is backed up and the app still opens', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('flowboard:state', '{bad'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Dữ liệu cũ bị lỗi, đã sao lưu và tạo bảng mới.');
  await expect(page.locator('article')).toHaveCount(5);
  const backups = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('flowboard:backup-')));
  expect(backups).toHaveLength(1);
});
