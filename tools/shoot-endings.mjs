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
 * Usage: node tools/shoot-endings.mjs <1|2> [--closeup] [--every=150]
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
const closeup = process.argv.includes('--closeup');
const every = Number((process.argv.find((a) => a.startsWith('--every=')) ?? '--every=150').slice(8));
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
// The same route a reviewer opens on a phone: straight to the run-up.
await page.goto(`http://campaign.test/?ending=${level}&debug${closeup ? '&closeup' : ''}`, { waitUntil: 'load' });
await page.evaluate(() => setInterval(() => { const cue = document.querySelector('.chapter:not([hidden]) .chapter__cue:not([hidden])'); if (cue && !cue.dataset.t) { cue.dataset.t = '1'; setTimeout(() => document.querySelector('.chapter')?.click(), 300); } }, 200));
await page.waitForFunction(() => { const b = document.querySelector('.loading'); return b === null || b.hidden; }, null, { timeout: 180000 });
await page.waitForFunction(() => window.__campaign && !window.__campaign.switching, null, { timeout: 90000 });
await page.waitForTimeout(1500); // assets land, iris opens
const frames = [];
const count = Math.round(8000 / every);
for (let i = 0; i < count; i++) {
  const buf = await page.screenshot(); frames.push(buf);
  await page.waitForTimeout(every);
}
const W = 150, H = Math.round(150 * 844 / 390); const cols = 12; const rows = Math.ceil(frames.length / cols);
const tiles = await Promise.all(frames.map(async (b, i) => ({ input: await sharp(b).resize(W, H).png().toBuffer(), left: (i % cols) * (W + 4), top: Math.floor(i / cols) * (H + 4) })));
const name = `level${level}-ending${closeup ? '-closeup' : ''}.png`;
await sharp({ create: { width: cols * (W + 4), height: rows * (H + 4), channels: 3, background: '#444' } }).composite(tiles).png().toFile(join(DIR, name));
console.log('wrote', join(DIR, name), 'state', await page.evaluate(() => ({ stage: window.__campaign.stage, sw: window.__campaign.switching })));
await browser.close();
