/**
 * Bounded route search for the three-lane, run/swing vocabulary.
 * The graph proposes schedules; the production runner accepts or rejects them.
 * A solution is evidence of a clean run. Failure is NOT proof of impossibility,
 * and the graph's estimated slack is NOT a measurement of human reaction time.
 * This module is used by offline tools and tests, never by the player bundle.
 */
import { Motion, route } from './motion';
import { hits, SkylineRunner } from './runner';
import { PLAYER_HALF } from './config';
import { SKYLINE } from './course';
import { RULES, scoreRun } from '../../core/scoring';
import { LANES, type Course, type Direction, type Entity, type Lane, type TravelMode } from './types';

const SEQUENCE_GAP = 0.25;
const DELAYS = [0.4, 0.55, 0.7, 0.9] as const;
const PATHS_PER_STATE = 8;
const MODES: readonly TravelMode[] = ['swing', 'run'];
type Order = 'lane-first' | 'mode-first';
interface State { lane: Lane; mode: TravelMode }
export interface Swipe { readonly time: number; readonly direction: Direction }
export interface Beat { readonly t: number; readonly entities: readonly Entity[] }
export interface Outcome {
  readonly gifts: number;
  readonly incidents: number;
  readonly complete: boolean;
  readonly missed: readonly string[];
  /** Includes contacts swallowed by damage protection. */
  readonly struck: readonly string[];
  readonly score: number;
  readonly violations: readonly string[];
}
export interface Solution {
  readonly swipes: readonly Swipe[];
  readonly outcome: Outcome;
  readonly estimatedSlack: number | null;
  readonly tightestAt: number | null;
  readonly delay: number;
  readonly candidatesTried: number;
}
export type Result = { solution: Solution } | { failure: {
  reason: string;
  candidatesTried: number;
  /** A bounded diagnostic sample, not every rejected schedule. */
  attempts: readonly { delay: number; outcome: Outcome }[];
} };

/** Relative swipe times; the same sequence is measured and later scheduled. */
function sequence(from: State, to: State, order: Order): Swipe[] {
  const lateral: Direction[] = Array.from({ length: Math.abs(to.lane - from.lane) },
    () => to.lane > from.lane ? 'right' : 'left');
  const vertical: Direction[] = from.mode === to.mode ? [] : [to.mode === 'run' ? 'down' : 'up'];
  return (order === 'lane-first' ? [...lateral, ...vertical] : [...vertical, ...lateral])
    .map((direction, index) => ({ time: index * SEQUENCE_GAP, direction }));
}

/** Largest duration observed at 16 start phases, not an analytic upper bound. */
function measure(c: Course, from: State, to: State, order: Order): number {
  const inputs = sequence(from, to, order);
  if (!inputs.length) return 0;
  let worst = 0;
  for (let phase = 0; phase < 16; phase++) {
    const base = (8 + phase / 16) * c.cycle;
    const motion = new Motion(c);
    motion.lane = from.lane; motion.mode = from.mode;
    let next = 0, took = Infinity;
    for (let frame = 0; frame <= 5 * 120; frame++) {
      const elapsed = frame / 120, t = base + elapsed;
      motion.sample(t);
      while (next < inputs.length && inputs[next]!.time <= elapsed) {
        const d = inputs[next++]!.direction;
        const lane = Math.max(-1, Math.min(1, motion.lane + (d === 'left' ? -1 : d === 'right' ? 1 : 0))) as Lane;
        motion.select(lane, t, d === 'up' ? 'swing' : d === 'down' ? 'run' : motion.mode);
      }
      const at = motion.sample(t);
      const target = route(c, to.lane, t, to.mode);
      if (next === inputs.length && !motion.transitioning &&
          Math.abs(at.p.x - target.p.x) < 1e-6 && Math.abs(at.p.y - target.p.y) < 1e-6) {
        took = elapsed; break;
      }
    }
    worst = Math.max(worst, took);
  }
  return worst;
}

