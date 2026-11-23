import { expect, test } from './fixtures';

test('mobile: the assistant opens full screen and answers', async ({ page }) => {
  await page.getByRole('button', { name: 'Trợ lý AI' }).click();
  const panel = page.getByRole('complementary', { name: 'Trợ lý AI' });
  const box = await panel.boundingBox();
  const vp = page.viewportSize()!;
  expect(Math.round(box!.width)).toBe(vp.width);
  await panel.getByRole('button', { name: 'Việc nào đang quá hạn?' }).click();
  await expect(panel.getByText(/Có 1 việc: Viết báo cáo tuần/)).toBeVisible({ timeout: 20_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await panel.getByRole('button', { name: 'Đóng Trợ lý AI' }).click();
  await expect(page.getByRole('navigation', { name: 'Chế độ xem' })).toBeVisible();
});
