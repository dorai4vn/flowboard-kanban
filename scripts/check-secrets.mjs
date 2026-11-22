// Fails if a privileged Supabase key or a Google OAuth client secret VALUE is in tracked files or in dist/.
// Public values (publishable key, anon JWT) are allowed. Matches are reported by file:line only, never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /GOCSPX-[A-Za-z0-9_-]{10,}/,
  /SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET\s*=\s*\S+/,
];
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

function privilegedJwt(line) {
  for (const m of line.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role && payload.role !== 'anon' && payload.role !== 'authenticated') return true;
    } catch {
      // not a JWT payload
    }
  }
  return false;
}

function scan(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (SECRET_PATTERNS.some((p) => p.test(line)) || privilegedJwt(line)) hits.push(`${file}:${i + 1}`);
  });
  return hits;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const files = [...tracked, ...(existsSync('dist') ? walk('dist') : [])];
const hits = files.flatMap(scan);
const envTracked = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example'));

if (hits.length || envTracked.length) {
  for (const h of hits) console.error(`check-secrets: secret-looking value at ${h}`);
  for (const f of envTracked) console.error(`check-secrets: tracked env file ${f}`);
  process.exit(1);
}
console.log(`check-secrets: OK (${files.length} files scanned)`);
