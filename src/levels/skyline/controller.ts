import type { LevelContext, LevelController, LevelOutcome } from '../../core/level';
import { SKYLINE } from './course';
import { SkylineRunner } from './runner';
import type { Course, Direction } from './types';
import { SkylineScene } from '../../render/skyline-scene';
import { LOOK } from '../../render/look';
import { loadStreetAssets } from '../../render/skyline-assets';
import { loadSkylineHero } from '../../render/skyline-hero';

/**
 * Level 2 as a mountable level.
 *
 * It owns the chase simulation and its scene and nothing else. Reward and
 * penalty feedback used to be derived here by diffing entity states against a
 * `collected` set; it is now driven by the `gift` and `incident` events the
 * runner already emits, so the campaign gets one feedback path for all three
 * levels instead of three bespoke ones.
 */
export class SkylineLevel implements LevelController {
  readonly view: SkylineScene;
  private runner: SkylineRunner;
  private ctx: LevelContext | null = null;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  result: LevelOutcome | null = null;

  constructor(host: LevelContext['host'], readonly course: Course = SKYLINE) {
    host.setExposure(LOOK.skyline.exposure);
    this.view = new SkylineScene(host, course);
    this.runner = new SkylineRunner(course);
  }

  async mount(ctx: LevelContext): Promise<void> {
    this.ctx = ctx;
    this.runner.onEvent((event) => ctx.emit(event));
    // Non-blocking: play starts on primitives and upgrades in place when the
    // street lands. A failed load leaves a playable level, not a stalled screen.
    void loadStreetAssets().then((assets) => this.view.useAssets(assets));
    void loadSkylineHero().then((hero) => { if (hero) this.view.useHero(hero); });
    // Draw one frame so the level is not blank behind a transition.
    this.update(0);
  }

  swipe(direction: Direction): void {
    this.runner.swipe(direction);
  }

  restart(): void {
    this.runner = new SkylineRunner(this.course);
    if (this.ctx) {
      const ctx = this.ctx;
      this.runner.onEvent((event) => ctx.emit(event));
    }
    this.view.reset();
    this.result = null;
    this.update(0);
  }

  /**
   * Advance the chase without input — a review affordance, like level 1's.
   *
   * Level 2 has no fail state: hazards cost points, not the run, so time can
   * be advanced safely to reach the end of the course.
   */
  fastForward(seconds: number): void {
    const step = 1 / 60;
    // The chase does not move until the first swipe launches it, so a skip
    // that only advances time would sit at the start line forever.
    if (!this.runner.snapshot.started) this.runner.swipe('up');
    for (let t = 0; t < seconds && !this.runner.snapshot.complete; t += step) {
      this.runner.update(step);
    }
    this.update(0);
  }

  update(step: number): void {
    this.runner.update(step);
    const snap = this.runner.snapshot;
    this.view.update(snap, step, this.reduced, this.runner.entityStates);
    if (this.result === null && snap.complete) this.result = 'complete';
  }

  render(): void {
    this.view.render();
  }

  /** Read-only views for the HUD, the debug panel and the browser check. */
  get snapshot() { return this.runner.snapshot; }
  get events() { return [...this.runner.events]; }
  get entityStates() { return [...this.runner.entityStates]; }
  framing() { return this.view.framing(); }

  dispose(): void {
    this.view.dispose();
    this.ctx = null;
  }
}
