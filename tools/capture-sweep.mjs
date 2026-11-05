import { chromium } from 'playwright';
import { resolve } from 'node:path';

const htmlPath = resolve('dist/index.html');
const fileUrl = `file://${htmlPath}`;

async function main() {
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--single-process',
      '--no-sandbox',
    ],
  });

  const captures = [
    { name: 'canyon-start-desktop.png', width: 1200, height: 800, time: 0 },
    { name: 'canyon-mid-desktop.png', width: 1200, height: 800, time: 15 },
    { name: 'canyon-late-desktop.png', width: 1200, height: 800, time: 30 },
    { name: 'canyon-start-mobile.png', width: 390, height: 844, time: 0 },
    { name: 'canyon-mid-mobile.png', width: 390, height: 844, time: 15 },
  ];

  for (const cap of captures) {
    const page = await browser.newPage({
      viewport: { width: cap.width, height: cap.height },
      deviceScaleFactor: 2,
    });

    console.log(`Navigating to ${fileUrl} for ${cap.name}...`);
    await page.goto(fileUrl, { waitUntil: 'load' });

    // Wait for street assets to load and render
    await page.waitForTimeout(3000);

    // Pause sweep and set scrubber
    await page.evaluate((targetTime) => {
      const btnPlay = document.querySelector('#btn-sweep-play');
      if (btnPlay && btnPlay.textContent === 'Pause') {
        btnPlay.click();
      }
      const scrubber = document.querySelector('#sweep-scrubber');
      if (scrubber) {
        scrubber.value = String(targetTime);
        scrubber.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, cap.time);

    // Give renderer a couple frames to settle
    await page.waitForTimeout(800);

    const outPath = `tools/shots/${cap.name}`;
    await page.screenshot({ path: outPath });
    console.log(`Saved screenshot to ${outPath}`);
    await page.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
