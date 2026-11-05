#!/usr/bin/env node
/**
 * Photograph each combat cue, and measure the worst case.
 *
 * Drives the `?debug` cue keys in a real browser and captures a frame at a
 * chosen moment in each cue's life, so the telegraph vocabulary can be
 * reviewed before any fight exists to produce it. The last pass fires
 * everything at once, which is the number the draw budget has to survive.
 *
 * Usage: node tools/boss-cues.mjs [--only shield-up,shield-blocked,shield-down]
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUILD_ROOT, openReviewPage } from './boss-browser.mjs';

const SHOTS = resolve('tools/shots/boss');

/** [name, keys to press, ms to wait before the shot] */
const PASSES = [
  ['shield-up', [], 300],
  ['warning', ['Digit1'], 700],
  ['strike', ['Digit1'], 1420],
  ['orb', ['Digit2'], 1000],
  ['orb-impact', ['Digit2'], 0],
  ['confetti-impact', ['Space'], 450],
  ['shield-blocked', ['Digit4'], 0],
  ['shield-down', ['Digit3'], 400],
  ['gift-early', ['Digit5'], 200],
  ['gift-late', ['Digit5'], 1300],
  ['cake-recovered', ['Digit7'], 900],
  ['cake-escaped', ['Digit8'], 820],
  // Everything the pools can hold at once, spread across all three lanes:
  // three strikes, three orbs, a gift and a shield flash. The fight should
  // never actually reach this, which is exactly why the budget is measured
  // against it.
  ['worst-case', [
    'Digit1', 'Digit2',
    'ArrowLeft', 'Digit1', 'Digit2',
    'ArrowRight', 'ArrowRight', 'Digit1', 'Digit2',
    'Digit5', 'Digit4',
  ], 700],
];

const onlyAt = process.argv.indexOf('--only');
const only = onlyAt >= 0 ? new Set((process.argv[onlyAt + 1] ?? '').split(',')) : null;

if (!existsSync(join(BUILD_ROOT, 'level3.html'))) throw new Error('Run node tools/boss-build.mjs first.');
mkdirSync(SHOTS, { recursive: true });

const problems = [];
for (const [name, keys, waitMs] of PASSES.filter(([name]) => !only || only.has(name))) {
    // One browser per pass: --single-process tears down with its last page.
    const { browser, tab: page } = await openReviewPage({
      query: 'debug', viewport: { width: 390, height: 844 },
    });
    try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.locator('#practice-scene-status').waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => errors.push('scene never loaded'));
    await page.waitForTimeout(900);
    for (const key of keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
    if (name === 'shield-blocked') {
      // The block pulse is shorter than a software-rendered screenshot pass.
      await page.waitForFunction(() => {
        const { cues, runner } = window.level3;
        const frame = cues.advance(0, runner.lane);
        if (frame.shield.phase !== 'blocked' || frame.shield.progress < 0.3) return false;
        // Hold this review snapshot while Playwright reads back the WebGL frame.
        cues.advance = () => frame;
        return true;
      }, undefined, { timeout: 10_000, polling: 16 });
    } else if (name === 'orb-impact') {
      // Browser frame rates vary under software rendering. Capture the short
      // contact cue while it exists instead of guessing a wall-clock delay.
      await page.waitForFunction(() => {
        const { cues, runner } = window.level3;
        return cues.advance(0, runner.lane).orbImpacts.length > 0;
      }, undefined, { timeout: 10_000, polling: 16 });
    } else {
      await page.waitForTimeout(waitMs);
    }
    await page.screenshot({ path: join(SHOTS, `cue-${name}.png`) });
    const debugText = (await page.locator('#practice-debug').textContent().catch(() => '')) ?? '';
    process.stdout.write(`${errors.length ? 'FAIL' : 'ok  '} ${name.padEnd(16)} ${debugText}\n`);
    for (const error of errors) {
      problems.push(`${name}: ${error}`);
      process.stdout.write(`      ${error}\n`);
    }
    } finally {
      await browser.close();
    }
}

process.stdout.write(`\nshots in ${SHOTS}\n`);
if (problems.length) {
  process.stderr.write(`\n${problems.length} problem(s)\n`);
  process.exitCode = 1;
}
