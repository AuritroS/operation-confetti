#!/usr/bin/env node
/**
 * Photograph the HUD's moments: a reward, a hit, the row of presents, and
 * the boss fight's readouts beside it, at two phone widths.
 *
 * Runs level 1 in the campaign and waits on the event stream: the first
 * gift sits in the starting lane and the first fence in the middle lane,
 * so both arrive without input. Screenshots are taken the instant the
 * event lands, inside the animations. Layout evidence only.
 *
 * Usage: node tools/shoot-hud.mjs
 * Writes: tools/shots/hud/
 */
import { build } from 'vite';
import { chromium } from 'playwright';
import { resolve, extname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = resolve('node_modules/.cache/hud-shoot');
const SHOTS = resolve('tools/shots/hud');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true });
await build({ logLevel: 'error', define: { 'import.meta.env.DEV': 'true' }, build: { outDir: OUT, emptyOutDir: true } });
const LAUNCH = ['--no-sandbox', '--disable-gpu', '--single-process', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'];

for (const vp of [{ name: '390x844', width: 390, height: 844 }, { name: '360x800', width: 360, height: 800 }]) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://hud.test') return route.continue();
    const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }, body: readFileSync(file) });
  });
  const shot = (name) => page.screenshot({ path: join(SHOTS, `${vp.name}-${name}.png`) });
  const count = (t) => page.evaluate((want) => window.__campaign.events.filter((e) => e.t === want).length, t);

  await page.goto('http://hud.test/?debug', { waitUntil: 'load' });
  await page.evaluate(() => setInterval(() => { const cue = document.querySelector('.chapter:not([hidden]) .chapter__cue:not([hidden])'); if (cue && !cue.dataset.t) { cue.dataset.t = '1'; setTimeout(() => document.querySelector('.chapter')?.click(), 250); } }, 150));
  await page.waitForFunction(() => { const b = document.querySelector('.loading'); return b === null || b.hidden; }, null, { timeout: 180000 });
  await page.locator('.name__input').fill('Hud'); await page.locator('.story__next').click(); await page.waitForTimeout(600);
  await page.locator('.story__skip').click();
  await page.waitForFunction(() => window.__campaign && !window.__campaign.switching && document.querySelector('.tutorial') && !document.querySelector('.tutorial').hidden, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.locator('.tutorial__start').click();
  await page.waitForTimeout(300);
  await shot('1-start');

  // The first gift, in the starting lane at z 33.
  await page.waitForFunction(() => window.__campaign.events.some((e) => e.t === 'gift'), null, { timeout: 30000 });
  await page.waitForTimeout(140);
  await shot('2-reward');
  await page.waitForTimeout(1500);
  await shot('3-after-reward');

  // Then the fence in the middle lane at z 168: skip to just before it.
  await page.evaluate(() => window.__campaign.skip(10));
  await page.waitForFunction(() => window.__campaign.events.some((e) => e.t === 'incident'), null, { timeout: 30000 });
  await page.waitForTimeout(120);
  await shot('4-hit');

  await browser.close();
  console.log('ok ', vp.name);
}

// The boss level: its own readouts, the present row hidden.
{
  const browser = await chromium.launch({ headless: true, args: LAUNCH });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://hud.test') return route.continue();
    const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }, body: readFileSync(file) });
  });
  await page.goto('http://hud.test/?tutorial=3&debug', { waitUntil: 'load' });
  await page.evaluate(() => setInterval(() => { const cue = document.querySelector('.chapter:not([hidden]) .chapter__cue:not([hidden])'); if (cue && !cue.dataset.t) { cue.dataset.t = '1'; setTimeout(() => document.querySelector('.chapter')?.click(), 250); } }, 150));
  await page.waitForFunction(() => { const b = document.querySelector('.loading'); return b === null || b.hidden; }, null, { timeout: 180000 });
  const skip = page.locator('.story__skip:visible'); if (await skip.count()) await skip.click();
  await page.waitForFunction(() => window.__campaign && !window.__campaign.switching && document.querySelector('.tutorial') && !document.querySelector('.tutorial').hidden, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.locator('.tutorial__start').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, '390x844-5-boss.png') });
  await browser.close();
  console.log('ok  boss');
}
console.log('wrote', SHOTS);
