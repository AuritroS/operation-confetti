// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Group, InstancedMesh, Points } from 'three';
import { LevelRunner } from '../src/levels/runner';
import { LEVEL_1 } from '../src/levels/level1';
import { EntityVisuals } from '../src/render/entities';

/**
 * The gameplay visuals are batched on purpose, and these tests are what stop
 * that quietly regressing.
 *
 * The scene was already at 75 of a 100 draw-call budget before any gameplay
 * art existed. A mesh per laser and a particle system per gift would have
 * been nine extra calls for an effect that is a handful of dots. Measured
 * after batching, the whole gameplay layer costs about eight.
 */

function build(): { visuals: EntityVisuals; runner: LevelRunner } {
  const runner = new LevelRunner(LEVEL_1);
  // No prop provider: exercises the primitive fallback path, which is what
  // a player sees if an asset fails to load.
  const visuals = new EntityVisuals(LEVEL_1, runner.tracked, () => null);
  return { visuals, runner };
}

describe('gameplay visuals are batched', () => {
  it('draws every laser from a single instanced mesh', () => {
    const { visuals } = build();
    const instanced = visuals.group.children.filter((c) => c instanceof InstancedMesh);
    const lasers = LEVEL_1.entities.filter((e) => e.style === 'laser');

    expect(lasers.length, 'the level should contain lasers to batch').toBeGreaterThan(1);
    expect(instanced, 'all lasers share one InstancedMesh').toHaveLength(1);
    visuals.dispose();
  });

  it('draws every sparkle from a single particle system', () => {
    const { visuals } = build();
    const points = visuals.group.children.filter((c) => c instanceof Points);
    expect(points, 'one SparkleField for the whole level').toHaveLength(1);
    visuals.dispose();
  });

  it('creates no object per laser beyond the shared batch', () => {
    const { visuals } = build();
    const lasers = LEVEL_1.entities.filter((e) => e.style === 'laser').length;
    const others = LEVEL_1.entities.length - lasers;

    // One child per non-laser entity, plus the laser batch and the sparkle
    // field. Anything more means something stopped being pooled.
    expect(visuals.group.children.length).toBe(others + 2);
    visuals.dispose();
  });

  it('releases everything on dispose, so a replay cannot accumulate', () => {
    const { visuals } = build();
    expect(visuals.group.children.length).toBeGreaterThan(0);
    visuals.dispose();
    expect(visuals.group.children).toHaveLength(0);
  });

  it('survives a full route without a prop provider', () => {
    // The fallback path has to carry a whole run, or a failed asset load
    // turns into a broken level rather than a plainer one.
    const { visuals, runner } = build();
    let steps = 0;
    while (!runner.isComplete && steps < 20_000) {
      runner.update(1 / 60);
      visuals.update(runner.tracked, 1 / 60);
      steps++;
    }
    expect(runner.isComplete).toBe(true);
    visuals.dispose();
  });

  it('hides a gift once collected and stops its sparkle', () => {
    const { visuals, runner } = build();
    const gift = runner.tracked.find((t) => t.entity.kind === 'gift' && t.entity.scored);
    expect(gift).toBeDefined();

    const delta = (gift?.entity.lane ?? 1) - runner.snapshot.laneIndex;
    if (delta !== 0) runner.swipe(delta > 0 ? 1 : -1);
    while (gift?.state === 'pending' && !runner.isComplete) {
      runner.update(1 / 60);
      visuals.update(runner.tracked, 1 / 60);
    }
    expect(gift?.state).toBe('collected');
    visuals.dispose();
  });
});
