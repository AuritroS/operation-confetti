/**
 * The campaign shell.
 *
 * Plays all three levels in one page, in sequence, on one renderer. It owns
 * everything a level deliberately does not: the loop, the renderer, pause and
 * orientation, the HUD, and the run's event list. A level is mounted, played
 * until it reports a result, then disposed before the next is mounted — which
 * is the seam story panels and transitions drop into later.
 *
 * Score is reduced from the event stream with `scoreRun`, the same function
 * the Worker recomputes with, so the number on screen is the number the server
 * would agree with. Nothing is submitted: that arrives with the leaderboard.
 *
 * `?level=N` jumps straight to one level for development. A jumped run starts
 * mid-stream and is therefore not a campaign result, which is why the flag is
 * recorded on the run rather than quietly ignored.
 */
import { FixedLoop } from './core/loop';
import { InputRecogniser } from './core/input';
import { SkylineSwipeInput } from './core/skyline-swipe-input';
import { Lifecycle } from './core/lifecycle';
import { POINTS, scoreRun, type RunEvent } from './core/scoring';
import type { LevelContext, LevelController } from './core/level';
import { RendererHost } from './render/renderer-host';
import { RouteLevel } from './levels/route-level';
import { SkylineLevel } from './levels/skyline/controller';
import { BossLevel } from './levels/boss/controller';
import { Hud } from './ui/hud';
import { BossHud } from './ui/boss-hud';
import { Tutorial, type TutorialCopy } from './ui/tutorial';
import { Fade } from './ui/fade';

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const canvas = byId<HTMLCanvasElement>('stage');
const surface = byId('surface');
const rotatePrompt = byId('rotate');
const pauseOverlay = byId('pause');
const resumeBtn = byId<HTMLButtonElement>('btn-resume');
const bannerEl = byId('banner');
const stageLabel = byId('hud-stage');
const levelHud = byId('level-hud');

const host = new RendererHost(canvas);
host.observe();
const hud = new Hud();
const bossHud = new BossHud(levelHud);
const app = canvas.parentElement ?? document.body;
const tutorial = new Tutorial(app);
const fade = new Fade(app);

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
/**
 * Open straight at one level.
 *
 * `?tutorial=N` is the reviewable form: it lands on that level with the sheet
 * up, so a tutorial panel can be looked at without playing to it. `?level=N`
 * does the same for the campaign, though for levels 1 and 2 `entry.ts` sends
 * that to the standalone page instead.
 */
const jumpTo = Number(params.get('tutorial') ?? params.get('level') ?? 0);

/** How a level is built. The shell never reaches inside one. */
interface StageSpec {
  readonly id: 1 | 2 | 3;
  readonly title: string;
  readonly make: () => LevelController;
  /** What the tutorial sheet says before this level is played. */
  readonly copy: TutorialCopy;
}

const STAGES: readonly StageSpec[] = [
  {
    id: 1,
    title: 'The Gift Vault',
    make: () => new RouteLevel(host),
    copy: {
      chapter: '1 · THE GIFT HEIST',
      controls: [{ icons: ['left', 'right'], label: 'Change lane' }],
    },
  },
  {
    id: 2,
    title: 'Skyline Chase',
    make: () => new SkylineLevel(host),
    copy: {
      chapter: '2 · THE SKYLINE CHASE',
      controls: [
        { icons: ['up'], label: 'Grapple' },
        { icons: ['left', 'right'], label: 'Steer' },
        { icons: ['down'], label: 'Drop' },
      ],
    },
  },
  {
    id: 3,
    title: 'One Last Party Trick',
    make: () => new BossLevel(),
    copy: {
      chapter: '3 · CAKE SHOWDOWN',
      controls: [
        { icons: ['left', 'right'], label: 'Dodge' },
        { icons: ['tap'], label: 'Fire' },
      ],
    },
  },
];

// ---- run state ---------------------------------------------------------

let events: RunEvent[] = [];
let index = 0;
let current: LevelController | null = null;
/** True while a level is being swapped, so input and results are ignored. */
let switching = false;
let campaignOver = false;

const ctx: LevelContext = {
  host,
  emit: (event) => {
    events.push(event);
    hud.setScore(scoreRun(events).total);
    if (event.t === 'gift') hud.showReward(POINTS.gift);
    if (event.t === 'incident') hud.showPenalty(POINTS.incident);
  },
  debug,
};

function stage(): StageSpec { return STAGES[index]!; }

function banner(text: string): void {
  bannerEl.textContent = text;
  bannerEl.hidden = false;
}

function hideBanner(): void { bannerEl.hidden = true; }
function showPause(visible: boolean): void { pauseOverlay.hidden = !visible; }

// ---- input -------------------------------------------------------------

/**
 * Two recognisers, because the levels genuinely want different gestures:
 * levels 1 and 3 take lane swipes and taps, level 2 takes four directions for
 * its rope. Only the one belonging to the mounted level is attached, so a
 * gesture can never reach a level that is not on screen.
 */
const laneInput = new InputRecogniser(surface);
const swingInput = new SkylineSwipeInput(surface);

