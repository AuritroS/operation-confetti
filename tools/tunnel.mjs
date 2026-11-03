#!/usr/bin/env node
/**
 * Expose the local dev server on your tailnet over HTTPS.
 *
 * Why HTTPS rather than just hitting the 100.x address on port 5173: a bare
 * http:// origin is not a secure context, so crypto.randomUUID (used for run
 * and player IDs) is undefined there, and the phone test then diverges from
 * production. `tailscale serve` terminates TLS with a real cert for the
 * tailnet name, so the phone gets the same secure-context guarantees as the
 * deployed site.
 *
 * Usage:  npm run tunnel          start it, print the URL
 *         npm run tunnel -- off   tear it down
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 5173;

const CLI = ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', 'tailscale'].find(
  (p) => p === 'tailscale' || existsSync(p),
);

function ts(args, { quiet = false } = {}) {
  return spawnSync(CLI, args, { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
}

if (process.argv.includes('off')) {
  console.log('\n  tearing down the tunnel …\n');
  const res = ts(['serve', '--https=443', 'off']);
  process.exit(res.status ?? 0);
}

const status = ts(['status', '--json'], { quiet: true });
if (status.status !== 0) {
  console.error('\n  tailscale is not reachable.');
  console.error('  Open the Tailscale app and sign in, then try again.');
  console.error(`  (${(status.stderr ?? '').trim().split('\n')[0] ?? 'no detail'})\n`);
  process.exit(1);
}

let dnsName = '';
try {
  dnsName = (JSON.parse(status.stdout).Self?.DNSName ?? '').replace(/\.$/, '');
} catch {
  /* fall through to the warning below */
}

console.log(`\n  serving http://127.0.0.1:${PORT} on your tailnet over HTTPS …\n`);
const res = ts(['serve', '--bg', '--https=443', `http://127.0.0.1:${PORT}`]);

if (res.status !== 0) {
  console.error('\n  could not start the tunnel.');
  console.error('  HTTPS needs MagicDNS and HTTPS certificates enabled for the tailnet');
  console.error('  (Tailscale admin console > DNS).\n');
  process.exit(1);
}

if (dnsName) {
  console.log(`\n  open this on your phone:\n\n      https://${dnsName}\n`);
  console.log(`  probe harness:\n\n      https://${dnsName}/probe.html\n`);
} else {
  console.log('\n  tunnel up. Run `tailscale serve status` for the URL.\n');
}
console.log('  Leave `npm run dev` running in another terminal.');
console.log('  Tear down with: npm run tunnel -- off\n');
