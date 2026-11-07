#!/usr/bin/env node
/**
 * Photograph level 1 at fixed points along the route, at two phone widths.
 *
 * Three positions — early, mid, late — reached by the campaign's own skip,
 * so before/after comparisons of the environment line up frame for frame.
 * Layout and colour evidence only; motion is for a phone.
 *
 * Usage: node tools/shoot-level1.mjs [tag] [extra-query e.g. layers=city]
 * Writes: tools/shots/level1/<tag>-<width>-<position>.png
 */
import { build } from 'vite';
import { chromium } from 'playwright';
import { resolve, extname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';

const tag = process.argv[2] ?? 'now';
/** Extra query, e.g. `layers=city`, to photograph one layer alone. */
const extra = process.argv[3] ? `&${process.argv[3]}` : '';
const OUT = resolve('node_modules/.cache/level1-shoot');
const SHOTS = resolve('tools/shots/level1');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
mkdirSync(SHOTS, { recursive: true });
await build({ logLevel: 'error', define: { 'import.meta.env.DEV': 'true' }, build: { outDir: OUT, emptyOutDir: true } });
const LAUNCH = ['--no-sandbox', '--disable-gpu', '--single-process', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'];
const POSITIONS = [['early', 4], ['mid', 16], ['late', 27]];

for (const vp of [{ name: '390x844', width: 390, height: 844 }, { name: '360x800', width: 360, height: 800 }]) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://l1.test') return route.continue();
    const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }, body: readFileSync(file) });
  });
  await page.goto(`http://l1.test/?debug${extra}`, { waitUntil: 'load' });
  await page.evaluate(() => setInterval(() => { const cue = document.querySelector('.chapter:not([hidden]) .chapter__cue:not([hidden])'); if (cue && !cue.dataset.t) { cue.dataset.t = '1'; setTimeout(() => document.querySelector('.chapter')?.click(), 250); } }, 150));
  await page.waitForFunction(() => { const b = document.querySelector('.loading'); return b === null || b.hidden; }, null, { timeout: 180000 });
  await page.locator('.name__input').fill('L1'); await page.locator('.story__next').click(); await page.waitForTimeout(600);
  await page.locator('.story__skip').click();
  await page.waitForFunction(() => window.__campaign && !window.__campaign.switching && document.querySelector('.tutorial') && !document.querySelector('.tutorial').hidden, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.locator('.tutorial__start').click();
  let at = 0;
  for (const [name, seconds] of POSITIONS) {
    await page.evaluate((s) => window.__campaign.skip(s), seconds - at); at = seconds;
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(SHOTS, `${tag}-${vp.name}-${name}.png`) });
  }
  await browser.close();
  console.log('ok ', vp.name);
}
console.log('wrote', SHOTS, 'tag', tag);
