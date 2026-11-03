// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { LevelRunner } from '../src/levels/runner';
import { LEVEL_1 } from '../src/levels/level1';
import { STEP_S } from '../src/core/loop';
import { buildRoute, makeCapsulePlayer, RouteMarkers } from '../src/render/primitives';
import { EntityVisuals } from '../src/render/entities';

/**
 * Builds the real scene graph and drives it through a whole route without a
 * GL context, to catch runtime errors in the presentation layer.
 *
 * Per-entity assertions live in entities.test.ts instead: the gameplay
 * visuals are deliberately batched, so there is no longer one child per
 * entity and counting children here would only re-assert the batching from
 * the wrong angle.
 */
describe('scene graph', () => {
  function build() {
    const runner = new LevelRunner(LEVEL_1);
    const world = new Group();
    const markers = new RouteMarkers(LEVEL_1);
    const visuals = new EntityVisuals(LEVEL_1, runner.tracked, () => null);
    const player = makeCapsulePlayer();
    world.add(buildRoute(LEVEL_1), markers.group, visuals.group, player.object);
    return { runner, world, markers, visuals, player };
  }

  it('constructs without error and parents everything into one world', () => {
    const { world } = build();
    expect(world.children).toHaveLength(4);
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
