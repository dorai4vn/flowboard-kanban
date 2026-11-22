import { test as base, expect, type Page } from '@playwright/test';
import { AUTH_STORAGE_KEY } from '../../src/lib/supabase';
import { signedInClient } from '../support/localSupabase';

export type TestAccount = { email: string; password: string; userId: string; sessionJson: string };

/** Create a fresh user on Supabase Local and return a session the browser can use. */
export async function newAccount(label = 'e2e'): Promise<TestAccount> {
  const { client, userId, email, password } = await signedInClient(label);
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('no session for test user');
  return { email, password, userId, sessionJson: JSON.stringify(data.session) };
}

/** Put the session into localStorage once (not on later reloads, so signing out sticks). */
export async function applySession(page: Page, account: TestAccount) {
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('flowboard-e2e-session') === value) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem('flowboard-e2e-session', value);
    },
    [AUTH_STORAGE_KEY, account.sessionJson] as const,
  );
}

/** `page` is already signed in as a brand-new user whose starter board is loaded. */
export const test = base.extend<{ account: TestAccount }>({
  account: async ({}, use) => {
    await use(await newAccount());
  },
  page: async ({ page, account }, use) => {
    await applySession(page, account);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'FlowBoard', level: 1 })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(5);
    await use(page);
  },
});

export { expect };
