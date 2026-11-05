import './level2.css';
import { SkylineSwipeInput } from './core/skyline-swipe-input';
import { isTouchDevice, Lifecycle } from './core/lifecycle';
import { FixedLoop } from './core/loop';
import { POINTS, scoreRun } from './core/scoring';
import { SKYLINE } from './levels/skyline/course';
import { SkylineRunner } from './levels/skyline/runner';
import { laneName, LANES } from './levels/skyline/types';
import type { Direction } from './levels/skyline/types';
import { SkylineScene } from './render/skyline-scene';
import { loadStreetAssets } from './render/skyline-assets';
import { loadSkylineHero } from './render/skyline-hero';
import { DebugPanel, Hud } from './ui/hud';

document.body.dataset['level'] = '2';
// Review-only: the portrait letterbox is correct for play and useless for a
// contact sheet, where the whole point is to see everything at once.
if (new URLSearchParams(location.search).has('inspect')) {
  document.body.dataset['inspect'] = 'on';
}
document.title = 'Skyline Chase · Operation Confetti';
const app = document.getElementById('app')!;
const surface = document.getElementById('surface')!;
const rotate = document.getElementById('rotate')!;
const pausePill = document.getElementById('pause')!;
const pauseNote = document.getElementById('pause-note')!;
const pauseButton = document.getElementById('btn-pause') as HTMLButtonElement;
const replay = document.createElement('button');
replay.id = 'btn-replay'; replay.type = 'button'; replay.className = 'hud__btn';
replay.textContent = 'Replay'; replay.setAttribute('aria-label', 'Restart level 2'); pauseButton.before(replay);
const heading = document.createElement('div'); heading.className = 'skyline-heading';
heading.innerHTML = '<small>Level 02 · High roads & low roads</small><strong>Skyline Chase</strong>';
const instruction = document.createElement('div'); instruction.className = 'skyline-instruction';
instruction.innerHTML = '<strong id="skyline-action">Swipe to start</strong><small id="skyline-note">← → change lane · ↑ swing · ↓ run</small>';
const lanes = document.createElement('div'); lanes.className = 'skyline-lanes';
lanes.setAttribute('aria-label', 'Selected lane');
for (const lane of LANES) {
  const indicator = document.createElement('span'); indicator.dataset['lane'] = String(lane);
  indicator.textContent = laneName(lane); lanes.append(indicator);
}
const modes = document.createElement('div'); modes.className = 'skyline-modes';
modes.innerHTML = '<span data-mode="swing">↑ Swing</span><span data-mode="run">↓ Run</span>';
const divisions = document.createElement('div'); divisions.className = 'skyline-divisions';
divisions.innerHTML = '<i></i><i></i>';
const reward = document.createElement('span'); reward.className = 'skyline-reward'; reward.hidden = true;
app.append(heading, instruction, lanes, modes, divisions, reward);
const action = document.getElementById('skyline-action')!;
const note = document.getElementById('skyline-note')!;
const hint = document.getElementById('hint')!;
hint.innerHTML = '<span>Arrow keys / WASD · ← → lane · ↑ swing · ↓ run</span><span><kbd>P</kbd> pause · <kbd>R</kbd> replay · <kbd>I</kbd> debug</span>';
hint.hidden = isTouchDevice();
const hud = new Hud(), debug = new DebugPanel();
const params = new URLSearchParams(location.search);
let debugVisible = params.has('debug') && !params.has('clean'); debug.setVisible(debugVisible);

