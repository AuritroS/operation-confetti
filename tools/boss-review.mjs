#!/usr/bin/env node
/** Small browser check for the independent control harness and fight start. */
import { openReviewPage } from './boss-browser.mjs';

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { browser, tab: page } = await openReviewPage({ viewport });
    try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.locator('#practice-scene-status').waitFor({ state: 'hidden', timeout: 30_000 });
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
    await page.locator('#boss-start').click();
    await page.waitForTimeout(100);
    if (await page.locator('#boss-beat').textContent() !== 'Lane strike · dodge the marker') {
      throw new Error('Fight did not start with a warned lane strike');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    const bodyWidth = await page.locator('body').evaluate((el) => el.scrollWidth);
    if (bodyWidth > viewport.width) throw new Error(`Horizontal overflow at ${viewport.width}`);
    } finally {
      await browser.close();
    }
    process.stdout.write(`OK ${viewport.width}x${viewport.height}\n`);
}
