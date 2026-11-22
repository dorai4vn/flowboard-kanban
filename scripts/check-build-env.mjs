// Runs before `vite build` (npm "prebuild"). Vite inlines VITE_* variables at BUILD time, so a hosted build
// without them produces an app that can only show "Thiếu cấu hình Supabase.". This prints present/missing
// (never values) into the build log and stops a Vercel build early when something is missing.
const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
const env = process.env;

const status = Object.fromEntries(REQUIRED.map((name) => [name, env[name]?.trim() ? 'present' : 'missing']));
const missing = REQUIRED.filter((name) => status[name] === 'missing');
const onVercel = Boolean(env.VERCEL);

console.log(`[check-build-env] VERCEL_ENV=${env.VERCEL_ENV ?? 'local'} branch=${env.VERCEL_GIT_COMMIT_REF ?? '(local)'}`);
for (const name of REQUIRED) console.log(`[check-build-env] ${name}: ${status[name]}`);

if (missing.length > 0 && onVercel) {
  console.error(
    `[check-build-env] Missing ${missing.join(', ')} for the "${env.VERCEL_ENV}" environment of this Vercel build. ` +
      'Add them in Vercel → Project → Settings → Environment Variables for this environment (and branch), then redeploy.',
  );
  process.exit(1);
}
if (missing.length > 0) console.log('[check-build-env] local build without Supabase config: the app will show the configuration screen.');
