#!/usr/bin/env node
/**
 * Photograph the comic and the chrome, screen by screen, at phone widths.
 *
 * Drives the two review routes the campaign exposes — `?review=story` and
 * `?review=chrome` — and captures every screen each one walks through, plus
 * a recording of the story route so the camera moves, line reveals, wipes
 * and the iris can be watched rather than inferred from stills.
 *
 * Software rasterised: layout, framing, colour and legibility are
 * meaningful here; timing and frame rate are not.
 *
 * Usage: node tools/shoot-story-pass.mjs
 * Writes: tools/shots/story-pass/
 */
import { build } from 'vite';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { resolve, extname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';

const OUT = resolve('node_modules/.cache/story-pass-shoot');
const SHOTS = resolve('tools/shots/story-pass');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
];
const LAUNCH = ['--no-sandbox', '--disable-gpu', '--single-process',
  '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'];

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
await build({ logLevel: 'error', define: { 'import.meta.env.DEV': 'true' }, build: { outDir: OUT, emptyOutDir: true } });

const problems = [];

async function serve(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://review.test') return route.continue();
    const file = resolve(OUT, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' },
      body: readFileSync(file),
    });
  });
}

function watch(page, tag) {
  page.on('pageerror', (e) => problems.push(`${tag}: pageerror ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('Failed to load resource')) {
      problems.push(`${tag}: console ${m.text()}`);
    }
  });
}

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

/** Reveal every line on the open panel, one tap at a time. */
async function readLines(page) {
  for (let i = 0; i < 6; i++) {
    const more = await page.evaluate(() => {
      const hint = document.querySelector('.story__hint');
      return hint && !hint.hidden && hint.textContent === 'tap';
    });
    if (!more) return;
    await page.locator('.story__frame').click({ position: { x: 40, y: 40 } });
    await page.waitForTimeout(420);
  }
}

/** Turn the page: Start on the cover, a tap anywhere else. */
async function turnPage(page, isCover) {
  if (isCover) { await page.locator('.story__next').click(); return; }
  await page.waitForTimeout(400);
  await page.locator('.story__frame').click({ position: { x: 40, y: 40 } });
}

// ---- the comic ---------------------------------------------------------

for (const vp of VIEWPORTS) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH });
  const record = vp.name === '390x844';
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(record ? { recordVideo: { dir: SHOTS, size: { width: vp.width, height: vp.height } } } : {}),
  });
  const page = await context.newPage();
  watch(page, `story ${vp.name}`);
  await serve(page);
  await page.goto('http://review.test/?review=story', { waitUntil: 'load' });

  const ids = ['title', 'intro', 'vault', 'chase', 'rooftop', 'win', 'loss'];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    await page.waitForFunction((want) => {
      const chip = document.querySelector('.review-chip');
      return chip && !chip.hidden && chip.textContent.endsWith(`· ${want}`);
    }, id, { timeout: 30_000 });
    // Opening framing, after the page turn has cleared but before the move
    // has gone far.
    await page.waitForTimeout(800);
    await shot(page, `${vp.name}-story-${i + 1}-${id}-open`);
    if (id === 'title') {
      await page.locator('.name__input').fill('Reviewer');
    }
    // Let the camera settle, then turn every line.
    await page.waitForTimeout(record ? 3200 : 1200);
    await readLines(page);
    await shot(page, `${vp.name}-story-${i + 1}-${id}-read`);
    await page.waitForTimeout(record ? 900 : 200);
    await turnPage(page, id === 'title');
    // A chapter card follows some pages; catch it mid-hold.
    if (['intro', 'chase', 'rooftop'].includes(id)) {
      await page.waitForTimeout(1500);
      await shot(page, `${vp.name}-story-${i + 1}-${id}-chapter`);
    }
  }
  await page.waitForFunction(() => document.querySelector('.results') && !document.querySelector('.results').hidden,
    null, { timeout: 20_000 });
  await page.waitForTimeout(700);
  await shot(page, `${vp.name}-story-8-results`);
  await page.waitForTimeout(record ? 800 : 0);
  await context.close();
  await browser.close();

  if (record) {
    const webm = readdirSync(SHOTS).find((f) => f.endsWith('.webm'));
    if (webm) {
      const src = join(SHOTS, webm);
      const dst = join(SHOTS, 'story-review.webm');
      renameSync(src, dst);
      try {
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', dst, '-vf', 'scale=390:-2',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', join(SHOTS, 'story-review.mp4')]);
      } catch {
        problems.push('ffmpeg unavailable; left story-review.webm only');
      }
    }
  }
  process.stdout.write(`ok   story ${vp.name}\n`);
}

// ---- the chrome ----------------------------------------------------------

for (const vp of VIEWPORTS) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  watch(page, `chrome ${vp.name}`);
  await serve(page);
  await page.goto('http://review.test/?review=chrome', { waitUntil: 'load' });

  await page.waitForTimeout(800);
  await shot(page, `${vp.name}-chrome-1-loader`);

  await page.waitForSelector('.story:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot(page, `${vp.name}-chrome-2-cover-empty`);
  await page.locator('.name__input').fill('Reviewer');
  await shot(page, `${vp.name}-chrome-2-cover-named`);
  await page.locator('.story__next').click();

  await page.waitForSelector('.tutorial:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot(page, `${vp.name}-chrome-3-tutorial`);
  await page.locator('.tutorial__start').click();

  await page.waitForSelector('#pause:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot(page, `${vp.name}-chrome-4-pause`);
  await page.locator('#btn-resume').click();

  await page.waitForSelector('.results:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot(page, `${vp.name}-chrome-5-results-win`);
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await page.waitForTimeout(600);
  await shot(page, `${vp.name}-chrome-5-board`);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Play again' }).click();

  await page.waitForFunction(() => document.querySelector('.review-chip')?.textContent.includes('loss'),
    null, { timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot(page, `${vp.name}-chrome-6-results-loss`);
  await page.getByRole('button', { name: 'Play again' }).click();

  await page.waitForSelector('#rotate:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(300);
  await shot(page, `${vp.name}-chrome-7-rotate`);
  await page.locator('#rotate').click();

  const overflow = await page.evaluate(() => document.body.scrollWidth);
  if (overflow > vp.width) problems.push(`chrome ${vp.name}: horizontal overflow ${overflow}`);
  process.stdout.write(`ok   chrome ${vp.name}\n`);
  await browser.close();
}

process.stdout.write(`\nwrote ${SHOTS}\n`);
if (problems.length) {
  process.stderr.write(`${problems.length} problem(s)\n`);
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exitCode = 1;
}
