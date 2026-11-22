import { expect, type Locator, type Page } from '@playwright/test';

export const column = (page: Page, name: 'Cần làm' | 'Đang làm' | 'Hoàn thành') => page.getByRole('region', { name, exact: true });
export const card = (scope: Page | Locator, title: string) => scope.locator('article', { hasText: title });

/** Drag with real mouse events in small steps, as dnd-kit's MouseSensor expects. */
export async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 30, { steps: 15 });
  await page.mouse.up();
}

export async function createTask(page: Page, col: 'Cần làm' | 'Đang làm' | 'Hoàn thành', title: string, opts: { priority?: string; label?: string; due?: string } = {}) {
  await page.getByRole('button', { name: `Thêm công việc vào cột ${col}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Công việc mới' });
  await dialog.getByLabel('Tiêu đề').fill(title);
  if (opts.priority) await dialog.getByLabel('Độ ưu tiên').selectOption({ label: opts.priority });
  if (opts.due) await dialog.getByLabel('Hạn chót').fill(opts.due);
  if (opts.label) await dialog.getByText(opts.label, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(dialog).toBeHidden();
}

/** Wait until every optimistic change has been saved to Supabase. */
export async function settled(page: Page) {
  await expect(page.getByText('Đang lưu…')).toHaveCount(0);
}
