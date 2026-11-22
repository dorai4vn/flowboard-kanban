import { test } from './fixtures';

// Visual QC for the AI assistant: `npm run qc:screens-ai`. Skipped in normal E2E runs.
const OUT = process.env.QC_OUT ?? '';
test.skip(!OUT, 'set QC_OUT to capture visual QC screenshots');
test.use({ deviceScaleFactor: 2 });

type Page = import('@playwright/test').Page;
const panel = (page: Page) => page.getByRole('complementary', { name: 'Trợ lý AI' });
async function ask(page: Page, text: string) {
  const box = panel(page).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' });
  await box.fill(text);
  await box.press('Enter');
  await panel(page).getByText('Trợ lý đang xử lý…').waitFor({ state: 'detached', timeout: 20_000 });
}

for (const vp of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 412, height: 915 },
]) {
  test(`AI visual QC ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.getByRole('button', { name: 'Trợ lý AI' }).click();
    await page.screenshot({ path: `${OUT}/ai-${vp.name}-empty.png` });

    await ask(page, 'tạo công việc Ôn tập chương 4 hạn 2026-12-01');
    await ask(page, 'đổi tên Ôn tập chương 4 thành Ôn tập chương 4 và làm bài tập cuối chương thật đầy đủ');
    await page.screenshot({ path: `${OUT}/ai-${vp.name}-create-update.png` });

    await ask(page, 'xóa Mua quà sinh nhật');
    await page.screenshot({ path: `${OUT}/ai-${vp.name}-approval.png` });

    await ask(page, 'lỗi máy chủ');
    await page.screenshot({ path: `${OUT}/ai-${vp.name}-error.png` });

    await page.route('**/api/agent/chat', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    const box = panel(page).getByRole('textbox', { name: 'Tin nhắn cho Trợ lý AI' });
    await box.fill('Việc nào đang quá hạn?');
    await box.press('Enter');
    await panel(page).getByText('Trợ lý đang xử lý…').waitFor();
    await page.screenshot({ path: `${OUT}/ai-${vp.name}-loading.png` });
  });
}
