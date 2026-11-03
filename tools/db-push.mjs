#!/usr/bin/env node
/**
 * Apply supabase/schema.sql to the project database via psql.
 *
 * Usage:
 *   npm run db:push        apply the schema
 *   npm run db:check       connect and report state without changing anything
 *
 * The password is read from .env and percent-encoded before it reaches psql,
 * which matters because this project's password contains `/`, `?` and `,`.
 */
import { spawnSync } from 'node:child_process';
import { buildDbUrl, loadEnv, redact } from './env.mjs';

const checkOnly = process.argv.includes('--check');
const env = loadEnv();

let uri;
try {
  uri = buildDbUrl(env);
} catch (e) {
  console.error(`\n  ${e.message}`);
  console.error('  Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

console.log(`\n  target: ${redact(uri)}`);

/** Run psql with the connection URI. Never echo the URI on failure. */
function psql(args, { quiet = false } = {}) {
  const res = spawnSync('psql', [uri, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', ...args], {
    env: { ...process.env, PGCONNECT_TIMEOUT: '15' },
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (res.error?.code === 'ENOENT') {
    console.error('\n  psql not found. Install it with: brew install libpq\n');
    process.exit(1);
  }
  return res;
}

const conn = psql(['-tAc', 'select current_database()'], { quiet: true });
if (conn.status !== 0) {
  console.error('\n  could not connect:\n');
  console.error((conn.stderr ?? '').trim().replace(/postgresql:\/\/\S+/g, '<uri>'));
  console.error('\n  Check SUPABASE_DB_PASSWORD, and that the project is not paused.\n');
  process.exit(1);
}
console.log(`  connected: ${conn.stdout.trim()}`);

if (checkOnly) {
  const state = psql([
    '-c',
    `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name;`,
    '-c',
    'select count(*) as runs, count(*) filter (where is_test) as test_runs from public.runs;',
  ]);
  process.exit(state.status ?? 0);
}

console.log('  applying supabase/schema.sql …\n');
if (psql(['-f', 'supabase/schema.sql']).status !== 0) {
  console.error('\n  schema apply FAILED\n');
  process.exit(1);
}
console.log('\n  schema applied.\n');
