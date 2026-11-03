import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { LevelRunner } from '../src/levels/runner';
import { LEVEL_1 } from '../src/levels/level1';
import { STEP_S } from '../src/core/loop';
import {
  buildRoute,
  DRAW_DISTANCE,
  EntityVisuals,
  makeCapsulePlayer,
  RouteMarkers,
} from '../src/render/primitives';

/**
 * Builds the real scene graph and drives it through a whole route, without a
 * GL context. Catches runtime errors and desynchronisation in the
 * presentation layer that a pure-simulation test cannot see — the renderer
 * itself is the only part left needing a browser.
 */
describe('scene graph', () => {
  function build() {
    const runner = new LevelRunner(LEVEL_1);
    const world = new Group();
    const markers = new RouteMarkers(LEVEL_1);
    const visuals = new EntityVisuals(LEVEL_1, runner.tracked);
    const player = makeCapsulePlayer();
    world.add(buildRoute(LEVEL_1), markers.group, visuals.group, player.object);
    return { runner, world, markers, visuals, player };
  }

  it('constructs without error and parents everything into one world', () => {
    const { world } = build();
    expect(world.children).toHaveLength(4);
  });

  it('creates one visual per authored entity', () => {
    const { visuals } = build();
    expect(visuals.group.children).toHaveLength(LEVEL_1.entities.length);
  });

  it('drives a full route without throwing', () => {
    const { runner, markers, visuals, player } = build();
    let steps = 0;
    while (!runner.isComplete && steps < 20_000) {
      runner.update(STEP_S);
      const snap = runner.snapshot;
      markers.update(snap.travelled);
      visuals.update(runner.tracked, STEP_S);
      player.setHitFlash(snap.invulnerable);
      player.update(STEP_S, true);
      steps++;
    }
    expect(runner.isComplete).toBe(true);
  });

  it('places each entity visual at its own lane, mirroring the data', () => {
    const { runner, visuals } = build();
    const laneX = (lane: number) => (lane - (LEVEL_1.laneCount - 1) / 2) * LEVEL_1.laneWidth;
    for (const [i, t] of runner.tracked.entries()) {
      expect(visuals.group.children[i]?.position.x).toBeCloseTo(laneX(t.entity.lane), 6);
    }
  });

  it('moves entity visuals toward the player as the route advances', () => {
    const { runner, visuals } = build();

    // Track an obstacle outside the starting lane: it is never collected, so
    // it stays drawn for the whole approach. (A gift in the start lane would
    // be picked up and hidden mid-test.)
    const index = runner.tracked.findIndex(
      (t) => t.entity.kind === 'obstacle' && t.entity.lane !== runner.snapshot.laneIndex,
    );
    const target = runner.tracked[index]!;
    const mesh = visuals.group.children[index]!;

    // Positions are only meaningful inside draw distance, so advance until the
    // entity is actually being drawn before sampling.
    while (target.relativeZ >= DRAW_DISTANCE && !runner.isComplete) {
      runner.update(STEP_S);
      visuals.update(runner.tracked, STEP_S);
    }
    expect(mesh.visible).toBe(true);
    const startZ = mesh.position.z;
    expect(startZ).toBeLessThan(0);

    for (let i = 0; i < 60; i++) {
      runner.update(STEP_S);
      visuals.update(runner.tracked, STEP_S);
    }

    // position.z is -relativeZ, so closing the distance raises it toward 0.
    expect(mesh.position.z).toBeGreaterThan(startZ);
    expect(target.relativeZ).toBeLessThan(target.entity.z);
  });

  it('hides a gift once collected so it cannot be seen twice', () => {
    const { runner, visuals } = build();
    const gift = runner.tracked.find((t) => t.entity.kind === 'gift')!;

    // Move into the gift's lane, then run past it.
    const delta = gift.entity.lane - runner.snapshot.laneIndex;
    if (delta !== 0) runner.swipe(delta > 0 ? 1 : -1);
    while (gift.state === 'pending' && !runner.isComplete) {
      runner.update(STEP_S);
      visuals.update(runner.tracked, STEP_S);
    }

    expect(gift.state).toBe('collected');
    const mesh = visuals.group.children[runner.tracked.indexOf(gift)]!;
    expect(mesh.visible).toBe(false);
  });

  it('releases every visual on dispose, so a replay cannot accumulate meshes', () => {
    const { visuals, player } = build();
    const count = visuals.group.children.length;
    expect(count).toBeGreaterThan(0);
    visuals.dispose();
    player.dispose();
    expect(visuals.group.children).toHaveLength(0);
  });

  it('keeps the marker count bounded regardless of distance travelled', () => {
    const { markers } = build();
    const before = markers.group.children.length;
    markers.update(10_000);
    expect(markers.group.children).toHaveLength(before);
  });
});
