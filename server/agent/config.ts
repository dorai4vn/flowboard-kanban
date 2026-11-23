/** Server-only configuration and limits for the AI assistant. Never import this from browser code. */
export const LIMITS = {
  messageChars: 1000,
  historyTurns: 12,
  historyChars: 1500,
  maxTurns: 8,
  runTimeoutMs: 45_000,
  /** Documentation only: the request budget is enforced in Postgres by agent_rate_limit_hit(). */
  requestsPerWindow: 30,
  windowMinutes: 10,
  approvalTtlSeconds: 600,
} as const;

export const DEFAULT_MODEL = 'gpt-5.4-mini';

export type ServerConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  openaiConfigured: boolean;
  model: string;
  stateSecret: string;
};

/** Reads configuration from the server environment. Missing pieces are reported, never guessed. */
export function readServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig | { missing: string[] } {
  const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const stateSecret = env.AGENT_STATE_SECRET?.trim();
  const deployed = Boolean(env.VERCEL) || env.NODE_ENV === 'production';
  const missing = [
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseKey && 'SUPABASE_PUBLISHABLE_KEY',
    // only the local scripted test model may run without a key, and never on a deployed server
    !openaiKey && !(env.FLOWBOARD_AGENT_MODEL === 'scripted' && !deployed) && 'OPENAI_API_KEY',
    // deployed servers need a dedicated, strong signing secret (no derivation from another credential)
    deployed && (!stateSecret || stateSecret.length < 32) && 'AGENT_STATE_SECRET',
  ].filter((x): x is string => Boolean(x));
  if (missing.length > 0 || !supabaseUrl || !supabaseKey) return { missing };
  return {
    supabaseUrl,
    supabaseKey,
    openaiConfigured: Boolean(openaiKey),
    model: env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    // Dedicated secret (required when deployed); local development may derive one from the server-only key.
    stateSecret: stateSecret || `derived:${openaiKey ?? 'scripted-dev'}`,
  };
}
