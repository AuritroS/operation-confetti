import { InputRecogniser, type Gesture } from './core/input';
import { LEVEL_MAX, POINTS } from './core/scoring';
import { FixedLoop } from './core/loop';
import { BossRunner } from './levels/boss/runner';
import { BossScene } from './render/boss/scene';
import { CueHarness } from './levels/boss/cue-harness';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}`);
  return element as T;
};

const game = new BossRunner();
const cues = new CueHarness();
const view = new BossScene(byId<HTMLCanvasElement>('practice-stage'));
const input = new InputRecogniser(byId('practice-surface'));
const lane = byId('practice-lane');
const hearts = byId('boss-hearts');
const health = byId('boss-health');
const bossBar = byId('boss-bar');
const healthFill = byId('boss-health-fill');
const gun = byId('boss-gun');
const gunFill = byId('boss-gun-fill');
const gunLabel = byId('boss-gun-label');
const delta = byId('boss-delta');
const vignette = byId('boss-vignette');
const playerStrip = byId('player-strip');
const perf = byId('practice-perf');
const help = document.querySelector<HTMLElement>('.practice-help')!;

const HEART = 'M12 20.3l-1.5-1.3C5.4 14.4 2 11.4 2 7.8 2 5 4.2 3 7 3c1.6 0 3.1.7 4 1.9C11.9 3.7 13.4 3 15 3c2.8 0 5 2 5 4.8 0 3.6-3.4 6.6-8.5 11.2l-1.5 1.3z';
const heartPips = Array.from({ length: 5 }, () => {
  // Drawn rather than typed: the heart glyph renders as a colour emoji on some
  // platforms, which would fight the palette and ignore the lost-heart styling.
  hearts.insertAdjacentHTML('beforeend',
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}"/></svg>`);
  return hearts.lastElementChild as SVGElement;
});

/** Re-run a finished CSS animation on an element that may already be showing. */
function replay(el: HTMLElement): void {
  el.hidden = true;
  void el.offsetWidth;
  el.hidden = false;
}

let shownIncidents = 0;
const score = byId('boss-score');
const practiceCounts = byId('practice-counts');
const shots = byId('practice-shots');
const hits = byId('practice-hits');
const beat = byId('boss-beat');
const startButton = byId<HTMLButtonElement>('boss-start');
const result = byId('boss-result');
const resultTitle = byId('boss-result-title');
const resultDetail = byId('boss-result-detail');
const message = byId('practice-message');
const pausedOverlay = byId('practice-paused');
const pauseButton = byId<HTMLButtonElement>('practice-pause');
const sceneStatus = byId('practice-scene-status');
const debug = byId('practice-debug');
const debugging = new URLSearchParams(location.search).has('debug');
debug.hidden = !debugging;
byId('practice-cues').hidden = !debugging;
// Review hook: `?debug` exposes the scene graph so headless capture tooling can
// measure real world bounds instead of re-deriving assumed coordinates.
if (debugging) (window as unknown as Record<string, unknown>).level3 = { game: game.practice, runner: game, view, cues };
void view.load().then(() => { sceneStatus.hidden = true; }).catch((error: unknown) => {
  sceneStatus.textContent = `Scene asset failed to load: ${String(error)}`;
});
let paused = false;
let messageUntil = 2.5;
let elapsed = 0;
let outcomeAnnounced = false;

function say(text: string): void {
  message.textContent = text;
  messageUntil = elapsed + 1.5;
}

function setPause(value: boolean): void {
  if (game.state === 'victory' || game.state === 'defeat') return;
  paused = value;
  if (paused) input.clearHeld();
  input.setEnabled(!paused);
  pausedOverlay.hidden = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
}

function onGesture(g: Gesture): void {
  if (g.type === 'pauseToggle') { setPause(!paused); return; }
  if (g.type === 'restart') { restart(); return; }
  if (paused) return;
  if (g.type === 'swipe') {
    say(game.swipe(g.dir) ? `Lane ${game.lane + 1}` : 'Edge lane');
  } else if (g.type === 'tap') {
    if (game.fire()) say('Confetti fired!');
    else say('Gun cooling down');
  }
}

function restart(): void {
  input.clearHeld();
  game.reset();
  cues.reset();
  view.reset();
  shownIncidents = 0;
  delta.hidden = true;
  vignette.hidden = true;
  outcomeAnnounced = false;
  paused = false;
  input.setEnabled(true);
  pausedOverlay.hidden = true;
  pauseButton.textContent = 'Pause';
  result.hidden = true;
  startButton.hidden = false;
  say('Practice reset');
}

startButton.addEventListener('click', () => {
  if (paused) return;
  input.clearHeld();
  game.startFight();
  view.reset();
  startButton.hidden = true;
  say('Dodge the marked lane. Fire when Aurora’s shield drops!');
});
byId<HTMLButtonElement>('boss-restart').addEventListener('click', restart);

