#!/usr/bin/env node
/**
 * Push the Worker's secrets from .env, and mirror them into .dev.vars.
 *
 * Usage:
 *   npm run deploy:secrets           set them on the deployed Worker
 *   npm run deploy:secrets -- --local  write .dev.vars only, touch nothing remote
 *
 * This exists so a service-role key is typed once, into a gitignored file,
 * rather than pasted into a terminal twice — where it lands in shell history
 * and scrollback. The value reaches wrangler on stdin for the same reason:
 * an argv is visible in the process list to anything on the machine.
 *
 * Nothing here ever prints a secret. Failures report the key's name and the
 * exit status, never its value.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadEnv } from './env.mjs';

const localOnly = process.argv.includes('--local');
const env = loadEnv();

/** The two the Worker declares in its `Env`. Keep this list in step with it. */
const KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const missing = KEYS.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(`\n  Not set in .env: ${missing.join(', ')}`);
  console.error('  Dashboard > Project Settings > API Keys > service_role.\n');
  process.exit(1);
}

/*
 * A sanity check on the shape, not the value.
 *
 * The anon key and the service-role key sit next to each other in the
 * dashboard and look alike, and pasting the wrong one produces a Worker that
 * starts cleanly and then fails every write against RLS — a failure that
 * looks like a schema problem and is not.
 */
const role = decodeRole(env.SUPABASE_SERVICE_ROLE_KEY);
if (role && role !== 'service_role') {
  console.error(`\n  SUPABASE_SERVICE_ROLE_KEY carries role "${role}", not "service_role".`);
  console.error('  The anon key sits beside it in the dashboard and will fail every write.\n');
  process.exit(1);
}

// `wrangler dev` reads this file; the deployed Worker reads its own secrets.
writeFileSync('.dev.vars', KEYS.map((key) => `${key}=${env[key]}`).join('\n') + '\n');
console.log('\n  wrote .dev.vars (gitignored)');

if (localOnly) {
  console.log('  --local: nothing was sent to Cloudflare.\n');
  process.exit(0);
}

for (const key of KEYS) {
  // On stdin, never argv: an argument list is readable from the process table.
  const res = spawnSync('npx', ['wrangler', 'secret', 'put', key], {
    input: env[key],
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (res.status !== 0) {
    console.error(`\n  failed to set ${key} (exit ${res.status}).`);
    console.error('  If this is an auth error, run: npx wrangler login\n');
    process.exit(1);
  }
  console.log(`  set ${key}`);
}

console.log('\n  secrets set. Next: npm run deploy\n');

/** The `role` claim of a Supabase JWT, or null if it is not one. */
function decodeRole(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}
