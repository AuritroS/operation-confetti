/**
 * Lane model shared by levels 1 and 3 (design doc §4, §5, §7).
 *
 * One swipe moves exactly one lane and is clamped to the available lanes.
 * Holding or extending the same gesture cannot cross multiple lanes, which the
 * recogniser guarantees by firing one swipe per gesture.
 *
 * The visual position uses a fixed-duration tween rather than an exponential
 * approach, so `settle` is literally how long the slide takes and the lane
 * visibly finishes moving. An exponential decay only ever approaches its
 * target, which left the character imperceptibly drifting for several times
 * the nominal duration.
 *
 * Only `laneIndex` is authoritative. Collisions and scoring read it, never the
 * interpolated render position, so animation can never change gameplay.
 */
export class LaneRunner {
  /** Authoritative lane. */
  private index: number;
  /** Lane the current tween started from. */
  private from: number;
  /** Tween progress, 0..1. */
  private t = 1;

  constructor(
    readonly laneCount: number,
    readonly laneWidth: number,
    /** Seconds the visual slide takes, start to finish. */
    private readonly settle = 0.11,
    startIndex = Math.floor(laneCount / 2),
  ) {
    this.index = clamp(startIndex, 0, laneCount - 1);
    this.from = this.index;
  }

  get laneIndex(): number {
    return this.index;
  }

  /** World-space X of the lane the player occupies. */
  get targetX(): number {
    return this.laneToX(this.index);
  }

  /** World-space X for rendering, including the slide. */
  get renderX(): number {
    if (this.t >= 1) return this.laneToX(this.index);
    const eased = smoothstep(this.t);
    return this.laneToX(this.from + (this.index - this.from) * eased);
  }

  /** True while the slide is still in progress. */
  get isSettling(): boolean {
    return this.t < 1;
  }

  laneToX(lane: number): number {
    return (lane - (this.laneCount - 1) / 2) * this.laneWidth;
  }

  /** Returns true if the lane actually changed. */
  swipe(dir: -1 | 1): boolean {
    const next = clamp(this.index + dir, 0, this.laneCount - 1);
    if (next === this.index) return false;
    // Retarget from wherever the slide currently is, so a quick second swipe
    // continues smoothly instead of snapping back.
    const eased = this.t >= 1 ? this.index : this.from + (this.index - this.from) * smoothstep(this.t);
    this.from = eased;
    this.index = next;
    this.t = 0;
    return true;
  }

  update(step: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + step / Math.max(this.settle, 1e-4));
  }

  reset(startIndex = Math.floor(this.laneCount / 2)): void {
    this.index = clamp(startIndex, 0, this.laneCount - 1);
    this.from = this.index;
    this.t = 1;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smooth ease-in-out on 0..1. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
