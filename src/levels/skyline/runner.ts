import type { RunEvent } from '../../core/scoring';
import { Motion } from './motion';
import { PLAYER_HALF, speedAt } from './config';
import type { Course, Direction, Entity, Lane, Point3, Snapshot, TravelMode } from './types';

export function hits(from: Point3, to: Point3, e: Entity): boolean {
  let near = 0, far = 1;
  for (const [axis, half] of [['x', e.halfX + PLAYER_HALF.x], ['y', e.halfY + PLAYER_HALF.y], ['z', e.halfZ + PLAYER_HALF.z]] as const) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-10) { if (Math.abs(from[axis] - e[axis]) > half) return false; }
    else {
      const a = (e[axis] - half - from[axis]) / delta, b = (e[axis] + half - from[axis]) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}
export class SkylineRunner {
  private motion: Motion;
  private elapsed = 0;
  private started = false;
  private complete = false;
  private protection = 0;
  private hitTime = -100;
  private selections = 0;
  private requestedMode: TravelMode = 'swing';
  readonly events: RunEvent[] = [];
  readonly entityStates = new Map<string, 'collected' | 'hit' | 'missed'>();
  private listener: (e: RunEvent) => void = () => {};
  constructor(readonly course: Course) { this.motion = new Motion(course); }
  onEvent(fn: (e: RunEvent) => void): void { this.listener = fn; }
  private emit(e: RunEvent): void { this.events.push(e); this.listener(e); }
  swipe(direction: Direction): void {
    if (this.complete) return;
    this.started = true;
    const lane = Math.max(-1, Math.min(1, this.motion.lane + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0))) as Lane;
    if (direction === 'up') this.requestedMode = 'swing';
    if (direction === 'down') this.requestedMode = 'run';
    const mode = this.requestedMode === 'swing' && this.motion.mode === 'run' && !this.canLaunch(lane) ? 'run' : this.requestedMode;
    if (this.motion.select(lane, this.elapsed, mode)) this.selections++;
  }
  /** A remembered up-swipe waits for overhead clearance, including while crossing lanes. */
  private canLaunch(lane: Lane): boolean {
    const p = this.motion.sample(this.elapsed).p;
    const minX = Math.min(p.x, lane * this.course.laneWidth) - 0.4;
    const maxX = Math.max(p.x, lane * this.course.laneWidth) + 0.4;
    const lookaheadZ = (this.course.duration === 45 ? speedAt(this.elapsed) : this.course.speed) * 1.5;
    return !this.course.entities.some((e) => e.kind === 'hazard' &&
      e.y - e.halfY > this.course.groundY + 1 &&
      e.x + e.halfX >= minX && e.x - e.halfX <= maxX &&
      p.z - 0.6 <= e.z + e.halfZ && p.z + lookaheadZ >= e.z - e.halfZ);
  }
  get snapshot(): Snapshot {
    const k = this.motion.sample(this.elapsed);
    return { ...k, elapsed: this.elapsed, lane: this.motion.lane, started: this.started,
      complete: this.complete, progress: this.elapsed / this.course.duration,
      transitioning: this.motion.transitioning, protection: this.protection,
      hitAge: this.elapsed - this.hitTime, selections: this.selections,
      mode: this.motion.mode, requestedMode: this.requestedMode,
      pendingLaunch: this.requestedMode === 'swing' && this.motion.mode === 'run', landingAge: this.elapsed - this.motion.landedAt };
  }
  update(dt: number): void {
    if (!this.started || this.complete || !Number.isFinite(dt) || dt <= 0) return;
    const steps = Math.ceil(dt * 120);
    for (let i = 0; i < steps && !this.complete; i++) {
      if (this.requestedMode === 'swing' && this.motion.mode === 'run' && this.canLaunch(this.motion.lane)) {
        this.motion.select(this.motion.lane, this.elapsed, 'swing');
      }
      const from = this.motion.sample(this.elapsed).p;
      this.elapsed = Math.min(this.course.duration, this.elapsed + dt / steps);
      this.protection = Math.max(0, this.protection - dt / steps);
      const to = this.motion.sample(this.elapsed).p;
      for (const e of this.course.entities) {
        if (this.entityStates.has(e.id)) continue;
        if (hits(from, to, e)) {
          this.entityStates.set(e.id, e.kind === 'gift' ? 'collected' : 'hit');
          if (e.kind === 'gift' && e.scored) this.emit({ t: 'gift', level: 2 });
          if (e.kind === 'hazard' && this.protection === 0) {
            this.emit({ t: 'incident', level: 2 }); this.protection = 1; this.hitTime = this.elapsed;
          }
        } else if (to.z > e.z + e.halfZ + PLAYER_HALF.z) this.entityStates.set(e.id, 'missed');
      }
      if (this.elapsed >= this.course.duration) {
        this.complete = true; this.emit({ t: 'routeComplete', level: 2 });
      }
    }
  }
}
