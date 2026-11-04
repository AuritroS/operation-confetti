/**
 * Why content fades in instead of appearing.
 *
 * Three constants have to agree or the street pops, and they have drifted
 * apart twice. The chain is:
 *
 *     CAMERA_FAR  >=  spawn distance  >=  FOG_HORIZON
 *
 * Break the right-hand side and content arrives before the fog has finished
 * hiding it, so it brightens into view from a visible starting opacity.
 * Break the left-hand side and it is sliced off by the frustum instead — a
 * hard edge, which is worse. The shipped bug broke both at once: towers were
 * placed 228 units ahead, the frustum ended at 162, and fog still left them
 * 17% visible where it cut them off.
 *
 * None of this is visible in a still. It only shows up in motion, which is
 * exactly why it needs a test rather than a screenshot.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMERA_DISTANCE,
  CAMERA_ASPECT_PULLBACK,
  CAMERA_FAR,
  CAMERA_NEAR,
  ENTITY_DRAW_AHEAD,
  FOG_DENSITY,
  FOG_HORIZON,
} from '../src/render/skyline-view';
import { STREET_AHEAD, TOWER_SPAWN_MARGIN } from '../src/render/skyline-street';

/** Worst-case lens stand-off: the portrait pull-back is additive. */
const CAMERA_Z = CAMERA_DISTANCE + CAMERA_ASPECT_PULLBACK;

/** Fraction of a surface still visible at `distance`, under exponential fog. */
const visibility = (distance: number) => Math.exp(-FOG_DENSITY * distance);

describe('draw distance, fog and frustum agree', () => {
  it('places the fog horizon where content is all but invisible', () => {
    expect(visibility(FOG_HORIZON), `${(visibility(FOG_HORIZON) * 100).toFixed(1)}% is not faded`)
      .toBeLessThan(0.06);
  });

  it('spawns the street past the fog horizon', () => {
    expect(STREET_AHEAD, 'the street appears before the fog has hidden it')
      .toBeGreaterThanOrEqual(FOG_HORIZON);
  });

  it('keeps everything it draws inside the frustum', () => {
    // Measured from the LENS, which sits behind the hero.
    const furthest = STREET_AHEAD + CAMERA_Z;
    expect(furthest, `street reaches ${furthest.toFixed(0)}u from the lens, past the far plane`)
      .toBeLessThanOrEqual(CAMERA_FAR);
  });

  it('never draws a tower between the lens and the hero', () => {
    // A tower placed "just behind the player" is drawn into the camera's
    // face: the span between lens and hero is in front of the lens.
    expect(TOWER_SPAWN_MARGIN).toBeGreaterThan(0);
  });

  it('shows entities far enough ahead to be read', () => {
    // The complaint this answers is that the next obstacle was invisible.
    // Four seconds of route at the course speed is the floor.
    const seconds = ENTITY_DRAW_AHEAD / 8.5;
    expect(seconds, `only ${seconds.toFixed(1)}s of route is drawn`).toBeGreaterThan(4);
    expect(ENTITY_DRAW_AHEAD + CAMERA_Z, 'entities are drawn past the far plane')
      .toBeLessThanOrEqual(CAMERA_FAR);
  });

  it('keeps depth precision usable at this far plane', () => {
    // Precision scales with far/near. At 0.1 near and a 380 far the ratio is
    // 3800, which z-fights the crossing tiles against the road beneath them.
    expect(CAMERA_FAR / CAMERA_NEAR, 'depth range is too wide to resolve the road surface')
      .toBeLessThanOrEqual(500);
  });

  it('still lets the player read the mid-ground', () => {
    // The other half of the complaint. Fog thick enough to hide the spawn
    // must not also hide the obstacle being approached: at five seconds out
    // it should still be clearly visible.
    const fiveSeconds = 5 * 8.5 + CAMERA_Z;
    expect(visibility(fiveSeconds), 'the next obstacle is lost in haze')
      .toBeGreaterThan(0.5);
  });
});
