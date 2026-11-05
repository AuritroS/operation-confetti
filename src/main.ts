/**
 * Standalone entry for level 1.
 *
 * A development and review page, as `level3.html` is for the boss fight. It
 * plays the role the campaign shell will play — it owns the renderer, the
 * loop, the HUD, pause and the run's event list — while `RouteLevel` owns the
 * route simulation and its scene.
 *
 * Score comes from `scoreRun` over the emitted events, exactly as the Worker
 * recomputes it, so the HUD can never drift from the server.
 */
import { FixedLoop } from './core/loop';
import { InputRecogniser } from './core/input';
import { Lifecycle } from './core/lifecycle';
import { POINTS, scoreRun, type RunEvent } from './core/scoring';
import type { LevelContext } from './core/level';
import { RendererHost } from './render/renderer-host';
import { RouteLevel } from './levels/route-level';
import { DebugPanel, Hud } from './ui/hud';
import { health } from './net/scoreClient';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const surface = document.getElementById('surface') as HTMLElement;
const rotatePrompt = document.getElementById('rotate') as HTMLElement;
const pauseOverlay = document.getElementById('pause') as HTMLElement;
const resumeBtn = document.getElementById('btn-resume') as HTMLButtonElement;
const bannerEl = document.getElementById('banner') as HTMLElement;

const host = new RendererHost(canvas);
host.observe();
const hud = new Hud();
const debug = new DebugPanel();

/** The run's event list. The level emits into it and never reduces it. */
let events: RunEvent[] = [];
const ctx: LevelContext = {
  host,
  emit: (event) => {
    events.push(event);
    // The reducer is the single source of truth for score, exactly as the
    // Worker will recompute it.
    hud.setScore(scoreRun(events).total);
    if (event.t === 'gift') hud.showReward(POINTS.gift);
    if (event.t === 'incident') hud.showPenalty(POINTS.incident);
  },
  debug: new URLSearchParams(location.search).has('debug'),
};

const level = new RouteLevel(host);
let finished = false;

function showBanner(text: string): void {
  bannerEl.textContent = text;
  bannerEl.hidden = false;
}

function hideBanner(): void { bannerEl.hidden = true; }
function showPause(visible: boolean): void { pauseOverlay.hidden = !visible; }

const loop = new FixedLoop({
  update(step) {
    level.update(step);
    if (!finished && level.result !== null) {
      finished = true;
      input.setEnabled(false);
      showBanner(`Vault reached  ·  ${scoreRun(events).total}`);
    }
  },
  render() {
    level.render();
    const snap = level.snapshot;
    debug.set({
      fps: loop.stats.fps,
      steps: loop.stats.stepsLastFrame,
      dropped: loop.stats.droppedSteps,
      lane: `${snap.laneIndex + 1}/${snap.lanes}`,
      dist: `${snap.travelled.toFixed(0)}/${snap.routeLength}`,
      progress: `${Math.round(snap.progress * 100)}%`,
      speed: snap.speed.toFixed(1),
      stage: '1/3',
      gifts: `${snap.giftsCollected}/${snap.giftsTotal}`,
      hits: snap.incidents,
      invuln: snap.invulnerable ? 'yes' : 'no',
      score: scoreRun(events).total,
      player: `${snap.playerSource}${snap.clipCount ? ` (${snap.clipCount} clips)` : ''}`,
      layers: snap.layers,
      draws: level.drawCalls,
      tris: level.triangles,
    });
  },
});

// ---- input -------------------------------------------------------------

const input = new InputRecogniser(surface);
input.onGesture((g) => {
  switch (g.type) {
    case 'swipe':
      level.swipe(g.dir);
      break;
    case 'tap':
    case 'pauseToggle':
      // Pause is automatic; input only ever brings the player back.
      if (lifecycle.isPaused) resume();
      break;
    case 'restart':
      resetRun();
      break;
    default:
      break;
  }
});
input.attach();

// ---- lifecycle ---------------------------------------------------------

const lifecycle = new Lifecycle({
  onPause: () => {
    loop.stop();
    input.clearHeld();
    if (!finished) showPause(true);
  },
  onResumeRequested: () => {
    if (!finished) showPause(true);
  },
  onOrientation: (isLandscape) => {
    rotatePrompt.hidden = !isLandscape;
  },
});
lifecycle.attach();

function resume(): void {
  for (const reason of lifecycle.pauseReasons) lifecycle.clear(reason);
  if (lifecycle.isPaused) return;
  showPause(false);
  input.setEnabled(true);
  if (!finished) loop.start();
}

function resetRun(): void {
  level.restart();
  events = [];
  finished = false;
  hud.reset();
  hideBanner();
  input.setEnabled(true);
  loop.start();
}

resumeBtn.addEventListener('click', () => { resumeBtn.blur(); resume(); });

// ---- boot --------------------------------------------------------------

hud.reset();
debug.setVisible(false);

void level.mount(ctx).then(() => {
  // A single-level review page, so it skips the rehearsal the campaign shows.
  level.beginPlay();
  /**
   * `?start=400` fast-forwards the run before play begins.
   *
   * A review affordance, like `?clean` and `?layers`. The vault only enters
   * view in the last 70 units, roughly a minute in, and nobody should have to
   * play a full route to look at the ending. It replays real simulation steps
   * rather than teleporting, so every event that would have fired still fires.
   */
  const skipTo = Number(new URLSearchParams(location.search).get('start') ?? 0);
  if (skipTo > 0) {
    console.info(`[dev] skipped to ${level.fastForward(skipTo).toFixed(0)} units`);
  }
  loop.start();
});

void health().then((h) => {
  console.info('[health]', h);
});
