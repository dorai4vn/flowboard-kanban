/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/check-build-env.mjs';
const run = (env: Record<string, string>) => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_SUPABASE') && !k.startsWith('VERCEL')));
  return spawnSync(process.execPath, [SCRIPT], { env: { ...clean, ...env }, encoding: 'utf8' });
};

describe('check-build-env (prebuild)', () => {
  it('prints present/missing, environment and branch, never the values', () => {
    const r = run({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'claude/m9-supabase', VITE_SUPABASE_URL: 'https://secret-ref.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SECRETVALUE' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('VITE_SUPABASE_URL: present');
    expect(r.stdout).toContain('VITE_SUPABASE_PUBLISHABLE_KEY: present');
    expect(r.stdout).toContain('VERCEL_ENV=preview');
    expect(r.stdout).toContain('branch=claude/m9-supabase');
    expect(r.stdout + r.stderr).not.toMatch(/secret-ref|SECRETVALUE/);
  });

  it('fails a Vercel build when a variable is missing or blank, naming it', () => {
    const r = run({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'claude/m9-supabase', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: '   ' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('VITE_SUPABASE_PUBLISHABLE_KEY: missing');
    expect(r.stderr).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(r.stderr).toContain('preview');
  });

  it('only warns for local builds (tests build without hosted config)', () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('VITE_SUPABASE_URL: missing');
  });
});
