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
 * would agree with, and the finished stream is what gets submitted — the
 * client's own total is never the thing stored.
 *
 * Every asset is fetched before the title panel, behind a progress bar. The
 * levels used to load their own models on mount, which put a download in the
 * seam between level 1's gate and level 2's first swing.
 *
 * `?level=N` jumps straight to one level for development. A jumped run starts
 * mid-stream and is therefore not a campaign result, which is why the flag is
 * recorded on the run rather than quietly ignored.
 */
import { FixedLoop } from './core/loop';
import { InputRecogniser } from './core/input';
import { SkylineSwipeInput } from './core/skyline-swipe-input';
import { Lifecycle } from './core/lifecycle';
import { POINTS, SCORING_VERSION, scoreRun, type RunEvent } from './core/scoring';
import type { LevelContext, LevelController } from './core/level';
import { RendererHost } from './render/renderer-host';
import { RouteLevel } from './levels/route-level';
import { SkylineLevel } from './levels/skyline/controller';
import { BossLevel } from './levels/boss/controller';
import { Hud } from './ui/hud';
import { BossHud } from './ui/boss-hud';
import { Tutorial, type TutorialCopy } from './ui/tutorial';
import { Fade } from './ui/fade';
import { StoryPlayer } from './ui/story';
import { LoadingScreen } from './ui/loader';
import { NameEntry } from './ui/name-entry';
import { ResultsScreen } from './ui/results';
import { preloadAssets } from './assets/preload';
import { flushPending, newId, submitRun, type Identity } from './net/scoreClient';
import { BEATS, type StoryBeat } from './story/script';

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
const stageLabel = byId('hud-stage');
const levelHud = byId('level-hud');

const host = new RendererHost(canvas);
host.observe();
const hud = new Hud();
const bossHud = new BossHud(levelHud);
const app = canvas.parentElement ?? document.body;
const tutorial = new Tutorial(app);
const story = new StoryPlayer(app);
const results = new ResultsScreen(app);
const fade = new Fade(app);
const loading = new LoadingScreen(app);
/**
 * The cover's name field, with the leaderboard hung off it.
 *
 * The board is otherwise only reachable by finishing all three levels, which
 * at a party is a board almost nobody sees. Opening it from the cover costs
 * one quiet link.
 */
const nameEntry = new NameEntry({
  secondary: {
    label: 'See the leaderboard',
    onClick: () => results.showBoard(nameEntry.identity()?.playerId ?? null),
  },
});
/**
 * Skipping is remembered for the run.
 *
 * A player who skipped the opening does not want the next panel either, and
 * being asked again at every seam is the thing "skip" was pressed to avoid.
 * A replay starts a new run and offers them again.
 */
let storySkipped = false;

/** Show a beat unless the player has opted out of the comic. */
async function tell(beat: StoryBeat | undefined): Promise<void> {
  if (!beat || storySkipped) return;
  if (await story.show(beat)) storySkipped = true;
}

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
  /** The comic beat shown before this level, if it has one. */
  readonly beat?: StoryBeat;
}

