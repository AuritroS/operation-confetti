/** Course-specific browser scenarios, located by production-runner probes. */
import { SKYLINE } from '../src/levels/skyline/course';
import { SkylineRunner } from '../src/levels/skyline/runner';
import { formatSolve, solve } from '../src/levels/skyline/solve';
import type { Course } from '../src/levels/skyline/types';

const advance = (runner: SkylineRunner, until: number): void => {
  while (runner.snapshot.elapsed + 1e-9 < until && !runner.snapshot.complete) runner.update(1 / 60);
};

function queuedLaunch(c: Course): { requestAt: number; holdUntil: number; airborneAt: number } | null {
  // A full-width overhead hazard supplies a stable clearance window. Ask
  // the runner whether this is a useful case instead of copying canLaunch.
  for (const e of c.entities) {
    if (e.kind !== 'hazard' || e.y - e.halfY <= c.groundY + 1 || e.halfX < c.laneWidth) continue;
    const requestAt = e.z / c.speed - 0.6;
    if (requestAt < 2 || requestAt + 3 >= c.duration) continue;
    const runner = new SkylineRunner(c);
    runner.swipe('down'); advance(runner, requestAt); runner.swipe('up');
    if (!runner.snapshot.pendingLaunch) continue;
    const holdUntil = requestAt + 0.2;
    advance(runner, holdUntil);
    if (!runner.snapshot.pendingLaunch || runner.snapshot.p.y !== c.groundY) continue;
    while (!runner.snapshot.complete && (runner.snapshot.pendingLaunch || runner.snapshot.p.y <= 4)) runner.update(1 / 60);
    if (!runner.snapshot.complete) return { requestAt, holdUntil, airborneAt: runner.snapshot.elapsed + 0.15 };
  }
  return null;
}

function firstDamage(c: Course): number | null {
  const runner = new SkylineRunner(c);
  runner.swipe('up');
  while (!runner.snapshot.complete) {
    runner.update(1 / 60);
    if (runner.events.some(e => e.t === 'incident')) return runner.snapshot.elapsed + 0.05;
  }
  return null;
}

export function prepareReview(c: Course = SKYLINE) {
  const result = solve(c);
  if ('failure' in result) throw new Error(formatSolve(result, c));
  return { course: c, solution: result.solution, queuedLaunch: queuedLaunch(c), firstDamage: firstDamage(c) };
}
