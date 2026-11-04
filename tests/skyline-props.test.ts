/**
 * Proves the level 2 street scale space against the GLBs that actually ship.
 *
 * Level 1's equivalent checks only that the declared bounds are sane; its
 * comment claims a measured check that was never written. This one measures
 * each staged prop, applies the registered scale and compares, so a wrong
 * factor fails here instead of looking slightly odd on a phone.
 *
 * Bounds come from the glTF accessors rather than from GLTFLoader — see
 * `glb-bounds.ts` for why loading these through three.js hangs.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { glbBounds } from './glb-bounds';
import {
  STREET_PROPS,
  STREET_PROP_IDS,
  UNITS_PER_METRE,
  type StreetPropId,
} from '../src/render/skyline-props';

/** Staged path for a registry url, which may point at either pack. */
const staged = (id: StreetPropId): string => STREET_PROPS[id].url.replace(/^\//, 'public/');
const sizeOf = (id: StreetPropId) => glbBounds(staged(id)).size;

describe('level 2 street props', () => {
  it('registers a measured scale, bounds and a role for every prop', () => {
    for (const id of STREET_PROP_IDS) {
      const spec = STREET_PROPS[id];
      expect(spec.scale, `${id} scale`).toBeGreaterThan(0);
      expect(spec.scale, `${id} must be measured, not left at 1`).not.toBe(1);
      expect(spec.expect[0], `${id} bounds`).toBeLessThan(spec.expect[1]);
      expect(spec.expect[0], `${id} lower bound`).toBeGreaterThan(0);
      expect(spec.role.length, `${id} needs a role`).toBeGreaterThan(0);
      // Kenney entries are scaled by pack proportion, not real-world size,
      // and say so with metres: 0.
      const kenney = spec.url.includes('/models/city/');
      if (!kenney) {
        expect(spec.metres, `${id} needs the real-world size it came from`).toBeGreaterThan(0);
      }
    }
  });

  it('points every prop at a file the build produces', () => {
    for (const id of STREET_PROP_IDS) {
      expect(existsSync(staged(id)), `${id} -> ${staged(id)}; run npm run assets:build`).toBe(true);
    }
  });

  it('lands every scaled height inside its declared range', () => {
    for (const id of STREET_PROP_IDS) {
      const height = sizeOf(id)[1] * STREET_PROPS[id].scale;
      const [min, max] = STREET_PROPS[id].expect;
      expect(height, `${id} scaled height ${height.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      expect(height, `${id} scaled height ${height.toFixed(2)}`).toBeLessThanOrEqual(max);
    }
  });

  /**
   * The registry records the real-world size each scale came from. If the two
   * ever disagree the scale was nudged by eye, which is the failure the
   * registry exists to prevent.
   *
   * Road tiles and the bench are scaled by footprint and length rather than
   * height — both say so in the registry — and the gift is deliberately
   * oversized to fill its frozen collider, so all three are exempt from the
   * height reconciliation, not from the registry.
   */
  it('reconciles each height-derived scale with its stated metres', () => {
    for (const id of STREET_PROP_IDS) {
      // Only the KayKit entries claim a real-world size; the gift is
      // deliberately oversized to fill its frozen collider.
      if (STREET_PROPS[id].metres === 0 || id === 'gift') continue;
      const implied = (STREET_PROPS[id].metres * UNITS_PER_METRE) / sizeOf(id)[1];
      expect(
        Math.abs(implied - STREET_PROPS[id].scale) / STREET_PROPS[id].scale,
        `${id} scale ${STREET_PROPS[id].scale} does not follow from ${STREET_PROPS[id].metres} m`,
      ).toBeLessThan(0.02);
    }
  });

  it('keeps the canyon above the anchor line and the clutter below the player', () => {
    // The swing apex is y=11 and anchors sit at y=19, so a canyon wall that
    // did not clear both would read as a fence, not a street.
    for (const id of ['towerA', 'towerC', 'towerE', 'towerG'] as const) {
      expect(STREET_PROPS[id].expect[0], `${id} must clear the anchor line`).toBeGreaterThan(19);
    }
    // 2.385 units is the character. A cone and a barrier are things he steps
    // over; a site fence is genuinely taller than a person (2 m against 1.75),
    // so it is held to the player height plus a third rather than below him.
    for (const id of ['cone', 'barrier'] as const) {
      expect(STREET_PROPS[id].expect[1], `${id} should sit below the player`).toBeLessThan(2.385);
    }
    expect(STREET_PROPS['fence'].expect[1], 'fence dwarfs the player').toBeLessThan(2.385 * 1.34);
  });

  it('keeps the street surface flat enough to stand on', () => {
    // Every placement puts props at y=0 and assumes that is the road. A thick
    // road silently sinks everything standing on it by its own depth — which
    // is exactly what put the cars and Matthew under the tarmac.
    for (const id of ['road', 'roadCrossing'] as const) {
      expect(sizeOf(id)[1] * STREET_PROPS[id].scale, `${id} is too thick to be a surface`)
        .toBeLessThan(0.45);
    }
  });
});