/** Test a settled route over the entire contact window, including swing phase. */
function touches(c: Course, e: Entity, state: State): boolean {
  const start = Math.max(0, (e.z - e.halfZ - PLAYER_HALF.z) / c.speed);
  const end = Math.min(c.duration, (e.z + e.halfZ + PLAYER_HALF.z) / c.speed);
  if (start > end) return false;
  const frames = Math.max(1, Math.ceil((end - start) * 120));
  let previous = route(c, state.lane, start, state.mode).p;
  for (let frame = 1; frame <= frames; frame++) {
    const current = route(c, state.lane, start + (end - start) * frame / frames, state.mode).p;
    if (hits(previous, current, e)) return true;
    previous = current;
  }
  return false;
}

export function beats(c: Course = SKYLINE): Beat[] {
  const grouped = new Map<number, Entity[]>();
  for (const e of c.entities) {
    const time = e.z / c.speed;
    const list = grouped.get(time) ?? [];
    list.push(e); grouped.set(time, list);
  }
  return [...grouped].sort(([a], [b]) => a - b).map(([t, entities]) => ({ t, entities }));
}

interface Node {
  state: State;
  gifts: number;
  slack: number;
  slackAt: number | null;
  from: Node | null;
  arrive: number;
  order: Order;
  inputs: number;
}
const rank = (a: Node, b: Node): number =>
  b.gifts - a.gifts || b.slack - a.slack || a.inputs - b.inputs;

/** Retain alternatives: identical lane/mode endpoints can have different swept paths. */
function plans(c: Course, courseBeats: readonly Beat[]): Node[] {
  const states = LANES.flatMap(lane => MODES.map(mode => ({ lane, mode })));
  const costs = new Map<string, number>();
  const cost = (a: State, b: State, order: Order): number => {
    const key = `${a.lane}/${a.mode}/${b.lane}/${b.mode}/${order}`;
    if (!costs.has(key)) costs.set(key, measure(c, a, b, order));
    return costs.get(key)!;
  };
  let frontier: Node[] = [{ state: { lane: 0, mode: 'swing' }, gifts: 0,
    slack: Infinity, slackAt: null, from: null, arrive: 0, order: 'lane-first', inputs: 0 }];
  for (const beat of courseBeats) {
    const next: Node[] = [];
    for (const state of states) {
      if (beat.entities.some(e => e.kind === 'hazard' && touches(c, e, state))) continue;
      const earned = beat.entities.filter(e => e.kind === 'gift' && e.scored && touches(c, e, state)).length;
      const alternatives: Node[] = [];
      for (const from of frontier) {
        const orders: Order[] = from.state.lane !== state.lane && from.state.mode !== state.mode
          ? ['lane-first', 'mode-first'] : ['lane-first'];
        for (const order of orders) {
          const move = cost(from.state, state, order);
          const spare = move === 0 ? Infinity : beat.t - from.arrive - move - DELAYS[0];
          if (spare < -1e-9) continue;
          alternatives.push({ state, gifts: from.gifts + earned, slack: Math.min(from.slack, spare),
            slackAt: spare < from.slack ? beat.t : from.slackAt, from, arrive: beat.t, order,
            inputs: from.inputs + sequence(from.state, state, order).length });
        }
      }
      next.push(...alternatives.sort(rank).slice(0, PATHS_PER_STATE));
    }
    frontier = next;
  }
  return frontier.sort(rank);
}

function schedule(last: Node, delay: number): Swipe[] {
  const path: Node[] = [];
  for (let node: Node | null = last; node; node = node.from) path.unshift(node);
  const swipes: Swipe[] = [{ time: 0, direction: 'up' }];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!, to = path[i]!;
    for (const swipe of sequence(from.state, to.state, to.order)) {
      swipes.push({ time: from.arrive + delay + swipe.time, direction: swipe.direction });
    }
  }
  return swipes;
}

/**
 * Inputs are relative to the first swipe. Reject malformed schedules rather
 * than silently sorting them or letting a stalled runner look like a replay.
 * inputEvery models browser automation polling (3 frames = 50 ms at 60 Hz).
 */
