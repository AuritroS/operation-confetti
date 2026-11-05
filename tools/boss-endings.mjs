import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openReviewPage } from './boss-browser.mjs';

const dir = resolve('tools/shots/boss/endings');
mkdirSync(dir, { recursive: true });
for (const phase of ['recovered', 'escaped']) {
  const { browser, tab } = await openReviewPage({ query: 'debug',
    viewport: { width: 390, height: 844 }, videoDir: dir });
  const errors = [];
  tab.on('pageerror', e => errors.push(e.message));
  tab.on('console', m => {
    if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GPU stall due to ReadPixels')) errors.push(m.text());
  });
  const video = tab.video();
  const videoPath = video ? await video.path() : null;
  let startSeconds = 0;
  let endSeconds = 0;
  try {
    await tab.locator('#practice-scene-status').waitFor({ state: 'hidden' });
    await tab.waitForTimeout(350);
    startSeconds = await tab.evaluate(() => performance.now() / 1000);
    await tab.keyboard.press(phase === 'recovered' ? 'Digit7' : 'Digit8');
    await tab.waitForFunction(() => {
      const { cues, runner } = window.level3;
      return cues.advance(0, runner.lane).cake.progress === 1;
    });
    await tab.waitForTimeout(500);
    endSeconds = await tab.evaluate(() => performance.now() / 1000);
    // Deterministic stills use the same update path as the live ending.
    for (const progress of [0.3, 0.65, 1]) {
      await tab.evaluate(({ phase, progress }) => {
        const { cues, game, view } = window.level3;
        const update = view.savedEndingUpdate ?? view.update.bind(view);
        view.savedEndingUpdate = update;
        cues.reset(); view.reset();
        update(game, 1 / 60, cues.advance(1 / 60), true);
        cues.endCake(phase);
        const duration = phase === 'recovered' ? 4 : 3.4;
        for (let t = 0; t < duration * progress; t += 1 / 60) {
          update(game, 1 / 60, cues.advance(1 / 60), true);
        }
        view.update = () => {};
        view.render();
      }, { phase, progress });
      await tab.screenshot({ path: join(dir, `${phase}-${progress}.png`) });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    process.stdout.write(`ok ${phase}: live playback and three stills\n`);
  } finally {
    await browser.close();
    if (videoPath) copyFileSync(videoPath, join(dir, `${phase}.webm`));
    if (videoPath && endSeconds > startSeconds) {
      const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(startSeconds),
        '-i', videoPath, '-t', String(endSeconds - startSeconds), '-an', '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(dir, `${phase}.mp4`)], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || 'Video export failed');
    }
  }
}
