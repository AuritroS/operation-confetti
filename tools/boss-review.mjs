#!/usr/bin/env node
/** Small browser check for the independent control harness. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
try {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(resolve('.local-tmp/level3-build/level3.html')).href);
    await page.locator('#practice-lane').waitFor();
    const lane = page.locator('#practice-lane');
    const hits = page.locator('#practice-hits');
    const shots = page.locator('#practice-shots');
    if (await lane.textContent() !== '2 / 3') throw new Error('Wrong starting lane');
    await page.keyboard.press('ArrowLeft');
    if (await lane.textContent() !== '1 / 3') throw new Error('Left did not move one lane');
    await page.keyboard.press('ArrowLeft');
    if (await lane.textContent() !== '1 / 3') throw new Error('Edge did not clamp');
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    if (await shots.textContent() !== '1') throw new Error('Short Space did not fire');
    await page.waitForTimeout(550);
    if (await hits.textContent() !== '1') throw new Error('Shot did not hit target');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(50);
    if (await page.locator('#practice-paused').isHidden()) throw new Error('Pause did not open');
    await page.keyboard.press('KeyP');
    if (!(await page.locator('#practice-paused').isHidden())) throw new Error('Resume failed');
    if (errors.length) throw new Error(errors.join('\n'));
    const bodyWidth = await page.locator('body').evaluate((el) => el.scrollWidth);
    if (bodyWidth > viewport.width) throw new Error(`Horizontal overflow at ${viewport.width}`);
    await page.close();
    process.stdout.write(`OK ${viewport.width}x${viewport.height}\n`);
  }
} finally {
  await browser.close();
}
