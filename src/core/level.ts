/**
 * The contract every level implements so the campaign can play all three.
 *
 * Before this, each level was a module with top-level side effects: it fetched
 * its own DOM by id and called `loop.start()` at import time. That works for
 * one level on one page and makes a campaign impossible — nothing can be
 * mounted, unmounted, or sequenced, and nothing can run a story panel between
 * two levels. A level is now an object with a lifecycle, and the shell owns
 * the loop, the renderer, the HUD, pause and the run's event stream.
 *
 * Two rules keep this honest:
 *
 * 1. **A level never reads or writes global DOM.** Everything it needs arrives
 *    in its `LevelContext`. A level that queries `document` by id is a level
 *    that cannot be mounted twice, which is what a replay is.
 * 2. **A level never keeps score.** It emits `RunEvent`s outward and the shell
 *    reduces them with `scoreRun`. Level 3 used to keep a private event log
 *    and its own running total; two sources of truth is how a client score and
 *    the Worker's recompute drift apart.
 */
import type { RunEvent } from './scoring';
import type { RendererHost } from '../render/renderer-host';

/**
 * How a level ended.
 *
 * Levels 1 and 2 finish by reaching an authored route endpoint and cannot be
 * lost; level 3 finishes only on an HP outcome. So `defeated` is reachable
 * from the boss fight alone, and the shell decides what that means for the
 * campaign — not the level.
 */
export type LevelOutcome = 'complete' | 'defeated';

export interface LevelContext {
  /** The campaign's single renderer and canvas. Levels add a scene, not a renderer. */
  readonly host: RendererHost;
  /**
   * Record a scored moment. The shell owns the run's event list, so a level
   * cannot award itself points, double-count, or emit after an outcome.
   */
  emit(event: RunEvent): void;
  /** True when the page was opened with `?debug`; never true in a campaign run. */
  readonly debug: boolean;
}

export interface LevelController {
  /**
   * Build the scene and acquire assets. May be slow: the shell shows a
   * transition or a story panel over it, which is where loading hides.
   */
  mount(ctx: LevelContext): Promise<void>;

  /** Advance simulation by exactly one fixed step. */
  update(step: number): void;

  /** Draw. `alpha` is the fraction of a step not yet simulated. */
  render(alpha: number): void;

  /**
   * Release everything: geometry, materials, textures, listeners and resize
   * subscriptions. The renderer itself belongs to the shell and must survive.
   */
  dispose(): void;

  /**
   * True until `beginPlay`.
   *
   * A rehearsal: the verbs work, nothing can score and nothing can hurt. The
   * one rule every level must honour is that **no `RunEvent` is emitted while
   * this is true** — a gift picked up in practice must not reach the run.
   */
  readonly inPractice: boolean;

  /** Leave practice: reset the level and begin the scored run. */
  beginPlay(): void;

  /**
   * `null` while playing, set once and never cleared when the level ends.
   *
   * Set only after the level's ending has played, not on the frame it is
   * won — the shell transitions on this, and cutting away sooner would eat
   * the celebration.
   */
  readonly result: LevelOutcome | null;
}
