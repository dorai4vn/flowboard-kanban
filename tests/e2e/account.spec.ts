import { test as base } from '@playwright/test';
import { AUTH_STORAGE_KEY } from '../../src/lib/supabase';
import { applySession, expect, newAccount, test } from './fixtures';
import { card, column, createTask, settled } from './helpers';

base('signed out: shows the Google login and starts the Supabase OAuth flow', async ({ page }) => {
  await page.goto('/');
  const login = page.getByRole('button', { name: 'Đăng nhập bằng Google' });
  await expect(login).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  const authorize = page.waitForRequest((r) => r.url().includes('/auth/v1/authorize') && r.url().includes('provider=google'));
  await login.click();
  const url = new URL((await authorize).url());
  expect(url.searchParams.get('redirect_to')).toBe('http://localhost:4173');
  expect(url.searchParams.get('code_challenge_method')).toBe('s256');
});

test('data lives in Supabase: a second browser of the same user sees it', async ({ page, account, browser }) => {
  await createTask(page, 'Đang làm', 'Lưu trên Supabase', { priority: 'Cao' });
  await settled(page);
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await applySession(page2, account);
  await page2.goto('/');
  await expect(card(column(page2, 'Đang làm'), 'Lưu trên Supabase')).toBeVisible();
  await other.close();
});

test('sign out clears the board; another account never sees the first one', async ({ page }) => {
  await createTask(page, 'Cần làm', 'Bí mật của A');
  await settled(page);
  await page.getByRole('button', { name: /^Tài khoản / }).click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
  await expect(page.getByText('Bí mật của A')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), AUTH_STORAGE_KEY)).toBeNull();

  const b = await newAccount('b');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [AUTH_STORAGE_KEY, b.sessionJson] as const);
  await page.reload();
  await expect(page.locator('article')).toHaveCount(5);
  await expect(page.getByText('Bí mật của A')).toHaveCount(0);
});

test('slow network: several quick moves are all saved in order', async ({ page }) => {
  await page.route('**/rest/v1/rpc/move_task', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  const move = async (title: string, to: string) => {
    await page.getByRole('button', { name: `Chuyển công việc ${title}` }).click();
    await page.getByRole('menuitem', { name: `Chuyển sang ${to}` }).click();
  };
  await move('Mua quà sinh nhật', 'Đang làm');
  await move('Mua quà sinh nhật', 'Hoàn thành');
  await move('Đọc tài liệu về AI Agent', 'Hoàn thành');
  await expect(page.getByText('Đang lưu…')).toBeVisible();
  await settled(page);
  await page.unroute('**/rest/v1/rpc/move_task');
  await page.reload();
  const done = column(page, 'Hoàn thành');
  await expect(done.locator('article p')).toHaveText(['Thiết lập dự án FlowBoard', 'Mua quà sinh nhật', 'Đọc tài liệu về AI Agent']);
});

test('a failed save is rolled back and explained', async ({ page }) => {
  await page.route('**/rest/v1/rpc/move_task', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.getByRole('button', { name: 'Chuyển công việc Mua quà sinh nhật' }).click();
  await page.getByRole('menuitem', { name: 'Chuyển sang Hoàn thành' }).click();
  await expect(page.getByRole('alert')).toContainText('Không lưu được thay đổi, đã hoàn tác.');
  await expect(card(column(page, 'Cần làm'), 'Mua quà sinh nhật')).toBeVisible();
  await page.unroute('**/rest/v1/rpc/move_task');
  await page.reload();
  await expect(card(column(page, 'Cần làm'), 'Mua quà sinh nhật')).toBeVisible();
});

test('offline is read-only and recovers when back online', async ({ page, context }) => {
  await context.setOffline(true);
  await expect(page.getByText('Mất kết nối – đang ở chế độ chỉ đọc.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm công việc vào cột Cần làm' })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText('Mất kết nối – đang ở chế độ chỉ đọc.')).toHaveCount(0);
  await createTask(page, 'Cần làm', 'Sau khi có mạng');
  await settled(page);
  await page.reload();
  await expect(card(page, 'Sau khi có mạng')).toBeVisible();
});
