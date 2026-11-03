/**
 * Level 1 / 2 route simulation (design doc §5).
 *
 * Owns travel, collisions, invulnerability and the events that scoring
 * consumes. Knows nothing about meshes, cameras or the DOM, so it can be
 * tested without a browser and its timings cannot drift when the presentation
 * changes.
 *
 * Collision reduces to one dimension: the player only moves laterally between
 * discrete lanes and every entity approaches along the route, so contact is a
 * 1D interval overlap plus a lane match.
 *
 * The test is SWEPT — it covers the whole span travelled during a step, not
 * just where the player ended up. A point-overlap test only works while a
 * step advances less than the contact window, and the speed ramp now reaches
 * 15.3 u/s, which moves 0.255 units per step against a 1.0-unit window. That
 * is within a factor of four of tunnelling straight through a hazard, and the
 * margin would have to be rechecked every time anyone touched the speed. The
 * doc calls for swept checks or equivalent protection (§4); this is exact and
 * independent of speed.
 *
 * Lane authority: contact tests read the logical lane index, never the
 * interpolated render position. The lane slide is presentation only, so a hit
 * is decided by the lane the player committed to (§4).
 */
import { LaneRunner } from '../core/lanes';
import type { RunEvent } from '../core/scoring';
import {
  HALF_DEPTH,
  scoredGiftCount,
  speedAt,
  type LevelConfig,
  type RouteEntity,
} from './types';

export type EntityState = 'pending' | 'collected' | 'hit' | 'missed';

export interface TrackedEntity {
  readonly entity: RouteEntity;
  state: EntityState;
  /** Distance ahead of the player, for the renderer. Negative is behind. */
  relativeZ: number;
}

export interface RunnerSnapshot {
  readonly travelled: number;
  readonly progress: number;
  readonly complete: boolean;
  readonly laneIndex: number;
  readonly giftsCollected: number;
  readonly giftsTotal: number;
  readonly incidents: number;
  readonly invulnerable: boolean;
}

export class LevelRunner {
  readonly lanes: LaneRunner;
  readonly tracked: TrackedEntity[];

  private travelled = 0;
  /** Where the player was at the start of the current step, for the sweep. */
  private previousTravelled = 0;
  private invulnerableFor = 0;
  private complete = false;
  private giftsCollected = 0;
  private incidents = 0;
  private readonly giftsTotal: number;

  /** Emitted events, in order, for the scoring reducer and submission. */
  private readonly emitted: RunEvent[] = [];
  private listener: ((event: RunEvent) => void) | null = null;

  constructor(readonly config: LevelConfig) {
    this.lanes = new LaneRunner(config.laneCount, config.laneWidth);
    this.giftsTotal = scoredGiftCount(config);
    this.tracked = config.entities.map((entity) => ({
      entity,
      state: 'pending' as EntityState,
      relativeZ: entity.z,
    }));
  }

  /** Subscribe to gameplay events. Replaces any previous listener. */
  onEvent(listener: (event: RunEvent) => void): void {
    this.listener = listener;
  }

  get events(): readonly RunEvent[] {
    return this.emitted;
  }

  get isComplete(): boolean {
    return this.complete;
  }

  /** Current forward speed, for the debug panel. */
  get speed(): number {
    return speedAt(this.config, this.travelled);
  }

  get snapshot(): RunnerSnapshot {
    return {
      travelled: this.travelled,
      progress: Math.min(1, this.travelled / this.config.routeLength),
      complete: this.complete,
      laneIndex: this.lanes.laneIndex,
      giftsCollected: this.giftsCollected,
      giftsTotal: this.giftsTotal,
      incidents: this.incidents,
      invulnerable: this.invulnerableFor > 0,
    };
  }

  /** True while the post-collision protection window is open. */
  get isInvulnerable(): boolean {
    return this.invulnerableFor > 0;
  }

  /** One lane of lateral movement. Ignored once the route is finished. */
  swipe(dir: -1 | 1): boolean {
    if (this.complete) return false;
    return this.lanes.swipe(dir);
  }

  update(step: number): void {
    if (this.complete) return;

    // Speed ramps with progress, so the route gets faster as it gets tighter.
    this.previousTravelled = this.travelled;
    this.travelled = Math.min(
      this.travelled + speedAt(this.config, this.travelled) * step,
      this.config.routeLength,
    );
    this.lanes.update(step);

    if (this.invulnerableFor > 0) {
      this.invulnerableFor = Math.max(0, this.invulnerableFor - step);
    }

    this.resolveContacts();

    if (this.travelled >= this.config.routeLength) {
      // A missed gift stays missed; completion does not depend on score (§5).
      for (const t of this.tracked) {
        if (t.state === 'pending') t.state = 'missed';
      }
      this.complete = true;
      this.emit({ t: 'routeComplete', level: 1 });
    }
  }

  private resolveContacts(): void {
    const lane = this.lanes.laneIndex;

    for (const t of this.tracked) {
      t.relativeZ = t.entity.z - this.travelled;

      if (t.state !== 'pending') continue;

      // Swept overlap: the player's collision interval covers everything
      // between where it started this step and where it finished, so nothing
      // can pass through between two frames however fast the route gets.
      const half = HALF_DEPTH.player + HALF_DEPTH[t.entity.kind];
      const sweptNear = this.previousTravelled - half;
      const sweptFar = this.travelled + half;

      if (t.entity.z < sweptNear) {
        // Fully behind the sweep: it can never be reached again.
        t.state = 'missed';
        continue;
      }
      if (t.entity.z > sweptFar) continue;

      if (t.entity.lane !== lane) continue;

      if (t.entity.kind === 'gift') {
        // Marked collected immediately, so remaining inside the overlap
        // cannot award the same gift twice.
        t.state = 'collected';
        if (t.entity.scored) {
          this.giftsCollected++;
          this.emit({ t: 'gift', level: 1 });
        }
        continue;
      }

      // Hazard. Every style carries the same penalty, since the difference
      // between them is only how they are drawn. Protection suppresses the
      // cost but still marks the entity, so one hazard can only ever bill
      // once (§5).
      t.state = 'hit';
      if (this.invulnerableFor <= 0) {
        this.incidents++;
        this.invulnerableFor = this.config.invulnerabilitySeconds;
        this.emit({ t: 'incident', level: 1 });
      }
    }
  }

  private emit(event: RunEvent): void {
    this.emitted.push(event);
    this.listener?.(event);
  }
}
