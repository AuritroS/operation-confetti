// @vitest-environment jsdom
/**
 * Two invariants that are invisible until a player loses a run to them.
 *
 * 1. **Decoration may not enter the interactive zone.** Level 1 enforces the
 *    same split with `isClearOfCorridor`; this is level 2's version. A
 *    streetlight inside the lanes is a hazard the runner has never heard of.
 *
 * 2. **A gap in the art may not be secretly solid.** The runner tests a swept
 *    box, so a row of props with daylight between them says "aim for the gap"
 *    while the collider says otherwise — and the reverse costs a run too: art
 *    overhanging the box reads as a wall where there is a way through.
 */
import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Mesh, Vector3, type Object3D } from 'three';
import { BAND, SKYLINE } from '../src/levels/skyline/course';
import { ANCHOR_HEIGHT } from '../src/levels/skyline/motion';
import { ObstacleKit } from '../src/render/skyline-obstacles';
import { SkylineStreet } from '../src/render/skyline-street';
import { GAME_ZONE_HALF } from '../src/render/skyline-view';
import type { StreetAssets } from '../src/render/skyline-assets';
import type { StreetPropId } from '../src/render/skyline-props';
import type { Entity } from '../src/levels/skyline/types';

const PROP_HALVES: Record<string, { x: number; y: number; z: number }> = {
  barrier: { x: 0.31, y: 0.525, z: 0.91 },
  cone: { x: 0.49, y: 0.61, z: 0.49 },
  signGantry: { x: 0.86, y: 4.60, z: 6.50 },
  signWarningDiamond: { x: 0.40, y: 0.87, z: 0.87 },
  signStopOctagon: { x: 0.40, y: 0.82, z: 0.82 },
  trafficLightHoriz: { x: 0.63, y: 0.40, z: 0.93 },
  trafficLightVert: { x: 0.40, y: 0.95, z: 0.40 },
  gift: { x: 0.80, y: 0.80, z: 0.80 },
};

/**
 * Prop provider matching the measured scaled extents of the approved Kenney assets.
 */
const UNIT: StreetAssets = {
  missing: [],
  prop: (id: StreetPropId): Object3D => {
    const h = PROP_HALVES[id] ?? { x: 0.5, y: 0.5, z: 0.5 };
    const mesh = new Mesh(new BoxGeometry(h.x * 2, h.y * 2, h.z * 2));
    mesh.position.y = h.y;
    return mesh;
  },
  batch: () => null,
  half: (id: StreetPropId) => PROP_HALVES[id] ?? { x: 0.5, y: 0.5, z: 0.5 },
  box: (id: StreetPropId) => {
    const h = PROP_HALVES[id] ?? { x: 0.5, y: 0.5, z: 0.5 };
    return { min: { x: -h.x, y: 0, z: -h.z }, max: { x: h.x, y: h.y * 2, z: h.z } };
  },
  dispose: () => {},
};

const hazards = SKYLINE.entities.filter((e) => e.kind === 'hazard');

function built(e: Entity): Box3 {
  const group = new ObstacleKit(UNIT).hazard(e);
  group.updateMatrixWorld(true);
  return new Box3().setFromObject(group);
}

describe('the interactive zone is separate from the environment', () => {
  it('keeps every street prop clear of the lanes', () => {
    expect(
      SkylineStreet.clearsGameZone,
      `dressing at ${SkylineStreet.nearestDressingX} reaches inside the ${GAME_ZONE_HALF} zone`,
    ).toBe(true);
  });

  it('keeps every gameplay entity inside the zone', () => {
    // No tolerance. The span hazards reach 4.5 and the zone was 4.4, which
    // I papered over with a +0.3 fudge; a contract with a fudge in it is not
    // a contract. The zone is 4.6 and everything fits inside it.
    for (const e of SKYLINE.entities) {
      expect(Math.abs(e.x) + e.halfX, `${e.id} spills outside the interactive zone`)
        .toBeLessThanOrEqual(GAME_ZONE_HALF);
    }
  });

  it('authors every hazard in one of the two canonical bands', () => {
    const bands = Object.entries(BAND);
    for (const e of hazards) {
      const span: [number, number] = [e.y - e.halfY, e.y + e.halfY];
      const match = bands.find(
        ([, [low, high]]) => Math.abs(span[0] - low) < 0.01 && Math.abs(span[1] - high) < 0.01,
      );
      expect(
        match,
        `${e.id} spans ${span[0]}-${span[1]}, which is neither band. A hazard ` +
          'between the bands depends on swing phase, which the player cannot control.',
      ).toBeTruthy();
    }
  });

  it('puts the lanes well inside the zone', () => {
    expect(SKYLINE.laneWidth).toBeLessThan(GAME_ZONE_HALF);
  });
});

