import { expect, test } from './fixtures';

// Regression: the AI entry point must be visible to a signed-in user on desktop, before the panel is opened.
test('the "Trợ lý AI" button is visible in the header after sign-in (desktop)', async ({ page }) => {
  const header = page.getByRole('banner');
  const button = header.getByRole('button', { name: 'Trợ lý AI' });
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Trợ lý AI');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('complementary', { name: 'Trợ lý AI' })).toHaveCount(0);

  // it sits in the right-hand group of the header, just left of the account avatar
  const box = (await button.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThan(viewport.width / 2);
  expect(box.y).toBeLessThan(120);

  if (process.env.QC_OUT) await page.screenshot({ path: `${process.env.QC_OUT}/ai-desktop-entry.png` });
  await button.click();
  await expect(page.getByRole('complementary', { name: 'Trợ lý AI' })).toBeVisible();
});
