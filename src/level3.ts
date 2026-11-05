import { InputRecogniser, type Gesture } from './core/input';
import { FixedLoop } from './core/loop';
import { BossPractice } from './levels/boss/practice';
import { BossScene } from './render/boss/scene';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}`);
  return element as T;
};

const game = new BossPractice();
const view = new BossScene(byId<HTMLCanvasElement>('practice-stage'));
const input = new InputRecogniser(byId('practice-surface'));
const lane = byId('practice-lane');
const hits = byId('practice-hits');
const shots = byId('practice-shots');
const message = byId('practice-message');
const pausedOverlay = byId('practice-paused');
const pauseButton = byId<HTMLButtonElement>('practice-pause');
const sceneStatus = byId('practice-scene-status');
const debug = byId('practice-debug');
const debugging = new URLSearchParams(location.search).has('debug');
debug.hidden = !debugging;
// Review hook: `?debug` exposes the scene graph so headless capture tooling can
// measure real world bounds instead of re-deriving assumed coordinates.
if (debugging) (window as unknown as Record<string, unknown>).level3 = { game, view };
void view.load().then(() => { sceneStatus.hidden = true; }).catch((error: unknown) => {
  sceneStatus.textContent = `Scene asset failed to load: ${String(error)}`;
});
let paused = false;
let messageUntil = 2.5;
let elapsed = 0;

function say(text: string): void {
  message.textContent = text;
  messageUntil = elapsed + 1.5;
}

function setPause(value: boolean): void {
  paused = value;
  if (paused) input.clearHeld();
  pausedOverlay.hidden = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
}

function onGesture(g: Gesture): void {
  if (g.type === 'pauseToggle') { setPause(!paused); return; }
  if (g.type === 'restart') { game.reset(); setPause(false); say('Practice reset'); return; }
  if (paused) return;
  if (g.type === 'swipe') {
    say(game.swipe(g.dir) ? `Lane ${game.lane + 1}` : 'Edge lane');
  } else if (g.type === 'tap') {
    if (game.fire()) say('Confetti fired!');
    else say('Gun cooling down');
  }
}

input.onGesture(onGesture);
input.attach();
pauseButton.addEventListener('click', () => setPause(!paused));
byId<HTMLButtonElement>('practice-resume').addEventListener('click', () => setPause(false));
window.addEventListener('blur', () => setPause(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });

const loop = new FixedLoop({
  update(step) {
    if (paused) return;
    elapsed += step;
    game.update(step);
    view.update(game, step);
    if (messageUntil && elapsed >= messageUntil) {
      message.textContent = '';
      messageUntil = 0;
    }
  },
  render() {
    view.render();
    lane.textContent = `${game.lane + 1} / 3`;
    hits.textContent = String(game.hitCount);
    shots.textContent = String(game.shotCount);
    if (!debug.hidden) debug.textContent = `${view.drawCalls} draws · ${view.triangles.toLocaleString()} triangles`;
  },
});
loop.start();