export function replay(swipes: readonly Swipe[], c: Course = SKYLINE,
  hz: 60 | 120 = 120, inputEvery = 1): Outcome {
  if (!Number.isInteger(inputEvery) || inputEvery < 1 || !swipes.length || swipes[0]!.time !== 0 ||
      swipes.some((s, i) => !Number.isFinite(s.time) || s.time < 0 || s.time >= c.duration ||
        !['left', 'right', 'up', 'down'].includes(s.direction) || (i > 0 && s.time < swipes[i - 1]!.time))) {
    throw new Error('Invalid swipe schedule: start at 0, use ordered finite times within the course.');
  }
  const runner = new SkylineRunner(c);
  let next = 0;
  for (let frame = 0; frame <= Math.ceil((c.duration + 1) * hz); frame++) {
    if (frame % inputEvery === 0) {
      while (next < swipes.length && swipes[next]!.time <= frame / hz) runner.swipe(swipes[next++]!.direction);
    }
    runner.update(1 / hz);
  }
  const score = scoreRun(runner.events);
  return {
    gifts: runner.events.filter(e => e.t === 'gift').length,
    incidents: runner.events.filter(e => e.t === 'incident').length,
    complete: runner.snapshot.complete,
    missed: c.entities.filter(e => e.kind === 'gift' && e.scored && runner.entityStates.get(e.id) !== 'collected').map(e => e.id),
    struck: c.entities.filter(e => e.kind === 'hazard' && runner.entityStates.get(e.id) === 'hit').map(e => e.id),
    score: score.total, violations: score.violations,
  };
}

export const scoredGifts = (c: Course = SKYLINE): number => c.entities.filter(e => e.kind === 'gift' && e.scored).length;
export const clean = (outcome: Outcome, c: Course = SKYLINE): boolean => outcome.complete &&
  outcome.gifts === scoredGifts(c) && !outcome.incidents && !outcome.struck.length &&
  !outcome.missed.length && !outcome.violations.length;

export function solve(c: Course = SKYLINE): Result {
  const target = scoredGifts(c);
  const invalid = [c.duration, c.speed, c.laneWidth, c.cycle].some(n => !Number.isFinite(n) || n <= 0) ||
    !Number.isFinite(c.groundY) || new Set(c.entities.map(e => e.id)).size !== c.entities.length ||
    c.entities.some(e => ![e.x, e.y, e.z, e.halfX, e.halfY, e.halfZ].every(Number.isFinite) ||
      e.halfX < 0 || e.halfY < 0 || e.halfZ < 0 || e.z < 0 || e.z > c.duration * c.speed);
  if (invalid || target > RULES.giftsPerLevel) return { failure: {
    reason: invalid ? 'Invalid course dimensions, encounter bounds or duplicate entity IDs.' :
      `${target} scored gifts exceed the scoring rule cap of ${RULES.giftsPerLevel}.`,
    candidatesTried: 0, attempts: [],
  } };
  const candidates = plans(c, beats(c)).filter(node => node.gifts === target);
  const attempts: { delay: number; outcome: Outcome }[] = [];
  let candidatesTried = 0;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    for (const delay of DELAYS) {
      const swipes = schedule(candidate, delay);
      if (swipes.some((s, i) => s.time >= c.duration || (i > 0 && s.time < swipes[i - 1]!.time))) continue;
      const key = JSON.stringify(swipes);
      if (seen.has(key)) continue;
      seen.add(key); candidatesTried++;
      let outcome = replay(swipes, c);
      // Both simulation cadence and the browser's input polling must work.
      if (clean(outcome, c)) outcome = replay(swipes, c, 60);
      if (clean(outcome, c)) outcome = replay(swipes, c, 60, 3);
      if (clean(outcome, c)) return { solution: { swipes, outcome,
        estimatedSlack: Number.isFinite(candidate.slack) ? candidate.slack : null,
        tightestAt: candidate.slackAt, delay, candidatesTried } };
      if (attempts.length < 8) attempts.push({ delay, outcome });
    }
  }
  return { failure: { reason: candidates.length
    ? 'No replay-verified route found within the retained paths and timing schedules.'
    : 'No all-gift route found in the bounded lane/mode graph.', candidatesTried, attempts } };
}

