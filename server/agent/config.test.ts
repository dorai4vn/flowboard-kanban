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

  it('the scripted test model never replaces the OpenAI key on a deployed server', () => {
    const { OPENAI_API_KEY: _omit, ...noKey } = base;
    void _omit;
    expect(readServerConfig({ ...noKey, FLOWBOARD_AGENT_MODEL: 'scripted', VERCEL: '1', AGENT_STATE_SECRET: 'a'.repeat(32) })).toEqual({ missing: ['OPENAI_API_KEY'] });
    expect(readServerConfig({ ...noKey, FLOWBOARD_AGENT_MODEL: 'anything' })).toEqual({ missing: ['OPENAI_API_KEY'] });
    expect(readServerConfig({ ...noKey, FLOWBOARD_AGENT_MODEL: 'scripted' })).toMatchObject({ openaiConfigured: false });
  });
});
