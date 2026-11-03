// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Points } from 'three';
import { LevelRunner } from '../src/levels/runner';
import { LEVEL_1 } from '../src/levels/level1';
import { DRAW_DISTANCE, EntityVisuals } from '../src/render/entities';

/** Mirrors the pool size in entities.ts; small and fixed by design. */
const SPOTLIGHT_POOL = 3;

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

  it('creates no object per batched hazard', () => {
    const { visuals } = build();
    const gifts = LEVEL_1.entities.filter((e) => e.kind === 'gift').length;
    const batched = LEVEL_1.entities.filter(
      (e) => e.style === 'laser' || e.style === 'fence',
    ).length;
    const spotlights = LEVEL_1.entities.filter((e) => e.style === 'spotlight').length;

    expect(batched, 'the level should contain batched hazards').toBeGreaterThan(2);
    expect(spotlights, 'the level should contain spotlights').toBeGreaterThan(2);

    // One child per gift, plus the shared bar batch, the sparkle field, and
    // a fixed pool of cones. Crucially: nothing scales with the number of
    // lasers, fences or spotlights.
    const perEntity = visuals.group.children.length - gifts;
    expect(perEntity, 'batched hazards must not add children').toBeLessThanOrEqual(
      2 + SPOTLIGHT_POOL,
    );
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

describe('gameplay visuals track the simulation', () => {
  it('places each drawn entity in its own lane', () => {
    const { visuals, runner } = build();
    visuals.update(runner.tracked, 1 / 60);

    const laneX = (lane: number): number =>
      (lane - (LEVEL_1.laneCount - 1) / 2) * LEVEL_1.laneWidth;

    // Gifts are the entities that keep their own object; hazards are batched.
    for (const t of runner.tracked.filter((x) => x.entity.kind === 'gift')) {
      const object = visuals.objectFor(t.entity.id);
      expect(object, `no visual for ${t.entity.id}`).not.toBeNull();
      expect(object?.position.x, `${t.entity.id} lane`).toBeCloseTo(laneX(t.entity.lane), 6);
    }
    visuals.dispose();
  });

  it('brings an approaching gift closer as the route advances', () => {
    const { visuals, runner } = build();
    const gift = runner.tracked.find((t) => t.entity.kind === 'gift' && t.entity.z > 60);
    expect(gift).toBeDefined();

    // Advance until it is inside draw distance, then sample.
    while ((gift?.relativeZ ?? 0) >= DRAW_DISTANCE && !runner.isComplete) {
      runner.update(1 / 60);
      visuals.update(runner.tracked, 1 / 60);
    }
    const mesh = visuals.objectFor(gift?.entity.id ?? '');
    expect(mesh).not.toBeNull();
    const startZ = mesh?.position.z ?? 0;

    for (let i = 0; i < 60; i++) {
      runner.update(1 / 60);
      visuals.update(runner.tracked, 1 / 60);
    }
    // position.z is -relativeZ, so closing the distance raises it toward 0.
    expect(mesh?.position.z ?? 0).toBeGreaterThan(startZ);
    expect(gift?.relativeZ ?? 0).toBeLessThan(gift?.entity.z ?? 0);
    visuals.dispose();
  });
});
