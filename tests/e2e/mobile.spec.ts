import { expect, test } from './fixtures';
import { card, column } from './helpers';


test('mobile: column tabs show one column at a time', async ({ page }) => {
  await expect(column(page, 'Cần làm')).toBeVisible();
  await expect(column(page, 'Đang làm')).toBeHidden();
  await page.getByRole('tab', { name: /Hoàn thành/ }).click();
  await expect(column(page, 'Hoàn thành')).toBeVisible();
  await expect(column(page, 'Cần làm')).toBeHidden();
});

test('mobile: move a task with the menu instead of dragging', async ({ page }) => {
  await page.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }).click();
  await page.getByRole('menuitem', { name: 'Chuyển sang Đang làm' }).click();
  await page.getByRole('tab', { name: /Đang làm/ }).click();
  await expect(card(column(page, 'Đang làm'), 'Mua quà sinh nhật')).toBeVisible();
});

test('mobile: no horizontal scrolling and the task dialog fits', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Thêm công việc vào cột Cần làm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Công việc mới' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
});

test('mobile: bottom navigation reaches Today and Overdue', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Chế độ xem' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: /^Quá hạn/ }).click();
  await expect(page.getByRole('list', { name: 'Việc quá hạn' })).toContainText('Viết báo cáo tuần');
  await nav.getByRole('button', { name: /^Hôm nay/ }).click();
  await expect(page.getByRole('list', { name: 'Việc đến hạn hôm nay' })).toContainText('Hoàn thành bài tập buổi 8');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
