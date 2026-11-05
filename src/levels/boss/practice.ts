import { LaneRunner } from '../../core/lanes';
import { BOSS_LAYOUT } from './layout';
import type { GunSnapshot } from './telegraph';

/** Isolated control harness. Combat HP, hazards, gifts and scoring come later. */
export interface PracticeShot {
  readonly lane: number;
  readonly progress: number;
}

export class BossPractice {
  /**
   * A longer slide than the shared default's 140 ms, which read as a snap.
   *
   * The logical lane still commits instantly and collisions still read it, so
   * this only widens the gap between where Matthew looks and where he is. At
   * 220 ms against a 1.2 s warning floor that cannot make a dodge unfair,
   * which is why it does not go further.
   */
  readonly lanes = new LaneRunner(3, BOSS_LAYOUT.laneWidth, 0.22);
  readonly cooldownSeconds = 0.3;
  readonly flightSeconds = 0.38;
  private cooldown = 0;
  /** Duration of the cooldown currently running, so progress is a true fraction. */
  private cooldownSpan = 0.3;
  private jammed = false;
  private projectiles: { lane: number; progress: number }[] = [];
  private shots = 0;
  private hits = 0;

  get lane(): number { return this.lanes.laneIndex; }
  get renderX(): number { return this.lanes.renderX; }
  get shotCount(): number { return this.shots; }
  get hitCount(): number { return this.hits; }
  get cooldownLeft(): number { return this.cooldown; }
  get gun(): GunSnapshot {
    return {
      ready: this.cooldown === 0,
      progress: this.cooldown === 0 ? 1 : 1 - this.cooldown / this.cooldownSpan,
      jammed: this.jammed,
    };
  }
  get activeShots(): readonly PracticeShot[] { return this.projectiles; }

  swipe(dir: -1 | 1): boolean { return this.lanes.swipe(dir); }

  fire(): boolean {
    if (this.cooldown > 0) return false;
    this.projectiles.push({ lane: this.lane, progress: 0 });
    this.shots++;
    this.cooldown = this.cooldownSeconds;
    this.cooldownSpan = this.cooldownSeconds;
    this.jammed = false;
    return true;
  }

  /**
   * Jam the cannon after a blocked shot.
   *
   * Replaces whatever cooldown is running rather than adding to it, so a
   * block costs a fixed, predictable amount no matter when it lands.
   */
  jam(seconds: number): void {
    this.cooldown = seconds;
    this.cooldownSpan = seconds;
    this.jammed = true;
  }

  update(step: number): void {
    this.lanes.update(step);
    // Treat sub-microsecond residue as zero so a shot is ready at exactly 300 ms.
    this.cooldown = Math.max(0, this.cooldown - step);
    if (this.cooldown < 1e-6) this.cooldown = 0;
    if (this.cooldown === 0) this.jammed = false;
    for (const shot of this.projectiles) {
      shot.progress = Math.min(1, shot.progress + step / this.flightSeconds);
      if (shot.progress >= 1) this.hits++;
    }
    this.projectiles = this.projectiles.filter((shot) => shot.progress < 1);
  }

  reset(): void {
    this.lanes.reset();
    this.cooldown = 0;
    this.cooldownSpan = this.cooldownSeconds;
    this.jammed = false;
    this.projectiles = [];
    this.shots = 0;
    this.hits = 0;
  }

  /** Stop shots at a terminal outcome without moving Matthew or resetting counters. */
  clearShots(): void { this.projectiles = []; }
}
