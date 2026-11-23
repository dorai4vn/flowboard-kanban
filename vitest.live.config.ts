import { defineConfig } from 'vitest/config';

// REAL model + Supabase Local. Opt-in (costs tokens): `npm run test:agent-live` with OPENAI_API_KEY set.
export default defineConfig({
  test: { environment: 'node', include: ['tests/live/**/*.test.ts'], testTimeout: 180_000, hookTimeout: 60_000, fileParallelism: false },
});
