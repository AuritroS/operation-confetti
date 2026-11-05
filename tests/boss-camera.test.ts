import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BOSS_LAYOUT } from '../src/levels/boss/layout';
import { BOSS_ACTORS } from '../src/assets/boss/catalog';
import { BossCamera } from '../src/render/boss/camera';
import { TOWER_AXIS_Z, TOWER_BEACON_Y } from '../src/render/boss/tower';

/**
 * Portrait framing invariants for the Level 3 confrontation camera.
 *
 * Every position here is derived from the data the scene is actually built
 * from. The previous version projected hardcoded literals — an arch apex of
 * 6.38 and a boss head at `bossStageY + 4.23` — which meant it passed happily
 * while Aurora measured 1.31x Matthew on screen, and then failed the moment
 * the real geometry was fixed. A framing test pinned to copied numbers
 * records a snapshot, not an invariant.
 *
 * Scope: this asserts where the camera puts known anchors. It cannot see the
 * built scene — the loaded GLBs, the merged crown, the tower's own geometry —
 * because that needs WebGL. Real-scene measurement is `tools/boss-capture.mjs`,
 * which serves the standalone build and reads bounds off `window.level3`.
 */

/** The project's portrait matrix, narrowest and tallest included. */
const VIEWPORTS = [[360, 800], [375, 667], [390, 844], [430, 932]] as const;

const HERO_FOOT = BOSS_LAYOUT.playerY;
const HERO_HEAD = BOSS_LAYOUT.playerY + BOSS_ACTORS.matthew.targetHeight;
/** Her holder clears the dais by this much before the hover offset. */
const BOSS_FOOT = BOSS_LAYOUT.bossStageY + 0.08 + BOSS_LAYOUT.bossFloat;
const BOSS_HEAD = BOSS_FOOT + BOSS_ACTORS.aurora.targetHeight;

describe('Level 3 portrait framing', () => {
  it.each(VIEWPORTS)('frames the fight at %ix%i', (width, height) => {
    const view = new BossCamera();
    view.resize(width, height);
    view.camera.updateMatrixWorld();
    const project = (x: number, y: number, z: number) => new Vector3(x, y, z).project(view.camera);

    // Matthew: whole silhouette on screen in every lane, feet off the bottom.
    let heroHeight = 0;
    for (const x of BOSS_LAYOUT.laneCentres) {
      const feet = project(x, HERO_FOOT, BOSS_LAYOUT.playerZ);
      const head = project(x, HERO_HEAD, BOSS_LAYOUT.playerZ);
      expect(Math.abs(head.x)).toBeLessThan(0.85);
      expect(feet.y).toBeGreaterThan(-0.78);
      expect(head.y).toBeLessThan(-0.1);
      heroHeight = head.y - feet.y;
    }

    const bossFeet = project(0, BOSS_FOOT, BOSS_LAYOUT.bossZ);
    const bossHead = project(0, BOSS_HEAD, BOSS_LAYOUT.bossZ);
    expect(bossHead.y).toBeLessThan(0.92);
    expect(bossFeet.y).toBeGreaterThan(-0.15);

    // She has to out-measure him on screen, not merely in world units: the
    // lens is about twice as far from her as from him, so perspective eats
    // most of a raw height ratio. Below ~1.3 she stops reading as the boss.
    const bossHeight = bossHead.y - bossFeet.y;
    expect(bossHeight / heroHeight).toBeGreaterThan(1.3);

    // Clear air between them. This is the separation the low camera buys, and
    // it closes if the eye height drops or Aurora is pushed further back.
    expect(bossFeet.y - project(0, HERO_HEAD, BOSS_LAYOUT.playerZ).y).toBeGreaterThan(0.15);

    // The stolen cake is the plot object; it may never leave the frame.
    const cake = project(BOSS_LAYOUT.cakeX, BOSS_LAYOUT.bossStageY + 1.53, BOSS_LAYOUT.cakeZ);
    expect(cake.x).toBeGreaterThan(0.15);
    expect(cake.x).toBeLessThan(0.65);
    expect(cake.y).toBeGreaterThan(-0.1);

    // The whole landmark fits, tip included. This is the constraint that sets
    // every proportion above the shaft, and the shortest viewport is the one
    // that breaks first.
    const beacon = project(0, TOWER_BEACON_Y, TOWER_AXIS_Z);
    expect(beacon.y).toBeGreaterThan(0.4);
    expect(beacon.y).toBeLessThan(0.93);
  });
});
