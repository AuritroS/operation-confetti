/**
 * Playwright review of the standalone Level 3 build without a TCP listener.
 *
 * This workspace's sandbox can launch Chromium with --single-process, but may
 * deny server.listen even on loopback. Fulfil every browser request directly
 * from Vite's built output; no proxy, dev server or other stream is involved.
 */
import { chromium } from 'playwright';
import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

export const BUILD_ROOT = resolve('.local-tmp/level3-build');
const ORIGIN = 'http://level3-review.invalid';
const LAUNCH_ARGS = [
  '--no-sandbox', '--disable-gpu', '--single-process',
  '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
];
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

export async function openReviewPage({ viewport, query = '', page = 'level3.html', videoDir }) {
  if (!existsSync(resolve(BUILD_ROOT, page))) {
    throw new Error('Run node tools/boss-build.mjs first.');
  }
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1,
      ...(videoDir ? { recordVideo: { dir: videoDir, size: viewport } } : {}) });
    await context.route('**/*', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = resolve(BUILD_ROOT, `.${pathname}`);
      if (!file.startsWith(`${BUILD_ROOT}/`) || !existsSync(file) || statSync(file).isDirectory()) {
        await route.fulfill({ status: 404, body: 'missing' });
        return;
      }
      await route.fulfill({ path: file, contentType: TYPES[extname(file)] ?? 'application/octet-stream' });
    });
    const tab = await context.newPage();
    await tab.goto(`${ORIGIN}/${page}${query ? `?${query}` : ''}`, { waitUntil: 'load' });
    return { browser, tab };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
