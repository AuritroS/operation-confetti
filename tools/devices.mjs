#!/usr/bin/env node
/**
 * Check the portrait frame fills the screen on every phone we care about.
 *
 * Exists because a single constant chosen by eye letterboxed the iPhone SE to
 * 334 of its 375 px, and nothing in the test suite could see it. Layout bugs
 * of this kind are only visible across a matrix of real viewport sizes.
 *
 * Usage: node tools/devices.mjs [url]
 */
import { chromium } from 'playwright';

/** Portrait CSS viewports. Aspect is width/height. */
const PHONES = [
  ['iPhone SE / 8', 375, 667],
  ['iPhone 13 mini', 375, 812],
  ['iPhone 14 / 13', 390, 844],
  ['iPhone 15 Pro', 393, 852],
  ['iPhone 14 Pro Max', 430, 932],
  ['Pixel 5', 393, 851],
  ['Pixel 7', 412, 915],
  ['Galaxy S20', 360, 800],
  ['Galaxy S8+', 360, 740],
  ['Galaxy Fold closed', 280, 653],
];

/** Expected to letterbox: wider than any phone. */
const WIDE = [
  ['iPad mini portrait', 768, 1024],
  ['iPad landscape', 1024, 768],
  ['Desktop 1280', 1280, 800],
  ['Desktop 1920', 1920, 1080],
];

const url = process.argv[2] ?? 'http://127.0.0.1:5174/?clean&layers=none';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--single-process'],
});
const context = await browser.newContext();

async function measure(w, h) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    const app = document.getElementById('app');
    return {
      app: Math.round(app?.getBoundingClientRect().width ?? 0),
      vw: window.innerWidth,
      scrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  await page.close();
  return result;
}

let failures = 0;
console.log('\n  PHONES — must fill the width\n');
for (const [name, w, h] of PHONES) {
  const r = await measure(w, h);
  const ok = r.app >= r.vw - 1 && !r.scrolls;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} ${String(w).padStart(4)}x${String(h).padEnd(5)} ` +
      `aspect ${(w / h).toFixed(3)}  frame ${String(r.app).padStart(4)} of ${r.vw}`,
  );
}

console.log('\n  WIDE — must letterbox\n');
for (const [name, w, h] of WIDE) {
  const r = await measure(w, h);
  const ok = r.app < r.vw;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} ${String(w).padStart(4)}x${String(h).padEnd(5)} ` +
      `aspect ${(w / h).toFixed(3)}  frame ${String(r.app).padStart(4)} of ${r.vw}`,
  );
}

await browser.close();
console.log(failures === 0 ? '\n  all viewports correct\n' : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
