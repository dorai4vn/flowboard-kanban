// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readServerConfig } from './config.js';

const base = { SUPABASE_URL: 'http://x', SUPABASE_PUBLISHABLE_KEY: 'k', OPENAI_API_KEY: 'test-key-not-real' };

describe('server config', () => {
  it('on Vercel / production a dedicated AGENT_STATE_SECRET of at least 32 characters is required', () => {
    expect(readServerConfig({ ...base, VERCEL: '1' })).toEqual({ missing: ['AGENT_STATE_SECRET'] });
    expect(readServerConfig({ ...base, NODE_ENV: 'production', AGENT_STATE_SECRET: 'short' })).toEqual({ missing: ['AGENT_STATE_SECRET'] });
    expect(readServerConfig({ ...base, VERCEL: '1', AGENT_STATE_SECRET: 'a'.repeat(32) })).toMatchObject({ stateSecret: 'a'.repeat(32) });
  });

  it('local development may derive the secret', () => {
    expect(readServerConfig(base)).toMatchObject({ stateSecret: expect.stringMatching(/^derived:/) });
  });
});
