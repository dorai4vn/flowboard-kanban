import { expect, test } from './fixtures';
import { card, column, settled } from './helpers';

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Chế độ xem' });

test('Today and Overdue views list the right tasks with live counts', async ({ page }) => {
  await expect(nav(page).getByRole('button', { name: 'Hôm nay 1' })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Quá hạn 1' })).toBeVisible();

  await nav(page).getByRole('button', { name: /^Hôm nay/ }).click();
  const today = page.getByRole('list', { name: 'Việc đến hạn hôm nay' });
  await expect(today.getByRole('listitem')).toHaveCount(1);
  await expect(today).toContainText('Hoàn thành bài tập buổi 8');
  await expect(today).toContainText('Bảng của tôi');

  await nav(page).getByRole('button', { name: /^Quá hạn/ }).click();
  const late = page.getByRole('region', { name: 'Việc quá hạn' });
  await expect(late.getByRole('listitem')).toHaveCount(1);
  await expect(late).toContainText('Viết báo cáo tuần');
  await expect(late).toContainText('Trễ 1 ngày');
});

test('completing an overdue task saves it to Hoàn thành and survives reload', async ({ page }) => {
  await nav(page).getByRole('button', { name: /^Quá hạn/ }).click();
  await page.getByRole('button', { name: 'Đánh dấu hoàn thành Viết báo cáo tuần' }).click();
  await expect(page.getByText('Không có việc nào quá hạn.')).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Quá hạn 0' })).toBeVisible();
  await settled(page);
  await page.reload();
  await expect(card(column(page, 'Hoàn thành'), 'Viết báo cáo tuần')).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Quá hạn 0' })).toBeVisible();
});

test('a task from another board opens for editing from Today', async ({ page }) => {
  await page.getByRole('button', { name: 'Bảng mới' }).click();
  await page.getByRole('dialog', { name: 'Tạo bảng mới' }).getByLabel('Tên bảng').fill('Đồ án');
  await page.getByRole('button', { name: 'Tạo bảng' }).click();
  await expect(page.getByText('Chưa có công việc')).toHaveCount(3);
  await nav(page).getByRole('button', { name: /^Hôm nay/ }).click();
  await page.getByRole('button', { name: 'Mở Hoàn thành bài tập buổi 8' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sửa công việc' });
  await dialog.getByLabel('Tiêu đề').fill('Hoàn thành bài tập buổi 8 (đã sửa)');
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByRole('list', { name: 'Việc đến hạn hôm nay' })).toContainText('(đã sửa)');
  await settled(page);
  await page.reload();
  await nav(page).getByRole('button', { name: /^Hôm nay/ }).click();
  await expect(page.getByRole('list', { name: 'Việc đến hạn hôm nay' })).toContainText('Hoàn thành bài tập buổi 8 (đã sửa)');
});
