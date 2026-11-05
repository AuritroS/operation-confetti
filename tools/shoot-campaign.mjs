#!/usr/bin/env node
/**
 * Photograph all three levels at phone widths, in the campaign.
 *
 * Review tooling so far has been per level, which is exactly why cross-level
 * visual problems went unseen until someone played the whole thing on a
 * phone. This drives the campaign shell, skips into each level, and captures
 * the same moments at the same sizes so the three can be compared side by
 * side.
 *
 * Software rasterised: colour, layout and framing are meaningful here;
 * timings and frame rate are not.
 *
 * Usage: node tools/shoot-campaign.mjs
 */
import { build } from 'vite';
import { chromium } from 'playwright';
import { resolve, extname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = resolve('node_modules/.cache/campaign-shoot');
const SHOTS = resolve('tools/shots/campaign');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
];

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
await build({ logLevel: 'error', define: { 'import.meta.env.DEV': 'true' }, build: { outDir: OUT, emptyOutDir: true } });

const LAUNCH = ['--no-sandbox', '--disable-gpu', '--single-process',
  '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'];

/**
 * Tap through the tutorial sheet.
 *
 * Every level opens in a rehearsal that scores nothing and never ends, so a
 * check that skipped this would be measuring practice rather than play.
 */
async function startLevel(target) {
  await target.locator('.tutorial__start').click({ timeout: 30_000 });
}

const problems = [];
for (const viewport of VIEWPORTS) {
  // One browser per viewport: --single-process tears the whole process down
  // with its last page, so a shared instance cannot survive the first close.
  const browser = await chromium.launch({ headless: true, args: LAUNCH });
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`); });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://campaign.test') return route.continue();
    const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' },
      body: readFileSync(file),
    });
  });

  await page.goto('http://campaign.test/?debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__campaign && !window.__campaign.switching, null, { timeout: 60_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, `tutorial-${viewport.name}.png`) });
  await startLevel(page);
  // Hide the debug panel: this is a review of what a player sees.
  await page.evaluate(() => { const d = document.getElementById('debug'); if (d) d.hidden = true; });

  for (const stage of [1, 2, 3]) {
    // Let the level settle: props and the character stream in after mount.
    await page.waitForTimeout(stage === 1 ? 4000 : 3000);
    await page.screenshot({ path: join(SHOTS, `level${stage}-${viewport.name}.png`) });
    const overflow = await page.evaluate(() => document.body.scrollWidth);
    if (overflow > viewport.width) {
      problems.push(`level ${stage} @ ${viewport.name}: horizontal overflow ${overflow}`);
    }
    if (stage < 3) {
      await page.evaluate(() => window.__campaign.skip());
      await page.waitForFunction((w) => window.__campaign.stage === w && !window.__campaign.switching,
        stage + 1, { timeout: 60_000 });
      await startLevel(page);
    }
  }
  process.stdout.write(`${errors.length ? 'FAIL' : 'ok  '} ${viewport.name}\n`);
  for (const e of errors) { problems.push(`${viewport.name}: ${e}`); process.stdout.write(`      ${e}\n`); }
  await browser.close();
}

process.stdout.write(`\nwrote ${SHOTS}\n`);
if (problems.length) { process.stderr.write(`${problems.length} problem(s)\n`); process.exitCode = 1; }