const STAGES: readonly StageSpec[] = [
  {
    id: 1,
    title: 'The Gift Vault',
    make: () => new RouteLevel(host),
    beat: BEATS.intro,
    copy: {
      chapter: '1 · THE GIFT HEIST',
      controls: [{ icons: ['left', 'right'], label: 'Change lane' }],
    },
  },
  {
    id: 2,
    title: 'Skyline Chase',
    make: () => new SkylineLevel(host),
    beat: BEATS.chase,
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
    beat: BEATS.rooftop,
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
/**
 * The run's identity on the server.
 *
 * A fresh ID per attempt, so a replay is a new row rather than an overwrite,
 * and the server's idempotency key does its job if a submission is retried.
 */
let runId = newId();
let identity: Identity | null = null;

/**
 * Why this run is not a leaderboard result, or null if it is one.
 *
 * `?level` and `?tutorial` start mid-stream, `?story` never plays, and
 * `?debug` hands out a fast-forward. All four produce a stream that is
 * honestly scored but not comparable, so they are stored with `is_test` set
 * and kept off the board — the column exists precisely so a dev run does not
 * have to be silently dropped.
 */
const testRunReason: string | null =
  jumpTo >= 1 && jumpTo <= 3 ? `Level ${jumpTo} jump — not submitted to the leaderboard.`
    : params.has('story') || params.has('results') ? 'Review screen — not submitted to the leaderboard.'
      : debug ? 'Debug run — not submitted to the leaderboard.'
        : null;

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
  hud.setVisible(true);
  bossHud.setVisible(false);

  // The panel goes up before the level is built, so the comic is what the
  // player looks at while it loads rather than a black screen.
  const telling = tell(spec.beat);
  const level = spec.make();
  await Promise.all([level.mount(ctx), telling]);
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
  if (beaten || last) { await endCampaign(result); return; }

  // Curtain down before the swap: a level being torn down while another is
  // built is the one moment the scene is genuinely inconsistent.
  await fade.cover();
  current?.dispose();
  current = null;
  index++;
  await mountStage();
}

async function endCampaign(result: 'complete' | 'defeated'): Promise<void> {
  campaignOver = true;
  switching = false;
  laneInput.detach();
  swingInput.detach();
  // Let the level's own ending play out, then close on the comic.
  await tell(result === 'complete' ? BEATS.win : BEATS.loss);
  loop.stop();

  // The live readout is about a run in progress; the results card is now the
  // only true statement about the score.
  hud.setVisible(false);

  const score = scoreRun(events);
  results.show(
    { outcome: result === 'complete' ? 'win' : 'loss', total: score.total, levelScores: score.levelScores },
    identity?.playerId ?? null,
    () => { void restartCampaign(); },
  );
  // Submission is deliberately not awaited: the screen is already up with
  // "Saving score…" on it, and the rank line fills in when the server
  // answers. A slow network must never hold the result back.
  void submitScore(result === 'complete' ? 'win' : 'loss', score.levelScores);

  // Keep drawing the ending; the simulation is finished but the scene is not.
  loop.start();
}

/**
 * Post the finished run and report what happened to the rank line.
 *
 * The event stream goes up as-is and the Worker recomputes from it; the
 * totals in the body are there for the stored row, never for the ranking.
 */
async function submitScore(outcome: 'win' | 'loss', levelScores: [number, number, number]): Promise<void> {
  if (!identity) {
    results.setSaveState({ kind: 'skipped', why: 'No name set, so this run was not submitted.' });
    return;
  }

  const submission = {
    runId,
    playerId: identity.playerId,
    displayName: identity.displayName,
    scoringVersion: SCORING_VERSION,
    outcome,
    levelScores,
    events,
    isTest: testRunReason !== null,
  };

  const sent = await submitRun(submission);
  switch (sent.kind) {
    case 'accepted':
      // A test run is stored but ranked on a separate board, so showing its
      // position next to real players' would be the wrong claim.
      results.setSaveState(
        testRunReason === null
          ? { kind: 'saved', rank: sent.run.rank }
          : { kind: 'skipped', why: testRunReason },
      );
      break;
    case 'queued':
      results.setSaveState({ kind: 'offline' });
      break;
    case 'rejected':
      console.warn(`[score] rejected ${sent.status}: ${sent.detail}`);
      results.setSaveState({ kind: 'skipped', why: 'The server could not accept this run.' });
      break;
  }
}

async function restartCampaign(): Promise<void> {
  await fade.cover();
  results.hide();
  tutorial.hide();
  current?.dispose();
  current = null;
  events = [];
  campaignOver = false;
  storySkipped = false;
  // A new attempt is a new row, not an edit of the last one.
  runId = newId();
  index = startIndex();
  hud.reset();
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
if (testRunReason) console.info(`[dev] ${testRunReason}`);

void (async () => {
  /*
   * `?results=win|loss` holds the end screen up for review.
   *
   * Reaching it honestly means beating the boss, and reaching the loss form
   * means losing to her. It is presentational only: no level is mounted,
   * nothing is submitted, and the screen says so — it cannot put a
   * fabricated run anywhere near the board. It also runs before the preload,
   * because a screen with no 3D behind it needs none of those files.
   */
  const endScreen = params.get('results');
  if (endScreen === 'win' || endScreen === 'loss') {
    loading.hide();
    hud.setVisible(false);
    const sample: [number, number, number] = endScreen === 'win' ? [600, 450, 900] : [500, 250, 150];
    results.show(
      { outcome: endScreen, total: sample[0] + sample[1] + sample[2], levelScores: sample },
      // No run was played, so there is no row of theirs to highlight.
      null,
      () => { location.search = ''; },
    );
    results.setSaveState({ kind: 'skipped', why: 'Review sample — nothing was submitted.' });
    return;
  }

  /*
   * Everything, before anything.
   *
   * The whole catalogue is about 60 files; fetching it here costs one wait
   * the player understands, instead of several they do not. A missing file
   * is reported and stepped over — every consumer already falls back to a
   * primitive, and refusing to boot the party game over one decorative bush
   * would be the worse failure.
   */
  const report = await preloadAssets((fraction) => loading.set(fraction));
  if (report.failed.length > 0) {
    console.warn(`[preload] ${report.failed.length} asset(s) unavailable`, report.failed);
    loading.warn(report.failed.length);
  }
  loading.hide();

  // A run made offline last time uploads now, unprompted. Not awaited: it is
  // housekeeping, and it must not stand between the player and the cover.
  void flushPending();

  /*
   * `?story=<id>` holds one panel up for review.
   *
   * Looking at the loss ending otherwise means losing the boss fight, and
   * looking at any of them means playing to that seam. The panel simply
   * stays up; nothing is mounted behind it.
   */
  const only = params.get('story');
  if (only) {
    const beat = (BEATS as Record<string, StoryBeat | undefined>)[only];
    if (beat) { await story.show(beat); return; }
    console.warn(`[dev] no story beat "${only}". Try: ${Object.keys(BEATS).join(', ')}`);
  }

  // The cover opens the game, and carries the name field — one screen they
  // are already reading, rather than a sign-in step before it. It is skipped
  // when jumping straight to a level, because the point of that jump is to
  // reach the level, and such a run is not a board result anyway.
  if (jumpTo === 0) {
    await story.show(BEATS.title, nameEntry);
    identity = nameEntry.commit();
  } else {
    identity = nameEntry.identity();
  }
  await mountStage();
})();
