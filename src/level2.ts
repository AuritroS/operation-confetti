/**
 * Standalone entry for level 2.
 *
 * A development and review page, as `main.ts` and `level3.ts` are for the
 * other two. It owns the renderer, the loop, the HUD, pause and the run's
 * event list; `SkylineLevel` owns the chase simulation and its scene.
 */
import './level2.css';
import { SkylineSwipeInput } from './core/skyline-swipe-input';
import { Lifecycle } from './core/lifecycle';
import { FixedLoop } from './core/loop';
import { POINTS, scoreRun, type RunEvent } from './core/scoring';
import type { LevelContext } from './core/level';
import { RendererHost } from './render/renderer-host';
import { SKYLINE } from './levels/skyline/course';
import { SkylineLevel } from './levels/skyline/controller';
import type { Direction } from './levels/skyline/types';
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
const host = new RendererHost(document.getElementById('stage') as HTMLCanvasElement);
host.observe();

/** The run's event list. The level emits into it and never reduces it. */
let events: RunEvent[] = [];
const ctx: LevelContext = {
  host,
  emit: (event) => {
    events.push(event);
    hud.setScore(scoreRun(events).total);
    if (event.t === 'gift') hud.showReward(POINTS.gift);
    if (event.t === 'incident') hud.showPenalty(POINTS.incident);
  },
  debug: new URLSearchParams(location.search).has('debug'),
};

const level = new SkylineLevel(host, SKYLINE);
const input = new SkylineSwipeInput(surface);
let paused = false;

const loop = new FixedLoop({
  update: (dt) => level.update(dt),
  render: () => level.render(),
});

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
  if (!paused) { level.swipe(direction); level.update(0); level.render(); }
}

function restart(): void {
  input.clear();
  level.restart();
  events = [];
  hud.reset();
  level.render();
  if (document.visibilityState === 'visible' && rotate.hidden) resume();
}

input.onGesture((g) => {
  if (g.type === 'swipe') swipe(g.direction);
  else if (g.type === 'restart') restart();
  else if (paused) resume(); else lifecycle.pause('user');
});
const togglePause = () => { pauseButton.blur(); if (paused) resume(); else lifecycle.pause('user'); };
const replayRun = () => { replay.blur(); restart(); };
pauseButton.addEventListener('click', togglePause); replay.addEventListener('click', replayRun);

hud.reset();
input.attach(); lifecycle.attach();
void level.mount(ctx).then(() => {
  level.render();
  if (!paused) loop.start();
});

if (import.meta.env.DEV) Object.assign(window, { __skylineReview: {
  get snapshot() { return level.snapshot; }, get paused() { return paused; },
  get events() { return level.events; }, framing: () => level.framing(),
  // The offline solver stays outside the player bundle. The browser check
  // compares this course with the one it solved before sending real swipes.
  course: SKYLINE,
  /**
   * How many entities the RUNNER was given, which is not always how many the
   * course has — the level can be run with them disabled for a movement
   * pass. The browser check branches on this so the scoring and collection
   * assertions skip rather than fail, and come back on their own.
   */
  get entitiesInPlay() { return level.course.entities.length; },
  get entityStates() { return level.entityStates; },
  /** Hazards with the time each is reached, so warning checks cannot drift. */
  hazards: SKYLINE.entities
    .filter((e) => e.kind === 'hazard')
    .map((e) => ({ id: e.id, time: e.z / SKYLINE.speed })),
} });

if (import.meta.hot) import.meta.hot.dispose(() => {
  loop.stop(); input.detach(); lifecycle.detach(); level.dispose();
  pauseButton.removeEventListener('click', togglePause); replay.removeEventListener('click', replayRun);
  replay.remove();
});
