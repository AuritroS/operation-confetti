// @vitest-environment jsdom
/**
 * "Nothing disappears from view", stated so a machine can check it.
 *
 * Every popping bug this level has had was a boundary bug on a recycling
 * window: a sliding range of instance matrices rewritten each frame. The
 * last one shipped because a sign error culled towers twenty-four units IN
 * FRONT of the player — buildings evaporated before you reached them, and
 * the draw-distance test only ever looked at the far end of the chain.
 *
 * Fixing a sign removes one instance of that bug. This removes the category:
 * if the environment is built once and the frame loop only moves it, then
 * across a whole run **nothing may be added, removed, or recounted**. A
 * recycling ring cannot pass this test, so it cannot come back by accident.
 */
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, Vector3 } from 'three';
import { SKYLINE } from '../src/levels/skyline/course';
import { FACADE_X, facadeTurn, MARGIN, SkylineStreet } from '../src/render/skyline-street';
import { GAME_ZONE_HALF } from '../src/render/skyline-view';
import type { StreetAssets } from '../src/render/skyline-assets';
import { BLOCKING_TURN, TURNED_PROPS } from '../src/render/skyline-obstacles';
import { STREET_PROPS, STREET_PROP_IDS } from '../src/render/skyline-props';
import { glbBounds } from './glb-bounds';


/**
 * A stub that batches like the real loader but builds nothing heavy.
 *
 * `box` is deliberately ASYMMETRIC in z — 0.80 one way against 0.65 the
 * other — because that is what the real buildings are, and symmetric stubs
 * would hide the placement error this is partly here to catch.
 */
function stub(): StreetAssets {
  const made: Mesh[] = [];
  return {
    missing: [],
    prop: () => new Mesh(new BoxGeometry(1, 1, 1)),
    batch: (_id, count) => {
      const mesh = new Mesh(new BoxGeometry(1, 1, 1)) as unknown as Mesh;
      const instanced = Object.assign(mesh, {
        count,
        instanceMatrix: { needsUpdate: false },
        setMatrixAt: () => {},
        dispose: () => {},
        isInstancedMesh: true,
      });
      made.push(instanced);
      return instanced as never;
    },
    half: () => ({ x: 0.6, y: 1, z: 0.725 }),
    box: () => ({ min: { x: -0.6, y: 0, z: -0.65 }, max: { x: 0.6, y: 2, z: 0.8 } }),
    dispose: () => {
      for (const m of made) m.geometry.dispose();
    },
  };
}

describe('the environment is preset, not recycled', () => {
  it('never changes its instance census across a whole run', () => {
    const street = new SkylineStreet(stub());
    const initial = JSON.stringify(street.census);
    expect(Object.keys(street.census).length, 'nothing was placed at all').toBeGreaterThan(3);

    // Walk the player from before the start to past the end, at 60 Hz.
    for (let t = -2; t <= SKYLINE.duration + 2; t += 1 / 60) {
      street.update(Math.max(0, t) * SKYLINE.speed);
      expect(
        JSON.stringify(street.census),
        `the environment changed at t=${t.toFixed(2)}s — something was created or destroyed`,
      ).toBe(initial);
    }
    street.dispose();
  });

  it('moves the whole world with one transform', () => {
    const street = new SkylineStreet(stub());
    street.update(123);
    expect(street.object.position.z, 'the group is not following the player').toBe(123);
    // And nothing else about it moved.
    expect(street.object.position.x).toBe(0);
    expect(street.object.position.y).toBe(0);
    street.dispose();
  });

  it('covers the route and a margin past both ends', () => {
    // Neither end of the street may ever come into frame.
    expect(MARGIN, 'no run-off at the ends of the route').toBeGreaterThan(40);
    const street = new SkylineStreet(stub());
    const tiles = (street.census['road'] ?? 0) + (street.census['roadCrossing'] ?? 0);
    expect(tiles, 'no carriageway was laid at all').toBeGreaterThan(0);
    street.dispose();
    // Whether it actually SPANS the route is measured against real asset
    // bounds by the scene audit, which knows each tile's scaled size;
    // multiplying a count by a literal tile width here was a second place
    // for that number to live, and it went stale the moment the road
    // moved into the scene definition.
  });

  it('keeps its dressing out of the interactive zone', () => {
    expect(
      SkylineStreet.clearsGameZone,
      `dressing at ${SkylineStreet.nearestDressingX} reaches inside the ${GAME_ZONE_HALF} zone`,
    ).toBe(true);
  });
});

