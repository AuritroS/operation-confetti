/**
 * Lane model shared by levels 1 and 3 (design doc §4, §5, §7).
 *
 * One swipe moves exactly one lane and is clamped to the available lanes.
 * Holding or extending the same gesture cannot cross multiple lanes, which is
 * guaranteed by the recogniser firing one swipe per gesture.
 */
export class LaneRunner {
  /** Index of the lane the player logically occupies. Collisions use this. */
  private index: number;
  /** Smoothed visual position in lane units; render only. */
  private visual: number;

  constructor(
    readonly laneCount: number,
    readonly laneWidth: number,
    /** Seconds for the visual to settle into a new lane. */
    private readonly settle = 0.11,
    startIndex = Math.floor(laneCount / 2),
  ) {
    this.index = clamp(startIndex, 0, laneCount - 1);
    this.visual = this.index;
  }

  get laneIndex(): number {
    return this.index;
  }

  /** World-space X of the lane centre the player occupies. */
  get targetX(): number {
    return this.laneToX(this.index);
  }

  /** World-space X for rendering, including the settle animation. */
  get renderX(): number {
    return this.laneToX(this.visual);
  }

  /** True while the visual has not yet caught up to the logical lane. */
  get isSettling(): boolean {
    return Math.abs(this.visual - this.index) > 0.001;
  }

  laneToX(lane: number): number {
    return (lane - (this.laneCount - 1) / 2) * this.laneWidth;
  }

  /** Returns true if the lane actually changed. */
  swipe(dir: -1 | 1): boolean {
    const next = clamp(this.index + dir, 0, this.laneCount - 1);
    if (next === this.index) return false;
    this.index = next;
    return true;
  }

  update(step: number): void {
    if (!this.isSettling) {
      this.visual = this.index;
      return;
    }
    // Exponential approach, frame-rate independent because step is fixed.
    const k = 1 - Math.exp(-step / Math.max(this.settle, 1e-4));
    this.visual += (this.index - this.visual) * k;
  }

  reset(startIndex = Math.floor(this.laneCount / 2)): void {
    this.index = clamp(startIndex, 0, this.laneCount - 1);
    this.visual = this.index;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
