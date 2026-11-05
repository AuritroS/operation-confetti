import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression guard for a shipped bug.
 *
 * The pause overlay carried the `hidden` attribute, but its own rule set
 * `display: grid`. An author stylesheet beats the UA stylesheet's
 * `[hidden] { display: none }`, so a full-screen element sat permanently at
 * z-index 40 over the gameplay surface and swallowed every touch — the game
 * looked playable but was completely unresponsive on a phone.
 *
 * The policy has since changed: pause is now automatic, and the overlay is
 * *meant* to block, because the simulation is frozen and a live-looking frame
 * invites a swipe that does nothing. What must not change is the guarantee
 * that made the bug impossible — a covering element is inert unless the game
 * deliberately shows it. So these tests no longer forbid an overlay; they
 * check that every covering element ships hidden and that nothing overrides
 * the global reset.
 *
 * These are source-level assertions rather than computed-style ones: jsdom
 * does not implement `!important` in getComputedStyle, so asserting through it
 * would test jsdom's cascade rather than the stylesheet.
 */

const css = readFileSync('src/styles.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

/** Classes on elements that cover the viewport, or otherwise toggle `hidden`. */
const HIDEABLE = ['overlay', 'rotate', 'debug', 'vignette', 'banner'];

/** The rule body for a class, so a single property can be checked. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} must exist in styles.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('the [hidden] reset', () => {
  it('declares a global rule with !important', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });

  it('declares it in the reset block, before any component rule', () => {
    const reset = css.indexOf('[hidden]');
    const firstComponent = Math.min(
      ...HIDEABLE.map((c) => {
        const i = css.indexOf(`.${c} {`);
        return i === -1 ? Number.POSITIVE_INFINITY : i;
      }),
    );
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(firstComponent);
  });

  it('leaves no component rule relying on its own [hidden] guard', () => {
    // Per-component guards were the inconsistency that let the overlay slip
    // through. The global reset makes them redundant; keeping them invites
    // the next component to be forgotten.
    expect(css).not.toMatch(/\.(debug|overlay|rotate|vignette|banner)\[hidden\]/);
  });
});

describe('nothing covers the game unless it is meant to', () => {
  it('ships every covering element hidden in the markup', () => {
    // The bug was a covering element visible at rest. Whether it blocks input
    // once shown is a design choice; being visible at rest never is.
    for (const id of ['pause', 'rotate', 'vignette', 'banner']) {
      const tag = new RegExp(`id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(tag, `#${id} must ship hidden`).toContain('hidden');
    }
  });

  it('blocks input while the pause overlay is up, which is the point', () => {
    // Pause freezes the simulation, so the frame behind is stale. Letting a
    // swipe through it would be a gesture the player cannot see the result of.
    const overlay = rule('.overlay');
    expect(overlay).toMatch(/inset:\s*0/);
    expect(overlay).not.toContain('pointer-events: none');
  });

  it('keeps the result banner non-interactive', () => {
    // The banner is a line of text over a live scene, not a modal.
    expect(rule('.banner')).toContain('pointer-events: none');
  });

  it('still blocks play for the portrait request, which should block', () => {
    const rotate = rule('.rotate');
    expect(rotate).toMatch(/inset:\s*0/);
    expect(rotate).not.toContain('pointer-events: none');
  });

  it('puts both overlays above the gameplay surface', () => {
    const surfaceZ = Number(/#surface\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    const overlayZ = Number(/\.overlay\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    expect(surfaceZ).toBeLessThan(overlayZ);
  });
});

describe('markup and code agree', () => {
  it('declares every element the campaign shell toggles', () => {
    const shell = readFileSync('src/campaign.ts', 'utf8');
    for (const id of ['pause', 'btn-resume', 'banner', 'rotate', 'surface', 'stage', 'level-hud']) {
      expect(html, `#${id} must exist in index.html`).toContain(`id="${id}"`);
      expect(shell, `#${id} must be referenced by campaign.ts`).toContain(id);
    }
  });

  it('offers no way to pause on purpose', () => {
    // Pause happens because the player left, not because they asked. A pause
    // button on a one-thumb game is a target to hit by accident mid-run.
    expect(html).not.toContain('id="btn-pause"');
    for (const file of ['src/campaign.ts', 'src/main.ts', 'src/level2.ts']) {
      expect(readFileSync(file, 'utf8'), `${file} must not request a pause`)
        .not.toMatch(/pause\('user'\)/);
    }
  });
});
