import { SupabaseRepository } from '../../src/data/supabaseRepository.js';
import { SupabaseApprovalStore } from './approvals.js';
import { LIMITS, readServerConfig } from './config.js';
import type { HandlerDeps } from './handlers.js';
import { authenticate, withinRateLimit } from './supabaseServer.js';
import { ruleBasedModel } from './testing/ruleBasedModel.js';

/**
 * Wiring for the deployed functions: user-scoped Supabase (publishable key + the user's JWT, RLS applies),
 * Postgres approvals, and the real OpenAI model. The deterministic test model can only be selected outside
 * Vercel (local dev / E2E) and is refused on any Vercel deployment.
 */
export function productionDeps(env: Record<string, string | undefined> = process.env): HandlerDeps {
  const config = readServerConfig(env);
  const scripted = env.FLOWBOARD_AGENT_MODEL === 'scripted' && !env.VERCEL && env.NODE_ENV !== 'production';
  return {
    config,
    model: scripted ? ruleBasedModel() : 'missing' in config ? 'unconfigured' : config.model,
    now: () => new Date(),
    authenticate: async (authorization) => {
      if ('missing' in config) return null;
      const auth = await authenticate(config.supabaseUrl, config.supabaseKey, authorization);
      if (!auth) return null;
      return {
        userId: auth.userId,
        repo: new SupabaseRepository(auth.db),
        approvals: new SupabaseApprovalStore(auth.db),
        checkRateLimit: () => withinRateLimit(auth.db, LIMITS.requestsPerWindow, LIMITS.windowMinutes),
      };
    },
  };
}
