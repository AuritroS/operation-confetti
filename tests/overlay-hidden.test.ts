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
 * These are source-level assertions rather than computed-style ones: jsdom
 * does not implement `!important` in getComputedStyle, so asserting through it
 * would test jsdom's cascade rather than the stylesheet. The guarantee being
 * relied on is a CSS rule, not a browser quirk — an `!important` author
 * declaration beats a normal author declaration regardless of specificity or
 * order — so the thing worth locking down is that the reset is present and
 * that no component rule is left depending on source order.
 */

const css = readFileSync('src/styles.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

/** Every class in the markup that is toggled via the `hidden` attribute. */
const HIDEABLE = ['pause-pill', 'rotate', 'debug', 'hint'];

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
    // Per-component guards were the inconsistency that let .overlay slip
    // through. The global reset makes them redundant; keeping them invites
    // the next component to be forgotten.
    expect(css).not.toMatch(/\.(debug|pause-pill|hint)\[hidden\]/);
  });
});

describe('pause never blocks input', () => {
  it('ships no full-screen overlay in the markup', () => {
    expect(html).not.toContain('class="overlay"');
    expect(css).not.toContain('.overlay__card');
  });

  it('keeps the pause pill non-interactive so a resume tap passes through', () => {
    const start = css.indexOf('.pause-pill {');
    expect(start).toBeGreaterThan(-1);
    expect(css.slice(start, css.indexOf('}', start))).toContain('pointer-events: none');
  });

  it('does not stretch the pause pill across the viewport', () => {
    const start = css.indexOf('.pause-pill {');
    const rule = css.slice(start, css.indexOf('}', start));
    // `inset: 0` is what made the old overlay a full-screen input wall.
    expect(rule).not.toMatch(/inset:\s*0/);
  });

  it('leaves the gameplay surface below the pill in z-order', () => {
    const surfaceZ = Number(/#surface\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    const pillZ = Number(/\.pause-pill\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    expect(surfaceZ).toBeLessThan(pillZ);
  });

  it('still blocks play for the portrait request, which should block', () => {
    // The rotate prompt is the one case where a full-screen wall is correct:
    // the game is unplayable in landscape.
    const start = css.indexOf('.rotate {');
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toMatch(/inset:\s*0/);
    expect(rule).not.toContain('pointer-events: none');
  });
});

describe('markup and code agree', () => {
  it('declares every element main.ts toggles', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    for (const id of ['pause', 'pause-note', 'rotate', 'hint', 'surface', 'stage']) {
      expect(html, `#${id} must exist in index.html`).toContain(`id="${id}"`);
      expect(main, `#${id} must be referenced by main.ts`).toContain(id);
    }
  });
});
