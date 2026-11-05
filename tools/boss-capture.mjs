#!/usr/bin/env node
/**
 * Visual review capture for the Level 3 environment.
 *
 * Serves the standalone `boss-build` output on an ephemeral loopback port and
 * photographs the scene at the project's portrait matrix plus desktop. Writes
 * only inside this checkout's ignored `tools/shots/boss/`.
 *
 * This sandbox denies Chromium's default Mach-port setup, so the launch flags
 * below are required: `--single-process` avoids the denied bootstrap, and
 * SwiftShader supplies WebGL 2 without a GPU. Software rasterisation means
 * frame timings here are NOT a performance measurement.
 *
 * Usage: node tools/boss-capture.mjs [--page level3.html] [--query "debug"]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('.local-tmp/level3-build');
const SHOTS = resolve('tools/shots/boss');
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--single-process',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
];

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

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

if (!existsSync(join(ROOT, page))) {
  throw new Error(`Missing ${join(ROOT, page)} — run node tools/boss-build.mjs first.`);
}
mkdirSync(SHOTS, { recursive: true });

const server = createServer((req, res) => {
  const requested = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(ROOT, normalize(requested === '/' ? `/${page}` : requested));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/${page}${query ? `?${query}` : ''}`;
process.stdout.write(`serving ${ROOT} at ${base}\n`);

const problems = [];
try {
  for (const viewport of VIEWPORTS) {
    // One browser per viewport: `--single-process` tears the whole process down
    // with its last page, so a shared instance cannot survive the first close.
    const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const tab = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const errors = [];
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    tab.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    tab.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

    await tab.goto(base, { waitUntil: 'load' });
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
    await browser.close();
  }
} finally {
  server.close();
}

process.stdout.write(`\nshots in ${SHOTS}\n`);
if (problems.length) {
  process.stderr.write(`\n${problems.length} problem(s) found\n`);
  process.exitCode = 1;
}