/*
 * Cue review controls.
 *
 * These drive the telegraph vocabulary by hand so it can be looked at before
 * a fight exists to produce it. They are bound only under `?debug`, and they
 * move no health and award no points — there is nothing here for a player to
 * reach, and nothing that could submit a score.
 */
if (debugging) {
  const lane = () => game.lane;
  const keys: Record<string, () => void> = {
    Digit1: () => { cues.strike(lane()); say('Lane strike'); },
    Digit2: () => { cues.orb(lane()); say('Magic orb'); },
    Digit3: () => { cues.toggleShield(); say(cues.shieldOpen ? 'Shield down — exposed' : 'Shield up'); },
    Digit4: () => { cues.blockShot(); say('Shot blocked'); },
    Digit5: () => { cues.spawnGift(lane()); say('Gift'); },
    Digit6: () => { cues.takeGift(); say('Gift taken'); },
    Digit7: () => { cues.endCake('recovered'); say('Cake recovered'); },
    Digit8: () => { cues.endCake('escaped'); say('Aurora escapes'); },
    Digit9: () => { cues.reset(); say('Cues cleared'); },
  };
  window.addEventListener('keydown', (event) => {
    const action = keys[event.code];
    if (!action || event.repeat || paused || game.state !== 'practice') return;
    event.preventDefault();
    action();
  });
}

input.onGesture(onGesture);
input.attach();
pauseButton.addEventListener('click', () => setPause(!paused));
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
  if (game.state === 'practice') return 'Practice · no damage';
  if (game.state !== 'playing') return '';
  if (game.beat === 'exposed') return 'Shield down · fire now!';
  if (game.beat !== 'attack') return 'Shield up · watch for a gift';
  switch (game.attackKind) {
    case 'strike': return 'Lane strike · dodge the marker';
    case 'double': return 'Two lanes marked · find the safe one';
    case 'orb': return game.markedLanes.length === 0
      ? 'Magic orb · it has not picked a lane yet'
      : 'Magic orb locked on · change lanes';
    default: return 'Shield up · watch for a gift';
  }
}

const loop = new FixedLoop({
  update(step) {
    if (paused) return;
    elapsed += step;
    game.update(step);
    // The cue harness fabricates telegraphs by hand, but the cannon is real
    // even in practice, so its state always comes from the simulation.
    const frameCues = debugging && game.state === 'practice'
      ? { ...cues.advance(step, game.lane), gun: game.practice.gun }
      : game.cues;
    view.update(game.practice, step, frameCues, game.state === 'practice');
    const incidents = game.events.reduce((n, event) => n + (event.t === 'incident' ? 1 : 0), 0);
    if (incidents > shownIncidents) {
      shownIncidents = incidents;
      delta.textContent = String(POINTS.incident);
      replay(delta);
      replay(vignette);
    }
    if (game.state === 'victory' || game.state === 'defeat') {
      input.setEnabled(false);
      if (!outcomeAnnounced) {
        outcomeAnnounced = true;
        say(game.state === 'victory' ? 'Cake recovered!' : 'Aurora escapes with the cake!');
      }
      result.hidden = game.cues.cake.progress < 1;
      resultTitle.textContent = game.state === 'victory' ? 'Cake recovered!' : 'Aurora escaped';
      resultDetail.textContent = `Level 3 score: ${game.score} / ${LEVEL_MAX[3].toLocaleString()}`;
    }
    if (messageUntil && elapsed >= messageUntil) {
      message.textContent = '';
      messageUntil = 0;
    }
  },
  render() {
    view.render();
    lane.textContent = `${game.lane + 1} / 3`;
    health.textContent = String(game.bossHp);
    healthFill.style.width = `${(game.bossHp / 100) * 100}%`;
    const exposed = game.state === 'playing' && game.beat === 'exposed';
    bossBar.classList.toggle('exposed', exposed);
    for (let i = 0; i < heartPips.length; i++) {
      heartPips[i]!.classList.toggle('lost', i >= game.playerHp);
    }
    hearts.setAttribute('aria-label', `${game.playerHp} of 5 hearts`);

    const { ready, progress, jammed } = game.cues.gun;
    gunFill.style.width = `${progress * 100}%`;
    gun.classList.toggle('charging', !ready && !jammed);
    gun.classList.toggle('jammed', jammed);
    gunLabel.textContent = jammed ? 'JAMMED' : ready ? 'READY' : 'CHARGING';

    score.textContent = String(game.score);
    // The strip is Matthew's combat state, so it replaces the instructions
    // rather than sharing the bottom of the frame with them.
    const fighting = game.state === 'playing';
    playerStrip.hidden = game.state === 'practice';
    help.hidden = fighting;
    practiceCounts.hidden = game.state !== 'practice';
    shots.textContent = String(game.practice.shotCount);
    hits.textContent = String(game.practice.hitCount);
    beat.textContent = statusLine();
    beat.classList.toggle('exposed', exposed);
    if (!debug.hidden) perf.textContent = `${view.drawCalls} draws · ${view.triangles.toLocaleString()} triangles`;
  },
});
loop.start();
