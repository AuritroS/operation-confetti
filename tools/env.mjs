import { readFileSync, existsSync } from 'node:fs';

/**
 * Minimal .env reader. Values are returned as-is; callers that build URLs must
 * percent-encode. Never log the returned values.
 */
export function loadEnv(path = '.env') {
  const env = { ...process.env };
  if (!existsSync(path)) return env;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq === -1) continue;
    const key = text.slice(0, eq).trim();
    let value = text.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

/**
 * Build a Postgres connection URI with the password percent-encoded.
 *
 * This matters: the project password contains `/`, `?` and `,`, all of which
 * change the meaning of a URI if pasted in raw.
 */
export function buildDbUrl(env) {
  const ref = env.SUPABASE_PROJECT_REF;
  const password = env.SUPABASE_DB_PASSWORD;
  if (!ref) throw new Error('SUPABASE_PROJECT_REF is not set in .env');
  if (!password) throw new Error('SUPABASE_DB_PASSWORD is not set in .env');

  const host = env.SUPABASE_DB_HOST ?? `db.${ref}.supabase.co`;
  const port = env.SUPABASE_DB_PORT ?? '5432';
  const user = env.SUPABASE_DB_USER ?? 'postgres';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
}

/** Redact a connection URI so it can safely appear in logs. */
export function redact(uri) {
  return uri.replace(/\/\/([^:]+):[^@]*@/, '//$1:****@');
}
