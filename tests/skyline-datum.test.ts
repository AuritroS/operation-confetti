/**
 * One number, got wrong twice in opposite directions.
 *
 * A KayKit road was a solid slab whose TOP was the walking surface, so props
 * placed at y=0 sank into it and the fix was to sink the tile by its own
 * height. A Kenney tile is a thin plate with RAISED KERBS — its bounding-box
 * top is the pavement and its carriageway is at the bottom — so carrying that
 * sink across lifted the road out from under everything and left Matthew, the
 * obstacles and the dressing floating 0.34 units in the air.
 *
 * Neither error was catchable by reasoning about thickness, because where the
 * walkable surface sits inside a bounding box depends on how the prop is
 * modelled. So this pins the contract instead:
 *
 *     the carriageway, y = 0, and the character's soles all agree.
 *
 * If a road asset is ever swapped again, this fails rather than the street
 * quietly going up or down by a few centimetres.
 */
import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { glbBounds } from './glb-bounds';
import { SKYLINE } from '../src/levels/skyline/course';
import { STREET_PROPS } from '../src/render/skyline-props';
import { HERO_HEIGHT } from '../src/render/skyline-hero';

/** How far the hero's soles sit below the origin the runner positions. */
const FOOT_DROP = 1.24;
/** Tolerance in world units — about a centimetre at this scale. */
const EPSILON = 0.02;

const scaled = (id: 'road' | 'roadCrossing') => {
  const spec = STREET_PROPS[id];
  const bounds = glbBounds(spec.url.replace(/^\//, 'public/'));
  return {
    low: bounds.min[1] * spec.scale,
    high: bounds.max[1] * spec.scale,
    height: bounds.size[1] * spec.scale,
  };
};

describe('the street datum', () => {
  /**
   * The distinction the two bugs turned on: a PLATE with kerbs (walk on the
   * bottom, base-seat it) versus a SLAB (walk on the top, sink it).
   *
   * A plate is wide and thin. If a road asset is ever swapped for something
   * whose height approaches its width, it is a slab, base-seating is wrong,
   * and the street layer has to sink it again — so fail here rather than let
   * the street silently move.
   */
  it('is a thin plate with a kerb, not a slab to stand on top of', () => {
    for (const id of ['road', 'roadCrossing'] as const) {
      const spec = STREET_PROPS[id];
      const bounds = glbBounds(spec.url.replace(/^\//, 'public/'));
      const width = bounds.size[0] * spec.scale;
      const height = bounds.size[1] * spec.scale;
      expect(height / width, `${id} is too thick to be a road plate`).toBeLessThan(0.05);
      // And it must have SOME height, or there is no kerb and the "lowest
      // surface is the carriageway" reasoning has nothing to stand on.
      expect(height, `${id} is perfectly flat, so it has no kerb`).toBeGreaterThan(0.05);
    }
  });

  it('raises the kerb above the carriageway by a plausible step', () => {
    for (const id of ['road', 'roadCrossing'] as const) {
      const tile = scaled(id);
      const kerb = tile.high - tile.low;
      // ~0.1-0.3 m at this scale (1.363 units per metre).
      expect(kerb, `${id} kerb of ${kerb.toFixed(2)}u is not a kerb`).toBeGreaterThan(0.1);
      expect(kerb, `${id} kerb of ${kerb.toFixed(2)}u is a wall`).toBeLessThan(0.6);
    }
  });

  it('stands the character on the carriageway, not above or inside it', () => {
    // The runner positions the hero ORIGIN at groundY while running; the
    // soles are FOOT_DROP below that.
    const soles = SKYLINE.groundY - FOOT_DROP;
    expect(Math.abs(soles), `soles land at y=${soles.toFixed(3)}, not on the road`)
      .toBeLessThan(EPSILON);
  });

  it('keeps the hero height and the foot drop consistent', () => {
    // FOOT_DROP is part of HERO_HEIGHT, so a change to one without the other
    // would silently move the character off the ground.
    expect(FOOT_DROP).toBeLessThan(HERO_HEIGHT);
    expect(HERO_HEIGHT - FOOT_DROP, 'the head would be below the waist')
      .toBeGreaterThan(0.8);
  });

  it('never buries a road marking inside the surface it is painted on', () => {
    // The low-anchor marking sits on the carriageway; if it were thinner
    // than nothing it would z-fight the road it is drawn over.
    const mark = STREET_PROPS['lowAnchor'];
    const height = glbBounds(mark.url.replace(/^\//, 'public/')).size[1] * mark.scale;
    expect(height, 'the landing marking has no thickness to lift it clear')
      .toBeGreaterThan(0.01);
    expect(height, 'the landing marking is tall enough to be an obstacle')
      .toBeLessThan(0.2);
  });

  it('has clean 3-lane dividers at +/-1.6m and no center line under lane 0', async () => {
    const io = new NodeIO();
    const doc = await io.read('public/models/city/road-straight.glb');
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const pos = prim.getAttribute('POSITION')!.getArray()!;
    const uv = prim.getAttribute('TEXCOORD_0')!.getArray()!;
    const idx = prim.getIndices()!.getArray()!;

    // Find all white painted triangles (UV ~ [0.406, 0.875])
    const whiteZ: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]!;
      const u = uv[a * 2]!, v = uv[a * 2 + 1]!;
      if (Math.abs(u - 0.406) < 0.01 && Math.abs(v - 0.875) < 0.01) {
        // Average Z of the triangle scaled to world units (x 19)
        const b = idx[i + 1]!, c = idx[i + 2]!;
        const zAvg = ((pos[a * 3 + 2]! + pos[b * 3 + 2]! + pos[c * 3 + 2]!) / 3) * 19;
        whiteZ.push(zAvg);
      }
    }

    expect(whiteZ.length, 'road must have painted white dividing stripes').toBeGreaterThan(0);

    // No white line running down the center of lane 0 (between -0.5m and +0.5m)
    const centerMarkings = whiteZ.filter((z) => Math.abs(z) < 0.5);
    expect(centerMarkings.length, 'lane 0 must be clean asphalt, not straddling a center line').toBe(0);

    // Dividers must be centered around +/-1.60m (the boundaries between lanes -1, 0, and +1)
    const leftDividers = whiteZ.filter((z) => z < -1.0 && z > -2.2);
    const rightDividers = whiteZ.filter((z) => z > 1.0 && z < 2.2);
    expect(leftDividers.length, 'must have left lane dividers').toBeGreaterThan(0);
    expect(rightDividers.length, 'must have right lane dividers').toBeGreaterThan(0);

    const leftMean = leftDividers.reduce((s, z) => s + z, 0) / leftDividers.length;
    const rightMean = rightDividers.reduce((s, z) => s + z, 0) / rightDividers.length;
    expect(leftMean).toBeCloseTo(-1.60, 1);
    expect(rightMean).toBeCloseTo(1.60, 1);
  });
});
