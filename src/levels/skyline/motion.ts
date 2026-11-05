import type { Anchor, Course, Kinematic, Lane, Phase, Point3, RouteSample, TravelMode } from './types';
import { MOTION_LIMIT_X } from './config';

interface Axis { p: number; v: number; a: number }
/** Quintic boundary interpolation preserves position, velocity AND acceleration. */
export function interpolate(from: Axis, to: Axis, duration: number, time: number): Axis {
  const u = Math.max(0, Math.min(1, time / duration));
  const c0 = from.p, c1 = from.v * duration, c2 = from.a * duration * duration / 2;
  const d = to.p - c0 - c1 - c2;
  const v = to.v * duration - c1 - 2 * c2;
  const a = to.a * duration * duration - 2 * c2;
  const c3 = 10 * d - 4 * v + a / 2;
  const c4 = -15 * d + 7 * v - a;
  const c5 = 6 * d - 3 * v + a / 2;
  return {
    p: c0 + u * (c1 + u * (c2 + u * (c3 + u * (c4 + u * c5)))),
    v: (c1 + u * (2 * c2 + u * (3 * c3 + u * (4 * c4 + u * 5 * c5)))) / duration,
    a: (2 * c2 + u * (6 * c3 + u * (12 * c4 + u * 20 * c5))) / (duration * duration),
  };
}
const axis = (k: Kinematic, name: keyof Point3): Axis => ({ p: k.p[name], v: k.v[name], a: k.a[name] });
const zero = (p: number): Axis => ({ p, v: 0, a: 0 });

function skyHeight(c: Course, t: number): Axis {
  const w = 2 * Math.PI / c.cycle;
  return { p: 8 + 3 * Math.cos(w * t), v: -3 * w * Math.sin(w * t), a: -3 * w * w * Math.cos(w * t) };
}
/** Height of the overhead anchor line. Props hang from it, so it is shared. */
export const ANCHOR_HEIGHT = 19;

export function upperAnchor(c: Course, lane: Lane, cycle: number): Anchor {
  const bay = cycle + 1;
  const z = bay * c.cycle * c.speed;
  return { id: `anchor-${bay}-${lane}`, lane, kind: 'upper', x: lane * c.laneWidth,
    y: 17.6, z };
}
export function lowerAnchor(c: Course, lane: Lane, time: number): Anchor {
  return { id: `lower-${lane}-${time}`, lane, kind: 'lower', x: lane * c.laneWidth, y: 0.6, z: time * c.speed + 6 };
}

/** Both travel modes exist in every lane and share the same forward progress. */
export function route(c: Course, lane: Lane, t: number, mode: TravelMode = 'swing'): RouteSample {
  const y = mode === 'run' ? zero(c.groundY) : skyHeight(c, t);
  const cycle = Math.floor(t / c.cycle);
  const phase: Phase = mode === 'run' ? 'run' : t / c.cycle - cycle < 0.76 ? 'swing' : 'flight';
  return { p: { x: lane * c.laneWidth, y: y.p, z: t * c.speed },
    v: { x: 0, y: y.v, z: c.speed }, a: { x: 0, y: y.a, z: 0 }, phase,
    anchor: phase === 'swing' ? upperAnchor(c, lane, cycle) : null };
}

interface Transfer { start: number; duration: number; from: Kinematic; to: RouteSample; lane: Lane; mode: TravelMode }
/** Input never waits for a clip: every new destination starts from the live kinematics. */
export class Motion {
  private transfer: Transfer | null = null;
  lane: Lane = 0;
  mode: TravelMode = 'swing';
  landedAt = -100;
  constructor(private c: Course) {}
  get transitioning(): boolean { return this.transfer !== null; }
  select(lane: Lane, time: number, mode: TravelMode = this.mode): boolean {
    if (lane === this.lane && mode === this.mode) return false;
    const from = this.sample(time);
    this.lane = lane; this.mode = mode;
    let duration = 0.45 + Math.min(1, Math.abs(lane * this.c.laneWidth - from.p.x) / (2 * this.c.laneWidth)) * 0.4;
    let to = route(this.c, lane, time + duration, mode);
    if (Math.abs(to.p.y - from.p.y) > 3) {
      duration = Math.max(duration, 1.1 + Math.abs(to.p.y - from.p.y) * 0.025);
      to = route(this.c, lane, time + duration, mode);
    }
    // Choose a bounded curve when reversing at speed. Preserve derivatives;
    // shorten the braking interval rather than clipping position at a wall.
    let candidate: Transfer = { start: time, duration, from, to, lane, mode };
    let accepted = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      let valid = true;
      for (let i = 1; i <= 32; i++) {
        const p = this.evaluate(candidate, time + duration * i / 32).p;
        if (p.y < this.c.groundY - 0.001 || Math.abs(p.x) > MOTION_LIMIT_X) { valid = false; break; }
      }
      if (valid) { accepted = true; break; }
      duration *= 0.8;
      to = route(this.c, lane, time + duration, mode);
      candidate = { start: time, duration, from, to, lane, mode };
      accepted = false;
    }
    /**
     * Refuse rather than accept on exhaustion.
     *
     * The loop used to fall through and install the last candidate whether
     * or not it certified, so a reversal at speed could overshoot to
     * x=5.204 against a declared zone of 4.6. Keeping the current
     * trajectory is always safe — it was certified when it was chosen — and
     * the requested lane and mode are still recorded, so the next step
     * retries from a position where the curve can be bounded.
     */
    if (!accepted) return true;
    this.transfer = candidate;
    return true;
  }
  private evaluate(tr: Transfer, t: number): RouteSample {
    const k: Kinematic = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, a: { x: 0, y: 0, z: 0 } };
    for (const name of ['x', 'y', 'z'] as const) {
      const value = interpolate(axis(tr.from, name), axis(tr.to, name), tr.duration, t - tr.start);
      k.p[name] = value.p; k.v[name] = value.v; k.a[name] = value.a;
    }
    const target = route(this.c, tr.lane, t, tr.mode);
    const groundTarget = tr.to.p.y < this.c.groundY + 0.5;
    const destinationAnchor: Anchor = groundTarget ?
      lowerAnchor(this.c, tr.lane, tr.start + tr.duration) :
      upperAnchor(this.c, tr.lane, Math.floor((t + 0.5) / this.c.cycle));
    const anchor = t - tr.start < 0.09 || (groundTarget && k.p.y < 2) ? null : target.anchor ?? destinationAnchor;
    const phase: Phase = groundTarget ? (k.p.y < this.c.groundY + 0.1 ? 'run' : 'descend') :
      tr.from.p.y < this.c.groundY + 0.5 ? 'launch' : 'transfer';
    return { ...k, phase, anchor: phase === 'run' ? null : anchor };
  }
  sample(t: number): RouteSample {
    const tr = this.transfer;
    if (!tr) {
      const s = route(this.c, this.lane, t, this.mode);
      if (this.mode === 'run' && t - this.landedAt < 0.28) s.phase = 'land';
      return s;
    }
    if (t >= tr.start + tr.duration) {
      if (tr.mode === 'run' && tr.from.p.y > this.c.groundY + 0.1) this.landedAt = tr.start + tr.duration;
      this.transfer = null; return this.sample(t);
    }
    return this.evaluate(tr, t);
  }
}
