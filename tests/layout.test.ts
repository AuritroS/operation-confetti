import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards the portrait frame against the bug that shipped: a letterbox
 * threshold of 0.5 sat in the middle of real phone aspect ratios and cropped
 * the iPhone SE to 334 of its 375 px.
 *
 * The full matrix lives in tools/devices.mjs, which drives a real browser.
 * This is the cheap half: assert the constant can never again fall inside the
 * range of shipping phones.
 */

const css = readFileSync('src/styles.css', 'utf8');

/** Widest portrait aspect among phones in circulation: iPhone SE, 375x667. */
const WIDEST_PHONE = 375 / 667;

/** Narrowest viewport that should letterbox: iPad mini portrait. */
const NARROWEST_TABLET = 768 / 1024;

function cssNumber(name: string): number {
  const match = new RegExp(`--${name}:\\s*([0-9.]+)`).exec(css);
  expect(match, `--${name} must be defined in styles.css`).not.toBeNull();
  return Number(match?.[1]);
}

describe('the portrait frame', () => {
  it('only letterboxes at aspects no phone has', () => {
    const threshold = cssNumber('letterbox-from');
    expect(threshold, `must clear the iPhone SE at ${WIDEST_PHONE.toFixed(3)}`).toBeGreaterThan(
      WIDEST_PHONE,
    );
    expect(threshold, 'must still catch tablets and desktop').toBeLessThanOrEqual(
      NARROWEST_TABLET,
    );
  });

  it('expresses that threshold as a media query, not a bare width', () => {
    // A plain min() on the width cannot distinguish a wide phone from a
    // narrow tablet, which is exactly how the SE got cropped.
    expect(css).toMatch(/@media\s*\(min-aspect-ratio:\s*7\s*\/\s*10\s*\)/);
  });

  it('keeps the frame full width by default', () => {
    const block = css.slice(css.indexOf('#app {'), css.indexOf('}', css.indexOf('#app {')));
    expect(block).toContain('width: 100vw');
  });

  it('frames narrower than the widest phone once letterboxed', () => {
    // The letterboxed frame should match phone framing, so the world is
    // authored once. Wider than a phone would reintroduce the desktop
    // parity problem it was added to solve.
    expect(cssNumber('portrait-aspect')).toBeLessThan(WIDEST_PHONE);
  });
});
