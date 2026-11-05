import './level2.css';
import { SkylineSwipeInput } from './core/skyline-swipe-input';
import { Lifecycle } from './core/lifecycle';
import { FixedLoop } from './core/loop';
import { POINTS, scoreRun } from './core/scoring';
import { SKYLINE } from './levels/skyline/course';
import { SkylineRunner } from './levels/skyline/runner';
import type { Course, Direction } from './levels/skyline/types';
import { SkylineScene } from './render/skyline-scene';
import { loadStreetAssets } from './render/skyline-assets';
import { loadSkylineHero } from './render/skyline-hero';
import { Hud } from './ui/hud';

document.body.dataset['level'] = '2';
// Review-only: the portrait letterbox is correct for play and useless for a
// contact sheet, where the whole point is to see everything at once.
if (new URLSearchParams(location.search).has('inspect')) {
  document.body.dataset['inspect'] = 'on';
}
document.title = 'Skyline Chase · Operation Confetti';
const surface = document.getElementById('surface')!;
const rotate = document.getElementById('rotate')!;
const pausePill = document.getElementById('pause')!;
const pauseNote = document.getElementById('pause-note')!;
const pauseButton = document.getElementById('btn-pause') as HTMLButtonElement;
const replay = document.createElement('button');
replay.id = 'btn-replay'; replay.type = 'button'; replay.className = 'hud__btn';
replay.textContent = 'Replay'; replay.setAttribute('aria-label', 'Restart level 2'); pauseButton.before(replay);

const hud = new Hud();
const courseForPlay: Course = SKYLINE;

const view = new SkylineScene(document.getElementById('stage') as HTMLCanvasElement, courseForPlay);

// Non-blocking: play starts on primitives and upgrades in place when the
// street lands. A failed load leaves a playable level, not a stalled screen.
void loadStreetAssets().then((assets) => view.useAssets(assets));
void loadSkylineHero().then((hero) => { if (hero) view.useHero(hero); });
const input = new SkylineSwipeInput(surface);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = false;
let runner: SkylineRunner;
const collected = new Set<string>();
function makeRunner(): SkylineRunner {
  const next = new SkylineRunner(courseForPlay);
  next.onEvent((e) => { hud.setScore(scoreRun(next.events).total); if (e.t === 'incident') hud.showPenalty(POINTS.incident); });
  return next;
}
runner = makeRunner(); hud.reset();
function update(dt: number): void {
  runner.update(dt); const s = runner.snapshot;
  for (const entity of courseForPlay.entities) {
    if (runner.entityStates.get(entity.id) !== 'collected' || collected.has(entity.id)) continue;
    collected.add(entity.id);
    if (entity.scored) {
      hud.showReward(POINTS.gift);
    }
  }
  view.update(s, dt, reduced, runner.entityStates);
}
function render(): void {
  view.render();
}
const loop = new FixedLoop({ update, render });
const lifecycle = new Lifecycle({
  onPause: () => {
    paused = true; input.clear(); loop.stop(); pauseButton.textContent = '▶'; pauseButton.setAttribute('aria-label', 'Resume');
    pausePill.firstChild!.textContent = 'Paused '; pauseNote.textContent = 'Swipe or press P to resume'; pausePill.hidden = false;
  },
  onResumeRequested: () => {},
  onOrientation: (landscape) => { rotate.hidden = !landscape; },
});
function resume(): void {
  if (!rotate.hidden || document.visibilityState !== 'visible') return;
  for (const reason of lifecycle.pauseReasons) lifecycle.clear(reason);
  paused = false; pauseButton.textContent = 'II'; pauseButton.setAttribute('aria-label', 'Pause'); pausePill.hidden = true; loop.start();
}
function swipe(direction: Direction): void {
  if (paused) resume();
  if (!paused) { runner.swipe(direction); update(0); render(); }
}
function restart(): void {
  input.clear(); runner = makeRunner(); view.reset(); hud.reset(); collected.clear();
  update(0); render(); if (document.visibilityState === 'visible' && rotate.hidden) resume();
}
input.onGesture((g) => {
  if (g.type === 'swipe') swipe(g.direction);
  else if (g.type === 'restart') restart();
  else if (paused) resume(); else lifecycle.pause('user');
});
const togglePause = () => { pauseButton.blur(); if (paused) resume(); else lifecycle.pause('user'); };
const replayRun = () => { replay.blur(); restart(); };
pauseButton.addEventListener('click', togglePause); replay.addEventListener('click', replayRun);
input.attach(); lifecycle.attach(); update(0); render(); if (!paused) loop.start();
if (import.meta.env.DEV) Object.assign(window, { __skylineReview: {
  get snapshot() { return runner.snapshot; }, get paused() { return paused; },
  get events() { return [...runner.events]; }, framing: () => view.framing(),
  // The offline solver stays outside the player bundle. The browser check
  // compares this course with the one it solved before sending real swipes.
  course: SKYLINE,
  /**
   * How many entities the RUNNER was given, which is not always how many the
   * course has — the level can be run with them disabled for a movement
   * pass. The browser check branches on this so the scoring and collection
   * assertions skip rather than fail, and come back on their own.
   */
  get entitiesInPlay() { return courseForPlay.entities.length; },
  get entityStates() { return [...runner.entityStates]; },
  /** Hazards with the time each is reached, so warning checks cannot drift. */
  hazards: SKYLINE.entities
    .filter((e) => e.kind === 'hazard')
    .map((e) => ({ id: e.id, time: e.z / SKYLINE.speed })),
} });
if (import.meta.hot) import.meta.hot.dispose(() => {
  loop.stop(); input.detach(); lifecycle.detach(); view.dispose();
  pauseButton.removeEventListener('click', togglePause); replay.removeEventListener('click', replayRun);
  replay.remove();
});
