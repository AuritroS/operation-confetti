import { LaneRunner } from '../../core/lanes';

/** Isolated control harness. Combat HP, hazards, gifts and scoring come later. */
export interface PracticeShot {
  readonly lane: number;
  readonly progress: number;
}

export class BossPractice {
  readonly lanes = new LaneRunner(3, 2.2);
  readonly cooldownSeconds = 0.3;
  readonly flightSeconds = 0.38;
  private cooldown = 0;
  private projectiles: { lane: number; progress: number }[] = [];
  private shots = 0;
  private hits = 0;

  get lane(): number { return this.lanes.laneIndex; }
  get renderX(): number { return this.lanes.renderX; }
  get shotCount(): number { return this.shots; }
  get hitCount(): number { return this.hits; }
  get cooldownLeft(): number { return this.cooldown; }
  get activeShots(): readonly PracticeShot[] { return this.projectiles; }

  swipe(dir: -1 | 1): boolean { return this.lanes.swipe(dir); }

  fire(): boolean {
    if (this.cooldown > 0) return false;
    this.projectiles.push({ lane: this.lane, progress: 0 });
    this.shots++;
    this.cooldown = this.cooldownSeconds;
    return true;
  }

  update(step: number): void {
    this.lanes.update(step);
    // Treat sub-microsecond residue as zero so a shot is ready at exactly 300 ms.
    this.cooldown = Math.max(0, this.cooldown - step);
    if (this.cooldown < 1e-6) this.cooldown = 0;
    for (const shot of this.projectiles) {
      shot.progress = Math.min(1, shot.progress + step / this.flightSeconds);
      if (shot.progress >= 1) this.hits++;
    }
    this.projectiles = this.projectiles.filter((shot) => shot.progress < 1);
  }

  reset(): void {
    this.lanes.reset();
    this.cooldown = 0;
    this.projectiles = [];
    this.shots = 0;
    this.hits = 0;
  }
}
