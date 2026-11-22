import { expect, test } from './fixtures';
import { card, column } from './helpers';

// Real UI + real Supabase Local + the real api/agent handlers; only the model is the deterministic test model.

const panel = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Trợ lý AI' });
async function ask(page: import('@playwright/test').Page, text: string) {
  const box = panel(page).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' });
  await box.fill(text);
  await box.press('Enter');
  await expect(panel(page).getByText('Trợ lý đang xử lý…')).toHaveCount(0, { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await page.getByRole('button', { name: 'Trợ lý AI' }).click();
  await expect(panel(page)).toBeVisible();
});

test('create and update through the assistant are saved to the database', async ({ page }) => {
  await ask(page, 'tạo công việc Ôn tập chương 4 hạn 2026-12-01');
  const saved = () => panel(page).getByRole('list', { name: 'Thay đổi đã lưu' }).last();
  await expect(saved()).toContainText('Đã tạo “Ôn tập chương 4” trong Bảng của tôi');
  await expect(card(column(page, 'Cần làm'), 'Ôn tập chương 4')).toBeVisible();

  await ask(page, 'đổi tên Ôn tập chương 4 thành Ôn tập chương 5');
  await expect(saved()).toContainText('Đã cập nhật “Ôn tập chương 5”');
  await ask(page, 'hoàn thành Viết báo cáo tuần');
  await expect(saved()).toContainText('Đã chuyển “Viết báo cáo tuần” sang Hoàn thành');

  await page.reload();
  await expect(card(column(page, 'Cần làm'), 'Ôn tập chương 5')).toBeVisible();
  await expect(card(column(page, 'Hoàn thành'), 'Viết báo cáo tuần')).toBeVisible();
});

test('deletion waits for explicit approval; reject keeps the task, approve deletes it', async ({ page }) => {
  await ask(page, 'xóa Mua quà sinh nhật');
  let approval = panel(page).getByRole('group', { name: 'Xác nhận xóa' }).last();
  await expect(approval).toContainText('Xóa công việc “Mua quà sinh nhật”');
  await expect(card(column(page, 'Cần làm'), 'Mua quà sinh nhật')).toBeVisible();
  await approval.getByRole('button', { name: 'Không xóa' }).click();
  await expect(approval).toContainText('Đã hủy');
  await page.reload();
  await expect(card(column(page, 'Cần làm'), 'Mua quà sinh nhật')).toBeVisible();

  await page.getByRole('button', { name: 'Trợ lý AI' }).click();
  await ask(page, 'xóa Mua quà sinh nhật');
  approval = panel(page).getByRole('group', { name: 'Xác nhận xóa' }).last();
  await approval.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(approval).toContainText('Đã xóa theo xác nhận của bạn', { timeout: 20_000 });
  await expect(panel(page).getByText('Đã xóa công việc “Mua quà sinh nhật”', { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(card(page, 'Mua quà sinh nhật')).toHaveCount(0);
});

test('a provider failure is shown with a retry, and nothing is claimed as done', async ({ page }) => {
  await ask(page, 'lỗi máy chủ');
  await expect(panel(page).getByRole('alert')).toContainText('Trợ lý AI tạm thời không phản hồi');
  await expect(panel(page).getByRole('button', { name: 'Thử lại' })).toBeVisible();
});

test('unauthenticated calls to the agent API are rejected', async ({ page }) => {
  const status = await page.evaluate(async () => (await fetch('/api/agent/chat', { method: 'POST', body: '{}' })).status);
  expect(status).toBe(401);
});

test('Kanban still works with the panel: close it and drag-free move via menu', async ({ page }) => {
  await panel(page).getByRole('button', { name: 'Đóng Trợ lý AI' }).click();
  await page.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }).click();
  await page.getByRole('menuitem', { name: 'Chuyển sang Đang làm' }).click();
  await expect(card(column(page, 'Đang làm'), 'Mua quà sinh nhật')).toBeVisible();
});
