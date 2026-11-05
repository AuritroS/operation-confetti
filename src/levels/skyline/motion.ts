import type { Anchor, Course, Kinematic, Lane, Phase, Point3, RouteSample, TravelMode } from './types';
import { LAND_TIME, MOTION_LIMIT_X } from './config';

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

/**
 * The swing arc.
 *
 * Note the sign: LOWEST at a bay crossing, highest between two. A pendulum
 * is fastest and lowest directly beneath what it hangs from, and the curve
 * used to do the opposite — `+3cos` put the player at the top of the arc
 * exactly as they passed under a cable. Combined with an anchor that sat a
 * whole bay ahead, the rope ran 14 to 53 degrees above horizontal and
 * stretched from 28 units to 12 across a single swing. That reads as being
 * towed down the street on a winch, not swinging.
 *
 * Flipping the phase costs nothing elsewhere because the RANGE is identical,
 * 5 to 11. Only the timing moves, so the obstacle bands in `config.ts` and
 * every collision height stay exactly as authored.
 */
function skyHeight(c: Course, t: number): Axis {
  const w = 2 * Math.PI / c.cycle;
  const cos = Math.cos(w * t);
  const sin = Math.sin(w * t);
  return { p: 8 - 3 * cos, v: 3 * w * sin, a: 3 * w * w * cos };
}

/**
 * Forward progress along Z.
 *
 * During swinging, kinetic energy exchanges with potential energy:
 * - Accelerating as you pull down into the trough (peak velocity ~12.2 u/s).
 * - Decelerating as you climb up to the apex float (~4.8 u/s).
 *
 * Sinusoidal surge is periodic: sin(w * t) is zero at every bay crossing,
 * so macro course timing, obstacle alignment and 45-second duration never drift.
 */
function forwardMotion(c: Course, t: number, mode: TravelMode): Axis {
  if (mode === 'run') {
    return { p: t * c.speed, v: c.speed, a: 0 };
  }
  const w = 2 * Math.PI / c.cycle;
  // Kinetic velocity surge: 1.9 delivers a punchy 2.5x speed contrast
  const surge = 1.9;
  const v = c.speed + surge * w * Math.cos(w * t);
  const a = -surge * w * w * Math.sin(w * t);
  return { p: t * c.speed, v, a };
}

/**
 * Attachment window for the anchor-and-pull mechanic:
 *
 * In each cycle (trough to trough):
 * - u in [0.0, 0.50]: Free flight soaring from trough up to apex float.
 *   The cable is DETACHED (anchor = null). Momentum carries Matthew forward.
 * - u in [0.50, 0.995]: Continuous downward pull and acceleration.
 *   Cable hooks wire ahead at apex crest, pulling Matthew through the drop
 *   and completely through the trough floor. Anchor is strictly ahead (dz >= 0.14m).
 * - u in [0.995, 1.0]: Trough release right at the trough floor directly into
 *   the forward momentum soar. Cable never passes behind Matthew.
 */
function swingPhase(c: Course, t: number): { phase: Phase; bay: number | null } {
  const u = (t / c.cycle) - Math.floor(t / c.cycle);
  const nextBay = Math.floor(t / c.cycle) + 1;
  if (u >= 0.50 && u < 0.995) {
    return { phase: 'swing', bay: nextBay };
  }
  return { phase: 'flight', bay: null };
}

/** Height of the overhead anchor line. Props hang from it, so it is shared. */
export const ANCHOR_HEIGHT = 19;

export function upperAnchorAtBay(c: Course, lane: Lane, bay: number): Anchor {
  const z = bay * c.cycle * c.speed;
  return { id: `anchor-${bay}-${lane}`, lane, kind: 'upper', x: lane * c.laneWidth,
    y: 17.6, z };
}

export function upperAnchor(c: Course, lane: Lane, t: number): Anchor {
  return upperAnchorAtBay(c, lane, Math.round(t / c.cycle));
}
export function lowerAnchor(c: Course, lane: Lane, time: number): Anchor {
  return { id: `lower-${lane}-${time}`, lane, kind: 'lower', x: lane * c.laneWidth, y: 0.6, z: time * c.speed + 6 };
}

/** Both travel modes exist in every lane and share the same forward progress. */
export function route(c: Course, lane: Lane, t: number, mode: TravelMode = 'swing'): RouteSample {
  const y = mode === 'run' ? zero(c.groundY) : skyHeight(c, t);
  const z = forwardMotion(c, t, mode);
  if (mode === 'run') {
    return {
      p: { x: lane * c.laneWidth, y: y.p, z: z.p },
      v: { x: 0, y: y.v, z: z.v },
      a: { x: 0, y: y.a, z: z.a },
      phase: 'run',
      anchor: null,
    };
  }
  const { phase, bay } = swingPhase(c, t);
  const anchor = bay !== null ? upperAnchorAtBay(c, lane, bay) : null;
  return {
    p: { x: lane * c.laneWidth, y: y.p, z: z.p },
    v: { x: 0, y: y.v, z: z.v },
    a: { x: 0, y: y.a, z: z.a },
    phase,
    anchor,
  };
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
    let duration = 0.30 + Math.min(1, Math.abs(lane * this.c.laneWidth - from.p.x) / (2 * this.c.laneWidth)) * 0.20;
    let to = route(this.c, lane, time + duration, mode);
    if (Math.abs(to.p.y - from.p.y) > 3) {
      duration = Math.max(duration, 0.70 + Math.abs(to.p.y - from.p.y) * 0.02);
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
    const isLaunch = tr.from.p.y < this.c.groundY + 0.5;

    let phase: Phase;
    let anchor: Anchor | null;

    if (groundTarget) {
      // Descending to street: active cable reel-in toward ground anchor until touchdown
      phase = k.p.y < this.c.groundY + 0.1 ? 'run' : 'descend';
      anchor = phase === 'run' || k.p.y < this.c.groundY + 0.6 || t - tr.start < 0.04
        ? null
        : lowerAnchor(this.c, tr.lane, tr.start + tr.duration);
    } else if (isLaunch) {
      // Launching from street up into the air: grapple forward to the next bay ahead
      phase = 'launch';
      const bayAhead = Math.max(1, Math.ceil(t / this.c.cycle));
      const forwardAnchor = upperAnchorAtBay(this.c, tr.lane, bayAhead);
      anchor = t - tr.start < 0.09 ? null : (target.anchor ?? forwardAnchor);
    } else {
      // Airborne transfer between lanes:
      // Grapple the forward anchor in the new lane immediately on input so the cable pulls Matthew across.
      phase = 'transfer';
      const bayAhead = Math.max(1, Math.ceil((k.p.z + 1) / (this.c.cycle * this.c.speed)));
      anchor = upperAnchorAtBay(this.c, tr.lane, bayAhead);
    }

    return { ...k, phase, anchor };
  }
  sample(t: number): RouteSample {
    const tr = this.transfer;
    if (!tr) {
      const s = route(this.c, this.lane, t, this.mode);
      if (this.mode === 'run' && t - this.landedAt < LAND_TIME) {
        s.phase = 'land';
        const u = Math.max(0, Math.min(1, (t - this.landedAt) / LAND_TIME));
        const brake = 0.75 + 0.25 * (u * (2 - u));
        s.v.z *= brake;
      }
      return s;
    }
    if (t >= tr.start + tr.duration) {
      if (tr.mode === 'run' && tr.from.p.y > this.c.groundY + 0.1) this.landedAt = tr.start + tr.duration;
      this.transfer = null; return this.sample(t);
    }
    return this.evaluate(tr, t);
  }
}