const courseForPlay = {
  ...SKYLINE,
  entities: [], // No obstacles or collisions for movement pass
};

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
    collected.add(entity.id); reward.textContent = entity.scored ? '+100' : 'Nice catch';
    reward.hidden = true; void reward.offsetWidth; reward.hidden = false;
  }
  view.update(s, dt, reduced, runner.entityStates);
  for (const indicator of lanes.querySelectorAll<HTMLElement>('[data-lane]')) {
    const selected = Number(indicator.dataset['lane']) === s.lane;
    indicator.classList.toggle('selected', selected); indicator.setAttribute('aria-current', String(selected));
  }
  for (const indicator of modes.querySelectorAll<HTMLElement>('[data-mode]')) {
    indicator.classList.toggle('selected', indicator.dataset['mode'] === s.requestedMode);
  }
  divisions.classList.toggle('started', s.started);
  app.classList.toggle('skyline-hit', s.hitAge < 0.22);
  if (s.hitAge > 0.45) document.getElementById('vignette')!.hidden = true;
  if (s.complete) { action.textContent = 'Skyline cleared'; note.textContent = 'Tap Replay for another run.'; }
  else if (!s.started) { action.textContent = 'Swipe to start'; note.textContent = '← → change lane · ↑ swing · ↓ run'; }
  else if (s.pendingLaunch) { action.textContent = 'Swing selected'; note.textContent = 'Launching as soon as the overhead path clears.'; }
  else if (s.phase === 'descend') { action.textContent = 'Taking the low road'; note.textContent = '← → change lane · ↑ return to swinging'; }
  else if (s.mode === 'run') { action.textContent = `${laneName(s.lane)} · Running`; note.textContent = '← → change lane · ↑ swing'; }
  else { action.textContent = `${laneName(s.lane)} · Swinging`; note.textContent = '← → change lane · ↓ run'; }
}
function render(): void {
  view.render();
  const s = runner.snapshot;
  debug.set({ level: '2 · four swipes', state: s.phase, lane: laneName(s.lane),
    mode: `${s.mode} → ${s.requestedMode}`, clearance: s.pendingLaunch ? 'waiting' : 'clear',
    time: `${s.elapsed.toFixed(1)} / ${SKYLINE.duration}`, position: `${s.p.x.toFixed(1)} / ${s.p.y.toFixed(1)} / ${s.p.z.toFixed(1)}`,
    transfer: s.transitioning ? 'yes' : 'no', anchor: s.anchor?.id ?? 'released',
    gifts: `${runner.events.filter((e) => e.t === 'gift').length}/${courseForPlay.entities.filter(e => e.kind === 'gift' && e.scored).length}`,
    incidents: runner.events.filter((e) => e.t === 'incident').length,
    fps: loop.stats.fps, draws: view.stage.drawCalls, tris: view.stage.triangles });
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
  input.clear(); runner = makeRunner(); view.reset(); hud.reset(); collected.clear(); reward.hidden = true;
  update(0); render(); if (document.visibilityState === 'visible' && rotate.hidden) resume();
}
input.onGesture((g) => {
  if (g.type === 'swipe') swipe(g.direction);
  else if (g.type === 'restart') restart();
  else if (paused) resume(); else lifecycle.pause('user');
});
const togglePause = () => { pauseButton.blur(); if (paused) resume(); else lifecycle.pause('user'); };
const replayRun = () => { replay.blur(); restart(); };
const debugKey = (e: KeyboardEvent) => {
  if (e.code !== 'KeyI' || e.repeat) return; debugVisible = !debugVisible; debug.setVisible(debugVisible);
};
pauseButton.addEventListener('click', togglePause); replay.addEventListener('click', replayRun); window.addEventListener('keydown', debugKey);
input.attach(); lifecycle.attach(); update(0); render(); if (!paused) loop.start();
if (import.meta.env.DEV) Object.assign(window, { __skylineReview: {
  get snapshot() { return runner.snapshot; }, get paused() { return paused; },
  get events() { return [...runner.events]; }, framing: () => view.framing(),
  // The offline solver stays outside the player bundle. The browser check
  // compares this course with the one it solved before sending real swipes.
  course: SKYLINE,
  get entityStates() { return [...runner.entityStates]; },
  /** Hazards with the time each is reached, so warning checks cannot drift. */
  hazards: SKYLINE.entities
    .filter((e) => e.kind === 'hazard')
    .map((e) => ({ id: e.id, time: e.z / SKYLINE.speed })),
} });
if (import.meta.hot) import.meta.hot.dispose(() => {
  loop.stop(); input.detach(); lifecycle.detach(); view.dispose();
  pauseButton.removeEventListener('click', togglePause); replay.removeEventListener('click', replayRun);
  window.removeEventListener('keydown', debugKey);
  for (const el of [replay, heading, instruction, lanes, modes, divisions, reward]) el.remove();
});
