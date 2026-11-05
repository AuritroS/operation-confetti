/**
 * Standalone entry for the boss fight.
 *
 * A development and review page, not the campaign. It plays the role the
 * campaign shell will play — it owns the renderer, the loop, pause, the HUD
 * and the run's event list — while `BossLevel` owns only the simulation and
 * its scene. Keeping this page working after the shell exists is deliberate:
 * it is how level 3 gets reviewed without playing two levels first, and the
 * same arrangement proves the level really is mountable.
 *
 * Scores shown here come from `scoreRun` over the emitted events, exactly as
 * the campaign will compute them. A standalone attempt is never submitted.
 */
import { InputRecogniser, type Gesture } from './core/input';
import { Hud } from './ui/hud';
import { BossHud } from './ui/boss-hud';
import { LEVEL_MAX, POINTS, scoreRun, type RunEvent } from './core/scoring';
import { FixedLoop } from './core/loop';
import type { LevelContext } from './core/level';
import { RendererHost } from './render/renderer-host';
import { BossLevel } from './levels/boss/controller';
import { CueHarness } from './levels/boss/cue-harness';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}`);
  return element as T;
};

const host = new RendererHost(byId<HTMLCanvasElement>('practice-stage'));
host.observe();
const level = new BossLevel();
const cues = new CueHarness();
const input = new InputRecogniser(byId('practice-surface'));
const lane = byId('practice-lane');
const hud = new Hud();
const bossHud = new BossHud(byId('level-hud'));
const perf = byId('practice-perf');
const help = document.querySelector<HTMLElement>('.practice-help')!;
const practiceCounts = byId('practice-counts');
const shots = byId('practice-shots');
const hits = byId('practice-hits');
const beat = byId('boss-beat');
const startButton = byId<HTMLButtonElement>('boss-start');
const result = byId('boss-result');
const resultTitle = byId('boss-result-title');
const resultDetail = byId('boss-result-detail');
const pausedOverlay = byId('practice-paused');
const sceneStatus = byId('practice-scene-status');
const debug = byId('practice-debug');
const debugging = new URLSearchParams(location.search).has('debug');
debug.hidden = !debugging;
byId('practice-cues').hidden = !debugging;

/**
 * The run's event list, owned here exactly as the shell will own it.
 *
 * The level emits into this and never reduces it. Everything displayed comes
 * back out of `scoreRun`, so this page cannot show a number the authoritative
 * recompute would disagree with.
 */
const runEvents: RunEvent[] = [];
const ctx: LevelContext = {
  host,
  emit: (event) => { runEvents.push(event); },
  debug: debugging,
};
if (debugging) level.cueOverride = () => cues.advance(1 / 60, level.runner.lane);

let paused = false;
let elapsed = 0;
let outcomeAnnounced = false;
let shownIncidents = 0;


function levelScore(): number {
  return scoreRun(runEvents).levelScores[2];
}

function setPause(value: boolean): void {
  if (level.result !== null) return;
  paused = value;
  if (paused) input.clearHeld();
  input.setEnabled(!paused);
  pausedOverlay.hidden = !paused;
}

function onGesture(g: Gesture): void {
  if (g.type === 'pauseToggle') { setPause(!paused); return; }
  if (g.type === 'restart') { restart(); return; }
  if (paused) return;
  if (g.type === 'swipe') level.swipe(g.dir);
  else if (g.type === 'tap') level.fire();
}

function restart(): void {
  input.clearHeld();
  level.restart();
  cues.reset();
  runEvents.length = 0;
  shownIncidents = 0;
  outcomeAnnounced = false;
  paused = false;
  input.setEnabled(true);
  pausedOverlay.hidden = true;
  hud.reset();
  result.hidden = true;
  startButton.hidden = false;
}

startButton.addEventListener('click', () => {
  if (paused) return;
  input.clearHeld();
  level.startFight();
  startButton.hidden = true;
});
byId<HTMLButtonElement>('boss-restart').addEventListener('click', restart);

/*
 * Cue review controls, bound only under `?debug`.
 *
 * They drive the telegraph vocabulary by hand so it can be looked at outside a
 * fight. They move no health and award no points, so nothing here can reach
 * the event list or a score.
 */
if (debugging) {
  const at = () => level.runner.lane;
  const keys: Record<string, () => void> = {
    Digit1: () => { cues.strike(at()); },
    Digit2: () => { cues.orb(at()); },
    Digit3: () => { cues.toggleShield(); },
    Digit4: () => { cues.blockShot(); },
    Digit5: () => { cues.spawnGift(at()); },
    Digit6: () => { cues.takeGift(); },
    Digit7: () => { cues.endCake('recovered'); },
    Digit8: () => { cues.endCake('escaped'); },
    Digit9: () => { cues.reset(); },
  };
  window.addEventListener('keydown', (event) => {
    const action = keys[event.code];
    if (!action || event.repeat || paused || level.runner.state !== 'practice') return;
    event.preventDefault();
    action();
  });
}

input.onGesture(onGesture);
input.attach();
byId<HTMLButtonElement>('practice-resume').addEventListener('click', () => setPause(false));
window.addEventListener('blur', () => setPause(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });

/**
 * The one line of text carrying the fight's read.
 *
 * An orb is deliberately described differently before and after it locks: its
 * whole point is that the threat exists before the lane does, and telling the
 * player "change lanes" while it is still drifting would be advice they cannot
 * act on.
 */
function statusLine(): string {
  const s = level.snapshot;
  if (s.state === 'practice') return 'Practice · no damage';
  if (s.state !== 'playing') return '';
  if (s.beat === 'exposed') return 'Shield down · fire now!';
  if (s.beat !== 'attack') return 'Shield up · watch for a gift';
  switch (s.attackKind) {
    case 'strike': return 'Lane strike · dodge the marker';
    case 'double': return 'Two lanes marked · find the safe one';
    case 'orb': return s.markedLanes.length === 0
      ? 'Magic orb · it has not picked a lane yet'
      : 'Magic orb locked on · change lanes';
    default: return 'Shield up · watch for a gift';
  }
}

const loop = new FixedLoop({
  update(step) {
    if (paused) return;
    elapsed += step;
    level.update(step);

    const incidents = runEvents.reduce((n, e) => n + (e.t === 'incident' ? 1 : 0), 0);
    if (incidents > shownIncidents) {
      shownIncidents = incidents;
      hud.showPenalty(POINTS.incident);
    }

    if (level.result !== null) {
      input.setEnabled(false);
      if (!outcomeAnnounced) {
        outcomeAnnounced = true;
        const won = level.result === 'complete';
        resultTitle.textContent = won ? 'Cake recovered!' : 'Aurora escaped';
        resultDetail.textContent = `Level 3 score: ${levelScore()} / ${LEVEL_MAX[3].toLocaleString()}`;
        result.hidden = false;
      }
    }
  },
  render() {
    level.render();
    const s = level.snapshot;
    lane.textContent = `${s.lane + 1} / 3`;
    bossHud.update(s);
    hud.setScore(levelScore());
    help.hidden = s.state === 'playing';
    practiceCounts.hidden = s.state !== 'practice';
    shots.textContent = String(s.shotCount);
    hits.textContent = String(s.hitCount);
    beat.textContent = statusLine();
    beat.classList.toggle('exposed', s.state === 'playing' && s.beat === 'exposed');
    if (!debug.hidden) perf.textContent = `${level.drawCalls} draws · ${level.triangles.toLocaleString()} triangles`;
  },
});

void level.mount(ctx).then(() => {
  sceneStatus.hidden = true;
  // Review hook: `?debug` exposes the mounted level so headless capture tooling
  // can measure real world bounds instead of re-deriving assumed coordinates.
  if (debugging) (window as unknown as Record<string, unknown>).level3 = { level, runner: level.runner, host, cues };
  loop.start();
}).catch((error: unknown) => {
  sceneStatus.textContent = `Scene asset failed to load: ${String(error)}`;
});
