#!/usr/bin/env node
/**
 * Combat HUD review capture.
 *
 * `boss-capture.mjs` photographs the idle arena, which never shows the health
 * bar moving, a jammed cannon or a heart being spent. This drives a real fight
 * through the `?debug` simulation hook and photographs the moments the HUD
 * exists for. It writes only inside this checkout's ignored shots directory.
 *
 * The debug panel and cue legend are hidden before each frame, so what is
 * photographed is the HUD a player actually sees.
 *
 * Software rasterised: these are layout and legibility evidence, never
 * performance evidence.
 *
 * Usage: node tools/boss-hud.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUILD_ROOT, openReviewPage } from './boss-browser.mjs';

const SHOTS = resolve('tools/shots/boss/hud');
const PAGE = 'level3.html';

const VIEWPORTS = [
  { name: 'narrow-360x800', width: 360, height: 800 },
  { name: 'standard-390x844', width: 390, height: 844 },
];

if (!existsSync(join(BUILD_ROOT, PAGE))) {
  throw new Error(`Missing ${join(BUILD_ROOT, PAGE)} — run node tools/boss-build.mjs first.`);
}
mkdirSync(SHOTS, { recursive: true });

/** Poll a predicate evaluated against the live runner inside the page. */
async function waitForRunner(tab, body, label, timeout = 20_000) {
  await tab.waitForFunction(
    `(() => { const r = window.level3?.runner; return r ? (${body}) : false; })()`,
    null,
    { timeout },
  ).catch(() => { throw new Error(`timed out waiting for ${label}`); });
}

const problems = [];
for (const viewport of VIEWPORTS) {
  const { browser, tab } = await openReviewPage({
    page: PAGE, query: 'debug', viewport: { width: viewport.width, height: viewport.height },
  });
  try {
    const errors = [];
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    tab.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    tab.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

    await tab.locator('#practice-scene-status').waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(async () => {
        errors.push(`scene never loaded: ${await tab.locator('#practice-scene-status').textContent()}`);
      });

    // Review the player's HUD, not the developer's.
    const hideDebug = () => tab.evaluate(() => {
      for (const id of ['practice-debug', 'practice-cues']) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      }
    });
    await hideDebug();

    const shot = async (name) => {
      await hideDebug();
      await tab.screenshot({ path: join(SHOTS, `${viewport.name}-${name}.png`) });
    };

    await shot('1-practice');

    await tab.locator('#boss-start').click();
    // Fire into her raised shield: this is the blocked shot that jams the gun.
    await tab.evaluate(() => window.level3.runner.fire());
    await waitForRunner(tab, 'r.cues.gun.jammed === true', 'the cannon to jam', 5000);
    await shot('2-jammed');

    // Stand still through the first committed strike to spend a heart.
    await waitForRunner(tab, 'r.playerHp < 5', 'a heart to be lost');
    await shot('3-hit-penalty');

    await waitForRunner(tab, "r.beat === 'exposed'", 'her shield to drop');
    // A gift is hung on every one of the first four windows, so it is in the
    // air right now and must not yet be collectible.
    await waitForRunner(tab, "r.cues.gift?.phase === 'falling'", 'a gift to fall', 4000);
    await shot('4-gift-falling');

    await tab.evaluate(() => window.level3.runner.fire());
    await tab.waitForTimeout(420);
    await shot('5-exposed-damage');

    await waitForRunner(tab, "r.cues.gift === null || r.cues.gift.phase !== 'falling'", 'the gift to settle', 4000);
    await shot('6-gift-settled');

    // Her orb flies un-aimed, then commits a lane: photograph it committed.
    await waitForRunner(tab, "r.attackKind === 'orb'", 'an orb attack', 25_000);
    await waitForRunner(tab, 'r.markedLanes.length > 0', 'the orb to lock on', 6000);
    await shot('7-orb-locked');

    const overflow = await tab.locator('body').evaluate((el) => el.scrollWidth);
    if (overflow > viewport.width) errors.push(`horizontal overflow ${overflow} > ${viewport.width}`);

    const state = await tab.evaluate(() => {
      const r = window.level3.runner;
      return { hp: r.bossHp, hearts: r.playerHp, score: r.score };
    });
    process.stdout.write(
      `${errors.length ? 'FAIL' : 'ok  '} ${viewport.name}  aurora=${state.hp} hearts=${state.hearts} score=${state.score}\n`,
    );
    for (const error of errors) {
      problems.push(`${viewport.name}: ${error}`);
      process.stdout.write(`      ${error}\n`);
    }
  } finally {
    await browser.close();
  }
}

process.stdout.write(`\nwrote ${SHOTS}\n`);
if (problems.length) {
  process.stderr.write(`\n${problems.length} problem(s)\n`);
  process.exitCode = 1;
}
