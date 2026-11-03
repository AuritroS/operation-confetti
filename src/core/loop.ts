/**
 * Fixed-step simulation loop with bounded catch-up (design doc §4).
 *
 * Simulation runs at a constant 60 Hz so collisions, cooldowns and telegraphs
 * behave identically regardless of display refresh rate. Rendering happens
 * once per animation frame with an interpolation alpha.
 */

export const STEP_HZ = 60;
export const STEP_S = 1 / STEP_HZ;

/** Never simulate more than this many steps in one frame. */
const MAX_CATCHUP_STEPS = 5;
/** Frame deltas above this are treated as a stall, not elapsed game time. */
const MAX_FRAME_DT = 0.25;

export interface LoopHooks {
  /** Advance simulation by exactly `STEP_S` seconds. */
  update(step: number): void;
  /** Draw. `alpha` is the 0..1 fraction of a step not yet simulated. */
  render(alpha: number): void;
}

export interface LoopStats {
  fps: number;
  stepsLastFrame: number;
  droppedSteps: number;
  frames: number;
}

export class FixedLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  private fpsFrames = 0;
  private fpsSince = 0;

  readonly stats: LoopStats = { fps: 0, stepsLastFrame: 0, droppedSteps: 0, frames: 0 };

  constructor(private readonly hooks: LoopHooks) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.fpsSince = this.lastTime;
    this.fpsFrames = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  /**
   * Stop stepping. The accumulator is cleared so time spent paused or
   * backgrounded is never simulated as catch-up (design doc §9).
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.accumulator = 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // A long gap means the tab stalled. Do not try to make it up.
    if (dt > MAX_FRAME_DT) dt = STEP_S;
    if (dt < 0) dt = 0;

    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= STEP_S && steps < MAX_CATCHUP_STEPS) {
      this.hooks.update(STEP_S);
      this.accumulator -= STEP_S;
      steps++;
    }

    // Hit the ceiling: discard the backlog rather than drifting behind.
    if (steps === MAX_CATCHUP_STEPS && this.accumulator >= STEP_S) {
      this.stats.droppedSteps += Math.floor(this.accumulator / STEP_S);
      this.accumulator = 0;
    }

    this.stats.stepsLastFrame = steps;
    this.stats.frames++;

    this.hooks.render(this.accumulator / STEP_S);

    this.fpsFrames++;
    if (now - this.fpsSince >= 500) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsSince));
      this.fpsFrames = 0;
      this.fpsSince = now;
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