export interface TimingProbe {
  step: number;
  limit: number;
  /** Every tested single-swipe offset through this magnitude passed. */
  early: number;
  late: number;
  firstFailure: { swipe: number; offset: number; outcome: Outcome } | null;
  stoppedBy: { early: 'limit' | 'order' | 'replay'; late: 'limit' | 'order' | 'replay' };
  jitter: { amplitude: number; trials: number; passed: number; firstFailure: Outcome | null };
}
/** Sampled timing experiments, not a guarantee for untested combinations or human play. */
export function probeTiming(swipes: readonly Swipe[], c: Course = SKYLINE): TimingProbe {
  if (!clean(replay(swipes, c, 60, 3), c)) throw new Error('Timing probes require a clean baseline route.');
  const step = 0.1, limit = 0.5;
  const result: TimingProbe = { step, limit, early: 0, late: 0, firstFailure: null,
    stoppedBy: { early: 'limit', late: 'limit' },
    jitter: { amplitude: 0.1, trials: 16, passed: 0, firstFailure: null } };
  for (const direction of [-1, 1] as const) {
    const side = direction < 0 ? 'early' : 'late';
    for (let tick = 1; tick <= 5; tick++) {
      const offset = direction * tick * step;
      let passed = true;
      for (let index = 1; index < swipes.length; index++) {
        const shifted = swipes.map((s, i) => ({ ...s, time: s.time + (i === index ? offset : 0) }));
        if (shifted[index]!.time <= shifted[index - 1]!.time || shifted[index]!.time >= c.duration ||
            (index + 1 < shifted.length && shifted[index]!.time >= shifted[index + 1]!.time)) {
          // Offsets that reorder strokes are outside this experiment.
          result.stoppedBy[side] = 'order';
          passed = false; break;
        }
        const outcome = replay(shifted, c, 60, 3);
        if (!clean(outcome, c)) {
          result.stoppedBy[side] = 'replay';
          result.firstFailure ??= { swipe: index, offset, outcome };
          passed = false; break;
        }
      }
      if (!passed) break;
      if (direction < 0) result.early = tick * step; else result.late = tick * step;
    }
  }
  let seed = 42;
  for (let trial = 0; trial < result.jitter.trials; trial++) {
    const shifted = swipes.map((s, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return { ...s, time: i === 0 ? 0 : s.time + (2 * seed / 4294967296 - 1) * result.jitter.amplitude };
    });
    if (shifted.some((s, i) => s.time < 0 || s.time >= c.duration || (i > 0 && s.time <= shifted[i - 1]!.time))) continue;
    const outcome = replay(shifted, c, 60, 3);
    if (clean(outcome, c)) result.jitter.passed++;
    else result.jitter.firstFailure ??= outcome;
  }
  return result;
}

export function transitionCosts(c: Course = SKYLINE): Record<string, number> {
  const mid: State = { lane: 0, mode: 'swing' };
  return {
    'one lane': measure(c, mid, { lane: 1, mode: 'swing' }, 'lane-first'),
    'two lanes (two swipes)': measure(c, { lane: -1, mode: 'swing' }, { lane: 1, mode: 'swing' }, 'lane-first'),
    'swing to run': measure(c, mid, { lane: 0, mode: 'run' }, 'lane-first'),
    'run to swing': measure(c, { lane: 0, mode: 'run' }, mid, 'lane-first'),
  };
}

export function formatSolve(result: Result, c: Course = SKYLINE): string {
  const lines = [`${beats(c).length} beats, ${c.entities.length} entities, ${scoredGifts(c)} scored gifts`];
  if ('failure' in result) {
    lines.push(`route: UNSOLVED — ${result.failure.reason}`, 'This bounded search does not prove impossibility.');
    for (const a of result.failure.attempts) lines.push(
      `  delay ${a.delay.toFixed(2)}s: struck [${a.outcome.struck.join(', ')}], missed [${a.outcome.missed.join(', ')}]` +
      (a.outcome.violations.length ? `; scoring: ${a.outcome.violations.join(', ')}` : ''));
  } else {
    const s = result.solution;
    lines.push(`route: solved — ${s.outcome.gifts} gifts, ${s.outcome.struck.length} hazard contacts, ${s.outcome.score} points`,
      `${s.swipes.length} swipes; ${s.candidatesTried} candidate schedule(s) tried; departure delay ${s.delay.toFixed(2)}s`,
      'Verified at 120 Hz, 60 Hz, and 60 Hz with inputs polled every 50 ms.',
      s.estimatedSlack === null ? 'No forced move; estimated slack not applicable.' :
        `Graph slack estimate: ${s.estimatedSlack.toFixed(2)}s at t=${s.tightestAt} (not input tolerance).`);
  }
  return lines.join('\n');
}