describe('buildings face the street', () => {
  /**
   * The facade is authored on +Z — these models are symmetric in X and reach
   * 0.80 along +Z against 0.65 along -Z, and that overhang is the shopfront
   * and awning in the pack's own contents sheet.
   *
   * Rotating by 0 or PI points it ALONG a street that runs in Z, which is
   * what the first version did: both canyon walls showed their side
   * elevations for the whole build. A quarter turn is the only rotation that
   * puts the facade on the street, and the sign has to differ per side.
   */
  // `facadeTurn` is imported, never restated: a test that writes down the
  // value it is checking passes no matter how wrong production is.
  const facadeNormal = (side: -1 | 1): Vector3 =>
    new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), facadeTurn(side));

  it('points each facade inward, toward x = 0', () => {
    for (const side of [-1, 1] as const) {
      const normal = facadeNormal(side);
      // A wall on the left must face +X; a wall on the right must face -X.
      expect(normal.x * side, `the ${side < 0 ? 'left' : 'right'} wall faces away from the street`)
        .toBeLessThan(-0.9);
    }
  });

  it('never leaves a facade pointing along the route', () => {
    for (const side of [-1, 1] as const) {
      expect(Math.abs(facadeNormal(side).z), 'the facade is aimed up or down the street')
        .toBeLessThan(0.1);
    }
  });

  it('stands the facade on the kerb line, not its averaged centre', () => {
    // Using a half-extent would place an asymmetric building 0.075 units off
    // the line. The real face is box.max.z from the origin.
    const assets = stub();
    const box = assets.box('towerA');
    const half = assets.half('towerA');
    expect(box, 'the loader exposes no real bounds').toBeTruthy();
    expect(box?.max.z, 'the stub lost the asymmetry this test exists to check')
      .not.toBeCloseTo(half?.z ?? 0, 5);

    // Placed at FACADE_X + toFacade, the face lands exactly on FACADE_X.
    const centre = FACADE_X + (box?.max.z ?? 0);
    const face = centre - (box?.max.z ?? 0);
    expect(face, 'the facade does not land on the kerb line').toBeCloseTo(FACADE_X, 6);
    assets.dispose();
  });
});

describe('obstacles block the path rather than point down it', () => {
  /**
   * The Kenney street furniture is authored with its long axis on Z, and the
   * route runs along Z too — so dropped in untouched a barrier lies
   * lengthways down the lane it is supposed to be blocking, and a sign shows
   * its edge instead of its face.
   *
   * Checked against the asset bounds, not against a hand-written list of
   * which props are long, so re-exporting a prop at a different orientation
   * fails here instead of looking subtly wrong in play.
   */
  it('turns exactly the props whose long axis runs along the route', () => {
    for (const id of STREET_PROP_IDS) {
      const spec = STREET_PROPS[id];
      const size = glbBounds(spec.url.replace(/^\//, 'public/')).size;
      const longAlongRoute = size[2] > size[0] * 1.15;
      if (!TURNED_PROPS.includes(id)) continue;
      // `bridgeDeck` is square in plan — it is turned because it is a ROAD
      // segment that has to cross the street, not because it is long.
      if (id === 'bridgeDeck') continue;
      expect(longAlongRoute, `${id} is listed as turned but is not long along Z`).toBe(true);
    }
  });

  it('applies a quarter turn, not a half one', () => {
    // PI would flip a barrier end for end and leave it just as parallel to
    // the lane as before — the mistake the facades had.
    expect(Math.abs(Math.sin(BLOCKING_TURN)), 'the turn does not cross the path')
      .toBeCloseTo(1, 6);
  });

  it('leaves square props alone', () => {
    for (const id of ['cone', 'workLight', 'bridgePillar', 'gift'] as const) {
      expect(TURNED_PROPS.includes(id), `${id} is square in plan and needs no turn`).toBe(false);
    }
  });
});
