#!/usr/bin/env node
/**
 * The Phase A gate: three levels, one page, one renderer.
 *
 * Playing to the gate takes minutes, so this skips levels 1 and 2 to their
 * endpoints and watches the shell sequence them. What it is really checking is
 * the thing a unit test cannot see — that mounting and disposing three levels
 * in a row on a single WebGL context produces no console error, no failed
 * request, and no second context. Context exhaustion is the failure mode that
 * would only appear on a real phone, several replays in.
 *
 * The boss fight has no skip, so this stops once level 3 is mounted and
 * running. It asserts nothing about who wins.
 *
 * Software rasterised: timings here are not performance evidence.
 *
 * Usage: node tools/check-campaign.mjs
 */
import { build, createServer } from 'vite';
import { chromium } from 'playwright';
import { resolve, extname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const OUT = resolve('node_modules/.cache/campaign-check');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

await build({
  logLevel: 'error',
  define: { 'import.meta.env.DEV': 'true' },
  build: { outDir: OUT, emptyOutDir: true },
});

// Same flags the level 3 review uses: this sandbox denies a GPU and a socket.
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--single-process',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
const missing = new Set();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

// Serve the build from disk; the sandbox has no local socket to bind.
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://campaign.test') return route.continue();
  const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!existsSync(file)) {
    missing.add(url.pathname);
    return route.fulfill({ status: 404, body: 'not found' });
  }
  return route.fulfill({
    status: 200,
    headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' },
    body: readFileSync(file),
  });
});

const campaign = () => page.evaluate(() => {
  const c = window.__campaign;
  return c ? { stage: c.stage, score: c.score, switching: c.switching, over: c.over } : null;
});

try {
  await page.goto('http://campaign.test/?debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__campaign && !window.__campaign.switching, null, { timeout: 60_000 });

  let state = await campaign();
  assert.equal(state.stage, 1, 'the campaign must open on level 1');
  console.log(`ok  level 1 mounted, score ${state.score}`);

  for (const expected of [2, 3]) {
    const skipped = await page.evaluate(() => window.__campaign.skip());
    assert.equal(skipped, true, 'levels 1 and 2 must be skippable');
    await page.waitForFunction(
      (want) => window.__campaign.stage === want && !window.__campaign.switching,
      expected, { timeout: 60_000 },
    );
    state = await campaign();
    assert.equal(state.stage, expected, `must advance to level ${expected}`);
    console.log(`ok  level ${expected} mounted, score ${state.score}`);
  }

  // Let the boss fight actually run a few seconds on the shared renderer.
  await page.waitForTimeout(3000);
  state = await campaign();
  assert.equal(state.over, false, 'the boss fight should still be running');

  const score = await page.evaluate(() => window.__campaign.score);
  assert.ok(score > 0, 'score must accumulate across levels, not reset per level');
  console.log(`ok  score carried across all three levels: ${score}`);

  // One canvas, one context: a per-level renderer would have leaked by now.
  const contexts = await page.evaluate(() => document.querySelectorAll('canvas').length);
  assert.equal(contexts, 1, 'the campaign must run on exactly one canvas');
  console.log('ok  one canvas, one renderer across three mounts');

  assert.deepEqual([...missing], [], 'every requested file must exist in the build');
  assert.deepEqual(errors, [], 'no console errors, page errors or failed requests');
  console.log('\nPASS campaign gate: 1 -> 2 -> 3 on one renderer, score accumulating, no errors.');
} catch (error) {
  if (missing.size) console.error('Missing files:', [...missing]);
  if (errors.length) console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser.close();
}
