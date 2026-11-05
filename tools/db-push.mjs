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
  const stderr = (conn.stderr ?? '').trim().replace(/postgresql:\/\/\S+/g, '<uri>');
  console.error('\n  could not connect:\n');
  console.error(stderr);

  /*
   * Not reaching the direct host is its own diagnosis, and it has nothing to
   * do with the password.
   *
   * `db.<ref>.supabase.co` publishes an AAAA record and no A record on newer
   * projects. A machine with no IPv6 route therefore fails in one of two
   * ways depending on how far it got: "could not translate host name" when
   * the resolver returns nothing usable, or "No route to host" against a
   * 2600:… address when it resolved and then could not be reached. Both mean
   * the same thing, and the session pooler — which answers on IPv4 and takes
   * the same DDL — is the fix for both.
   */
  const unreachable = /translate host name|Name or service not known|nodename nor servname/i.test(stderr)
    || (/No route to host|Network is unreachable|Connection timed out/i.test(stderr) && /\(([0-9a-f]*:){2,}/i.test(stderr));

  if (unreachable && !env.SUPABASE_DB_HOST) {
    console.error('\n  That is the direct connection, which this project publishes over IPv6');
    console.error('  only — nothing is wrong with the password. Use the session pooler,');
    console.error('  which answers on IPv4. Dashboard > Connect > Session pooler, then');
    console.error('  add to .env:');
    console.error('    SUPABASE_DB_HOST=aws-0-<region>.pooler.supabase.com');
    console.error(`    SUPABASE_DB_USER=postgres.${env.SUPABASE_PROJECT_REF}`);
    console.error('    SUPABASE_DB_PORT=5432\n');
    console.error('  Session mode (5432), not transaction mode (6543): the schema has');
    console.error('  DDL that transaction pooling will not run.\n');
  } else if (unreachable) {
    /*
     * Already on an override, so the pooler advice would be a loop.
     *
     * At this point the host is whatever .env names, and the useful
     * questions are about that host and this machine's route to it — not
     * about a switch that has already been made.
     */
    console.error(`\n  ${env.SUPABASE_DB_HOST} could not be reached from this machine.`);
    console.error('  SUPABASE_DB_HOST is set, so this is the host .env names, not the');
    console.error('  default. Check the spelling against Dashboard > Connect, and that');
    console.error('  nothing here blocks outbound 5432.\n');
  } else {
    console.error('\n  Check SUPABASE_DB_PASSWORD, and that the project is not paused.\n');
  }
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