describe('obstacle art covers its own collider', () => {
  it('has hazards to check', () => {
    expect(hazards.length).toBeGreaterThan(8);
  });

  it('spans the full collider width, so no gap is secretly solid', () => {
    for (const e of hazards) {
      const box = built(e);
      expect(box.min.x, `${e.id} leaves the left of its collider open`)
        .toBeLessThanOrEqual(-e.halfX + 0.05);
      expect(box.max.x, `${e.id} leaves the right of its collider open`)
        .toBeGreaterThanOrEqual(e.halfX - 0.05);
    }
  });

  it('places every hazard within the player trajectory band', () => {
    for (const e of hazards) {
      const box = built(e);
      if (e.y - e.halfY < 0.6) {
        expect(box.min.y, `${e.id} ground art floats above road`).toBeLessThanOrEqual(-e.halfY + 0.05);
        expect(box.max.y, `${e.id} ground art is too short to block runner`).toBeGreaterThanOrEqual(-e.halfY + 1.0);
      } else {
        expect(box.min.y, `${e.id} overhead art starts above swing apex`).toBeLessThanOrEqual(0.5);
        expect(box.max.y, `${e.id} overhead art ends below swing path`).toBeGreaterThanOrEqual(-0.5);
      }
    }
  });

  /**
   * The honest rule is not "art may not exceed the collider" — it is **art
   * may not claim a place the player can go**.
   *
   * A bridge pillar standing on the kerb reaches well past the deck's
   * collider, and must: a span floating on nothing is a worse lie than a
   * support the player can never touch. What would be a real lie is art
   * covering a part of the INTERACTIVE ZONE that the collider does not,
   * because that reads as a blocked lane which is actually open.
   *
   * So the test is scoped to the zone. Outside it, structure is free.
   */
  it('never claims a part of the interactive zone its collider does not', () => {
    for (const e of hazards) {
      const box = built(e);
      const artMin = e.x + box.min.x;
      const artMax = e.x + box.max.x;
      const blockedMin = e.x - e.halfX;
      const blockedMax = e.x + e.halfX;
      // Where the art intrudes into the zone beyond what the collider blocks.
      const leftLie = Math.min(blockedMin, Math.max(-GAME_ZONE_HALF, artMin));
      const rightLie = Math.max(blockedMax, Math.min(GAME_ZONE_HALF, artMax));
      expect(blockedMin - leftLie, `${e.id} art blocks open space on its left`)
        .toBeLessThan(0.05);
      expect(rightLie - blockedMax, `${e.id} art blocks open space on its right`)
        .toBeLessThan(0.05);
    }
  });

  it('supports every overhead hazard, from below or above', () => {
    // A deck spanning the street is carried on pillars to the road; a
    // single-lane sign hangs from the overhead cable line. Either is honest;
    // floating is not.
    for (const e of hazards) {
      const clearance = e.y - e.halfY;
      if (clearance < 0.6) continue;
      const box = built(e);
      const toRoad = box.min.y <= -e.halfY - clearance + 0.6;
      const toCable = box.max.y >= ANCHOR_HEIGHT - e.y - 0.6;
      expect(toRoad || toCable, `${e.id} hangs in mid-air with nothing holding it up`).toBe(true);
    }
  });

  it('keeps ground obstacles standing on the road, not floating', () => {
    for (const e of hazards) {
      if (e.y - e.halfY >= 0.6) continue;
      const box = built(e);
      expect(box.min.y, `${e.id} ground obstacle floats above the road`)
        .toBeLessThanOrEqual(-e.halfY + 0.05);
      const size = box.getSize(new Vector3());
      expect(size.y, `${e.id} is too short to block a runner`)
        .toBeGreaterThanOrEqual(1.0);
    }
  });
});
