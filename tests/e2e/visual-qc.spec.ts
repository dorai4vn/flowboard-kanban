import { test } from './fixtures';
import { createTask, settled } from './helpers';

// Visual QC screenshots: `npm run qc:screens`. Skipped in the normal E2E run.
const OUT = process.env.QC_OUT ?? '';
test.skip(!OUT, 'set QC_OUT to capture visual QC screenshots');
const key = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const LONG = 'Chuẩn bị báo cáo tổng kết dự án cuối kỳ gồm đầy đủ số liệu, biểu đồ, phần đánh giá rủi ro và kế hoạch cải tiến cho cả nhóm';

test.use({ deviceScaleFactor: 2 });

for (const vp of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 412, height: 915 },
]) {
  test(`visual QC ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await createTask(page, 'Cần làm', LONG, { priority: 'Khẩn', label: 'Công việc', due: key(-10) });
    await createTask(page, 'Đang làm', 'Ôn tập chương 3', { priority: 'Cao', label: 'Học tập', due: key(-3) });
    await createTask(page, 'Hoàn thành', 'Gửi email cho thầy', { priority: 'Trung bình', due: key(0) });
    await createTask(page, 'Cần làm', 'Đặt lịch khám răng', { due: key(1) });
    await settled(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const nav = page.getByRole('navigation', { name: 'Chế độ xem' });
    const top = () => page.evaluate(() => window.scrollTo(0, 0));
    await top();
    await page.screenshot({ path: `${OUT}/${vp.name}-board.png`, fullPage: vp.name === 'mobile' });
    await nav.getByRole('button', { name: /^Hôm nay/ }).click();
    await top();
    await page.screenshot({ path: `${OUT}/${vp.name}-today.png`, fullPage: true });
    await nav.getByRole('button', { name: /^Quá hạn/ }).click();
    await top();
    await page.screenshot({ path: `${OUT}/${vp.name}-overdue.png`, fullPage: true });
    await nav.getByRole('button', { name: /^Bảng/ }).click();
    await page.getByRole('button', { name: 'Thêm công việc vào cột Cần làm' }).click();
    await page.getByRole('dialog').getByLabel('Tiêu đề').fill('Viết kế hoạch tuần mới');
    await page.screenshot({ path: `${OUT}/${vp.name}-dialog-create.png` });
    await page.keyboard.press('Escape');
    if (vp.name === 'mobile') await page.getByRole('tab', { name: /Đang làm/ }).click();
    await page.locator('article', { hasText: 'Ôn tập chương 3' }).click();
    await page.screenshot({ path: `${OUT}/${vp.name}-dialog-edit.png` });
  });
}