laneInput.onGesture((g) => {
  // Paused means the player left. Any deliberate input brings them back; no
  // gesture can start a pause, because pause is never something they ask for.
  if (lifecycle.isPaused) {
    if (g.type === 'tap' || g.type === 'pauseToggle') resume();
    return;
  }
  if (switching) return;
  const level = current;
  switch (g.type) {
    case 'swipe':
      if (level instanceof RouteLevel) level.swipe(g.dir);
      else if (level instanceof BossLevel) level.swipe(g.dir);
      break;
    case 'tap':
      if (level instanceof BossLevel) level.fire();
      break;
    case 'restart':
      void restartCampaign();
      break;
    default:
      break;
  }
});

swingInput.onGesture((g) => {
  if (switching) return;
  if (lifecycle.isPaused) { resume(); return; }
  const level = current;
  if (!(level instanceof SkylineLevel)) return;
  if (g.type === 'swipe') { level.swipe(g.direction); level.update(0); level.render(); }
  else if (g.type === 'restart') void restartCampaign();
});

/** Leave the rehearsal and begin the scored run. */
function beginPlay(): void {
  tutorial.hide();
  current?.beginPlay();
}

function useInputFor(id: 1 | 2 | 3): void {
  laneInput.detach();
  swingInput.detach();
  if (id === 2) swingInput.attach();
  else laneInput.attach();
}

// ---- lifecycle ---------------------------------------------------------

const lifecycle = new Lifecycle({
  onPause: () => {
    loop.stop();
    laneInput.clearHeld();
    swingInput.clear();
    if (!campaignOver) showPause(true);
  },
  onResumeRequested: () => {
    if (!campaignOver) showPause(true);
  },
  onOrientation: (isLandscape) => { rotatePrompt.hidden = !isLandscape; },
});
lifecycle.attach();

function resume(): void {
  for (const reason of lifecycle.pauseReasons) lifecycle.clear(reason);
  if (lifecycle.isPaused) return;
  showPause(false);
  if (!campaignOver && !switching) loop.start();
}

resumeBtn.addEventListener('click', () => { resumeBtn.blur(); resume(); });

// ---- the loop ----------------------------------------------------------

const loop = new FixedLoop({
  update(step) {
    if (switching || !current) return;
    current.update(step);
    if (current.result !== null) void finishLevel(current.result);
  },
  render(alpha) {
    current?.render(alpha);
    if (current instanceof BossLevel) bossHud.update(current.snapshot);
  },
});

// ---- sequencing --------------------------------------------------------

async function mountStage(): Promise<void> {
  switching = true;
  const spec = stage();
  stageLabel.textContent = `${spec.id}/3`;
  bossHud.setVisible(false);
  hideBanner();

  const level = spec.make();
  await level.mount(ctx);
  current = level;

  // Every level opens in a rehearsal. The sheet explains the verbs, the
  // player can try them against the real scene, and nothing counts until
  // they tap through — which is also what holds the screen while a slow
  // level finishes building.
  tutorial.show(spec.copy, beginPlay);

  useInputFor(spec.id);
  switching = false;
  if (!lifecycle.isPaused) loop.start();
  await fade.reveal();
}

async function finishLevel(result: 'complete' | 'defeated'): Promise<void> {
  if (switching) return;
  switching = true;
  loop.stop();

  const beaten = result === 'defeated';
  const last = index >= STAGES.length - 1;
  if (beaten || last) return endCampaign(result);

  // Curtain down before the swap: a level being torn down while another is
  // built is the one moment the scene is genuinely inconsistent.
  await fade.cover();
  current?.dispose();
  current = null;
  index++;
  await mountStage();
}

function endCampaign(result: 'complete' | 'defeated'): void {
  campaignOver = true;
  switching = false;
  loop.stop();
  laneInput.detach();
  swingInput.detach();
  const total = scoreRun(events).total;
  banner(`${result === 'complete' ? 'Cake recovered!' : 'Aurora escaped'}  ·  ${total}`);
  // Keep drawing the ending; the simulation is finished but the scene is not.
  loop.start();
}

async function restartCampaign(): Promise<void> {
  await fade.cover();
  tutorial.hide();
  current?.dispose();
  current = null;
  events = [];
  campaignOver = false;
  index = startIndex();
  hud.reset();
  hideBanner();
  await mountStage();
}

function startIndex(): number {
  if (jumpTo >= 1 && jumpTo <= 3) return jumpTo - 1;
  return 0;
}

/*
 * Review hook, `?debug` only.
 *
 * The thing worth checking automatically is that three levels mount and unmount
 * in sequence on one renderer without leaking a context or an error — which
 * takes minutes to reach by playing. Only levels 1 and 2 can be skipped; the
 * boss fight has no cheat, so nothing here can hand itself a victory.
 */
if (debug) {
  Object.assign(window, { __campaign: {
    get stage() { return stage().id; },
    get score() { return scoreRun(events).total; },
    get events() { return [...events]; },
    get switching() { return switching; },
    get over() { return campaignOver; },
    get contexts() { return host.renderer.info.memory; },
    /** Advance a level. Omit `seconds` to run it to its endpoint. */
    skip(seconds?: number): boolean {
      if (current instanceof RouteLevel) {
        current.fastForward(seconds === undefined ? Number.MAX_SAFE_INTEGER : seconds * 12);
        return true;
      }
      if (current instanceof SkylineLevel) { current.fastForward(seconds ?? 600); return true; }
      return false;
    },
  } });
}

// ---- boot --------------------------------------------------------------

hud.reset();
index = startIndex();
if (jumpTo >= 1 && jumpTo <= 3) {
  console.info(`[dev] jumped to level ${jumpTo}; this run is not a campaign result`);
}
void mountStage();
