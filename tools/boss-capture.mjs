#!/usr/bin/env node
/**
 * Visual review capture for the Level 3 environment.
 *
 * Reads the standalone `boss-build` output through Playwright request routing
 * and photographs the scene at the project's portrait matrix plus desktop. Writes
 * only inside this checkout's ignored `tools/shots/boss/`.
 *
 * SwiftShader supplies WebGL 2 without a GPU. Software rasterisation means
 * frame timings here are NOT a performance measurement.
 *
 * Usage: node tools/boss-capture.mjs [--page level3.html] [--query "debug"]
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUILD_ROOT, openReviewPage } from './boss-browser.mjs';

const SHOTS = resolve('tools/shots/boss');

const VIEWPORTS = [
  { name: 'narrow-360x800', width: 360, height: 800 },
  { name: 'se-375x667', width: 375, height: 667 },
  { name: 'standard-390x844', width: 390, height: 844 },
  { name: 'tall-430x932', width: 430, height: 932 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const page = flag('page', 'level3.html');
const query = flag('query', '');

if (!existsSync(join(BUILD_ROOT, page))) {
  throw new Error(`Missing ${join(BUILD_ROOT, page)} — run node tools/boss-build.mjs first.`);
}
mkdirSync(SHOTS, { recursive: true });
process.stdout.write(`reviewing ${BUILD_ROOT}/${page}${query ? `?${query}` : ''}\n`);

const problems = [];
for (const viewport of VIEWPORTS) {
    // One browser per viewport: `--single-process` tears the whole process down
    // with its last page, so a shared instance cannot survive the first close.
    const { browser, tab } = await openReviewPage({
      page, query, viewport: { width: viewport.width, height: viewport.height },
    });
    try {
    const errors = [];
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    tab.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    tab.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

    // The scene status hides itself only once every GLB has resolved.
    await tab.locator('#practice-scene-status').waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(async () => {
        errors.push(`scene never loaded: ${await tab.locator('#practice-scene-status').textContent()}`);
      });
    await tab.waitForTimeout(1200); // let idle magic and clouds settle into a representative frame

    const shot = join(SHOTS, `${page.replace(/\.html$/, '')}-${viewport.name}.png`);
    await tab.screenshot({ path: shot });
    const overflow = await tab.locator('body').evaluate((el) => el.scrollWidth);
    if (overflow > viewport.width) errors.push(`horizontal overflow ${overflow} > ${viewport.width}`);
    const debugText = await tab.locator('#practice-debug').textContent().catch(() => '');
    process.stdout.write(`${errors.length ? 'FAIL' : 'ok  '} ${viewport.name}  ${debugText ?? ''}\n`);
    for (const error of errors) {
      problems.push(`${viewport.name}: ${error}`);
      process.stdout.write(`      ${error}\n`);
    }
    } finally {
      await browser.close();
    }
}

process.stdout.write(`\nshots in ${SHOTS}\n`);
if (problems.length) {
  process.stderr.write(`\n${problems.length} problem(s) found\n`);
  process.exitCode = 1;
}
