import { defineConfig, devices } from '@playwright/test';
import { localStatus, publicKey } from './tests/support/localSupabase';

const baseURL = process.env.BASE_URL ?? 'http://localhost:4173';
// Tests sign in with Supabase Local sessions: never point them at a deployed site.
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('E2E only runs against a local app backed by Supabase Local');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'off', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  // E2E always runs against Supabase Local (`npm run db:start`); the public URL/key are read from `supabase status`.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        env: { VITE_SUPABASE_URL: localStatus().API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey() },
      },
});
