#!/usr/bin/env node
/**
 * Photograph a level's last seconds as a frame strip: the run-up, the
 * arrival shot, the iris and the chapter card after it.
 *
 * Both route levels end at a vault door, and the ending is the one moment
 * nobody reaches quickly by playing. This skips to a few seconds before the
 * finish on the campaign's own debug hook and screenshots every 150 ms.
 * Needs the build `check-campaign` leaves in node_modules/.cache.
 *
 * Usage: node tools/shoot-endings.mjs <1|2>
 * Writes: tools/shots/endings/level<N>-ending.png
 */
import { chromium } from 'playwright';
import { resolve, extname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
const OUT = resolve('node_modules/.cache/campaign-check');
const DIR = resolve('tools/shots/endings'); mkdirSync(DIR, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
const level = Number(process.argv[2] || 2);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--single-process', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://campaign.test') return route.continue();
  const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
  return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }, body: readFileSync(file) });
});
await page.goto('http://campaign.test/?debug', { waitUntil: 'load' });
await page.evaluate(() => setInterval(() => { const cue = document.querySelector('.chapter:not([hidden]) .chapter__cue:not([hidden])'); if (cue && !cue.dataset.t) { cue.dataset.t = '1'; setTimeout(() => document.querySelector('.chapter')?.click(), 300); } }, 200));
await page.waitForFunction(() => { const b = document.querySelector('.loading'); return b === null || b.hidden; }, null, { timeout: 180000 });
await page.locator('.name__input').fill('Dbg'); await page.locator('.story__next').click(); await page.waitForTimeout(700);
await page.locator('.story__skip').click();
const ready = () => page.waitForFunction(() => window.__campaign && !window.__campaign.switching && document.querySelector('.tutorial') && !document.querySelector('.tutorial').hidden, null, { timeout: 90000 });
await ready();
if (level === 2) {
  await page.locator('.tutorial__start').click(); await page.waitForTimeout(300);
  await page.evaluate(() => window.__campaign.skip());
  await page.waitForFunction(() => window.__campaign.stage === 2, null, { timeout: 90000 });
  await ready();
}
await page.waitForTimeout(2500); // let assets land
await page.locator('.tutorial__start').click(); await page.waitForTimeout(400);
// run to just before the end: level 1 fastForward takes units, level 2 seconds
await page.evaluate((lv) => window.__campaign.skip(lv === 1 ? 38 : 43), level);
await page.waitForTimeout(100);
const frames = [];
for (let i = 0; i < 36; i++) { // 36 × 150ms ≈ 5.4s
  const buf = await page.screenshot(); frames.push(buf);
  await page.waitForTimeout(150);
}
const W = 150, H = Math.round(150 * 844 / 390); const cols = 12; const rows = Math.ceil(frames.length / cols);
const tiles = await Promise.all(frames.map(async (b, i) => ({ input: await sharp(b).resize(W, H).png().toBuffer(), left: (i % cols) * (W + 4), top: Math.floor(i / cols) * (H + 4) })));
await sharp({ create: { width: cols * (W + 4), height: rows * (H + 4), channels: 3, background: '#444' } }).composite(tiles).png().toFile(join(DIR, `level${level}-ending.png`));
console.log('wrote', join(DIR, `level${level}-ending.png`), 'state', await page.evaluate(() => ({ stage: window.__campaign.stage, sw: window.__campaign.switching })));
await browser.close();
