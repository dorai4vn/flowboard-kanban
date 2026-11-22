import { defineConfig } from 'vitest/config';

// Runs against Supabase Local only (`npm run db:start`). Never point this at a hosted project.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
