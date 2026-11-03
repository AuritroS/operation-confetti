#!/usr/bin/env node
/**
 * Headless visual check (development tool).
 *
 * Loads a page in Chromium, waits for the first rendered frame, captures a
 * screenshot and every console message and page error. This exists because the
 * remaining risk in this project is visual — scale, framing, silhouette
 * readability, whether an effect looks like anything — and none of it is
 * reachable from a unit test. A full-screen overlay once sat over the gameplay
 * surface for two rounds because nothing here could see the page.
 *
 * WebGL needs explicit flags: headless Chromium has no GPU, so ANGLE is
 * pointed at SwiftShader to get a software GL context. That renders the real
 * pipeline, but it is not a phone GPU — this catches breakage, not feel.
 *
 * Usage:
 *   node tools/shoot.mjs <url> [--out name] [--wait ms] [--keys a,b] [--size WxH]
 *                             [--click selector] [--scroll px]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0] ?? 'http://127.0.0.1:5173/';
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const out = flag('out', 'shot');
const waitMs = Number(flag('wait', 2500));
const keys = (flag('keys', '') || '').split(',').filter(Boolean);
const click = flag('click', '');
const scroll = Number(flag('scroll', 0));
const [width, height] = (flag('size', '390x844') ?? '390x844').split('x').map(Number);

const OUT_DIR = 'tools/shots';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  args: [
    // Software GL: headless Chromium has no GPU, but WebGL must still work.
    // This yields a genuine WebGL 2.0 context via SwiftShader.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    // Required under the Bash sandbox. Chromium's multi-process model
    // registers a Mach bootstrap port to rendezvous with its renderers, and
    // the sandbox denies bootstrap_check_in, so the browser dies at launch
    // with KERN_FAILURE. Running single-process removes the rendezvous
    // entirely. Slower, and unsuitable for load testing, but correct for
    // screenshots and console capture.
    '--single-process',
  ],
});

const page = await browser.newPage({
  viewport: { width: width ?? 390, height: height ?? 844 },
  deviceScaleFactor: 2,
  // Report as a touch device so coarse-pointer paths are exercised.
  hasTouch: true,
  isMobile: true,
});

const logs = [];
page.on('console', (m) => logs.push({ level: m.type(), text: m.text() }));
page.on('pageerror', (e) => logs.push({ level: 'pageerror', text: e.message }));
page.on('requestfailed', (r) =>
  logs.push({ level: 'requestfailed', text: `${r.url()} — ${r.failure()?.errorText ?? '?'}` }),
);

let status = 0;
try {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 25_000 });
  logs.push({ level: 'nav', text: `HTTP ${response?.status() ?? '?'} ${url}` });

  // Wait for a real frame rather than a fixed sleep where possible.
  await page
    .waitForFunction(
      () => {
        const c = document.querySelector('canvas');
        if (!c) return false;
        const gl = c.getContext('webgl2') ?? c.getContext('webgl');
        return !!gl || c.width > 1;
      },
      { timeout: 15_000 },
    )
    .catch(() => logs.push({ level: 'warn', text: 'no canvas detected' }));

  await page.waitForTimeout(waitMs);

  if (click) {
    await page.click(click, { timeout: 5000 });
    // Views that build a scene need a beat to load and draw before capture.
    await page.waitForTimeout(waitMs);
  }

  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(350);
  }

  if (scroll) {
    await page.evaluate((y) => window.scrollTo(0, y), scroll);
    await page.waitForTimeout(600);
  }

  // What the page thinks is going on, read straight from the DOM.
  const probe = await page.evaluate(() => {
    const text = (id) => document.getElementById(id)?.textContent?.trim() ?? null;
    const canvas = document.querySelector('canvas');
    const blocking = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          s.pointerEvents !== 'none' &&
          Number(s.zIndex || 0) > 10 &&
          r.width >= window.innerWidth * 0.9 &&
          r.height >= window.innerHeight * 0.9
        );
      })
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || '(no id)'} z=${getComputedStyle(el).zIndex}`);
    return {
      title: document.title,
      canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
      debug: text('debug'),
      hud: { stage: text('hud-stage'), score: text('hud-score'), gifts: text('hud-gifts') },
      // Anything full-screen and interactive above the input surface is the
      // exact bug class that shipped before; surface it every run.
      fullScreenBlockers: blocking,
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 2,
    };
  });

  const file = join(OUT_DIR, `${out}.png`);
  await page.screenshot({ path: file });

  console.log(`\n  ${file}`);
  console.log(`  title:   ${probe.title}`);
  console.log(`  canvas:  ${probe.canvas}`);
  console.log(`  hud:     stage=${probe.hud.stage} score=${probe.hud.score} gifts=${probe.hud.gifts}`);
  console.log(`  scrolls: ${probe.scrollable ? 'YES — game surface must not scroll' : 'no'}`);
  console.log(
    `  blockers: ${probe.fullScreenBlockers.length ? probe.fullScreenBlockers.join(', ') : 'none'}`,
  );
  if (probe.debug) console.log(`  debug panel:\n${probe.debug.split('\n').map((l) => `    ${l}`).join('\n')}`);

  const bad = logs.filter((l) => ['error', 'pageerror', 'requestfailed'].includes(l.level));
  console.log(`\n  console: ${logs.length} messages, ${bad.length} errors`);
  for (const l of logs.filter((x) => x.level !== 'console')) {
    if (l.level === 'nav' || l.level === 'info' || l.level === 'log') continue;
    console.log(`    [${l.level}] ${l.text.slice(0, 180)}`);
  }
  for (const l of logs.filter((x) => x.level === 'log' || x.level === 'info')) {
    console.log(`    [log] ${l.text.slice(0, 180)}`);
  }
  if (bad.length) status = 1;
} catch (e) {
  console.error(`\n  FAILED: ${String(e).slice(0, 400)}`);
  status = 1;
} finally {
  await browser.close();
}

process.exit(status);
