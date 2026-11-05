#!/usr/bin/env node
/**
 * Render every asset the comic has to depict, on a clean plate.
 *
 * The panels must show the characters and props the player actually meets,
 * and the only trustworthy description of those is the build: Matthew is the
 * unhooded Rogue with grafted curls and no mask, Aurora wears the crown and
 * not the mage hat, the gates carry a gift emblem. A written brief drifts
 * from that; a render of the shipped asset cannot.
 *
 * Writes to `story-reference/`, which is committed rather than ignored — the
 * point of these is to hand them to someone drawing the panels, so they have
 * to survive a clean checkout.
 *
 * Software rasterised. These are shape, colour and proportion references;
 * they are not a lighting or performance reference.
 *
 * Usage: node tools/story-reference.mjs
 */
import { build } from 'vite';
import { chromium } from 'playwright';
import { resolve, extname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = resolve('node_modules/.cache/story-reference');
const SHOTS = resolve('story-reference');
const SIZE = 800;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
};

/** Every plate, named for what the artist is being shown. */
const PLATES = [
  { file: 'matthew-front', asset: 'matthew', view: 'front' },
  { file: 'matthew-three-quarter', asset: 'matthew', view: 'three' },
  { file: 'matthew-back', asset: 'matthew', view: 'back' },
  { file: 'matthew-with-grapple-blaster', asset: 'matthew', view: 'three', hold: 'blaster' },
  { file: 'matthew-with-confetti-cannon', asset: 'matthew', view: 'three', hold: 'cannon' },
  { file: 'aurora-front', asset: 'aurora', view: 'front' },
  { file: 'aurora-three-quarter', asset: 'aurora', view: 'three' },
  { file: 'cake', asset: 'cake', view: 'three' },
  { file: 'present', asset: 'present', view: 'three' },
  { file: 'grapple-blaster', asset: 'blaster', view: 'three' },
  { file: 'confetti-cannon', asset: 'cannon', view: 'three' },
  { file: 'gate-vault-door', asset: 'vaultDoor', view: 'front' },
  { file: 'gift-emblem', asset: 'giftEmblem', view: 'front' },
  { file: 'cn-tower', asset: 'cnTower', view: 'three' },
  { file: 'moon', asset: 'moon', view: 'front' },
];

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// The reference page is a review tool, so it is deliberately absent from the
// production input list. Added here only for this build.
await build({
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { input: { story: resolve('story-reference.html') } },
  },
});

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--single-process',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://story.test') return route.continue();
  const file = resolve(OUT, `.${url.pathname}`);
  if (!existsSync(file)) {
    problems.push(`missing ${url.pathname}`);
    return route.fulfill({ status: 404, body: 'not found' });
  }
  return route.fulfill({
    status: 200,
    headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' },
    body: readFileSync(file),
  });
});

for (const plate of PLATES) {
  const query = new URLSearchParams({ asset: plate.asset, view: plate.view });
  if (plate.hold) query.set('hold', plate.hold);
  await page.goto(`http://story.test/story-reference.html?${query}`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.storyReady === true, null, { timeout: 60_000 });
  } catch {
    problems.push(`${plate.file}: never finished loading`);
    continue;
  }
  // Characters stream their animation libraries after the first frame.
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, `${plate.file}.png`) });
  process.stdout.write(`ok  ${plate.file}\n`);
}

await browser.close();
process.stdout.write(`\nwrote ${SHOTS}\n`);
if (problems.length) {
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exitCode = 1;
}
