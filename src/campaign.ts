/**
 * The campaign shell.
 *
 * Plays all three levels in one page, in sequence, on one renderer. It owns
 * everything a level deliberately does not: the loop, the renderer, pause and
 * orientation, the HUD, and the run's event list. A level is mounted, played
 * until it reports a result, then disposed before the next is mounted — which
 * is the seam story panels and transitions drop into.
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

/** Show a seam's beats in order, unless the player has opted out of the comic. */
async function tell(beats: readonly StoryBeat[]): Promise<void> {
  for (const beat of beats) {
    if (storySkipped) return;
    if (await story.show(beat)) storySkipped = true;
  }
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
  /** The comic beats shown before this level, in order. */
  readonly beats: readonly StoryBeat[];
}

const STAGES: readonly StageSpec[] = [
  {
    id: 1,
    title: 'The Gift Vault',
    make: () => new RouteLevel(host),
    beats: [BEATS.intro],
    copy: {
      chapter: 'Chapter 1 · The Gift Vault',
      controls: [{ icons: ['left', 'right'], label: 'Change lane' }],
    },
  },
  {
    id: 2,
    title: 'Skyline Chase',
    make: () => new SkylineLevel(host),
    // Two pages at this seam: the vault opening on the city, then the chase.
    // It is the story's midpoint and the only place he picks up the blaster
    // the next sheet teaches.
    beats: [BEATS.vault, BEATS.chase],
    copy: {
      chapter: 'Chapter 2 · Skyline Chase',
      controls: [
        { icons: ['up'], label: 'Grapple' },
        { icons: ['left', 'right'], label: 'Steer' },
        { icons: ['down'], label: 'Drop' },
      ],
    },
  },
  {
    id: 3,
    title: 'Cake Showdown',
    make: () => new BossLevel(),
    beats: [BEATS.rooftop],
    copy: {
      chapter: 'Chapter 3 · Cake Showdown',
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
 * `?level` and `?tutorial` start mid-stream, `?story`, `?results` and
 * `?review` never play, and `?debug` hands out a fast-forward. All of them
 * produce a stream that is honestly scored but not comparable, so they are
 * stored with `is_test` set and kept off the board — the column exists
 * precisely so a dev run does not have to be silently dropped.
 */
const testRunReason: string | null =
  jumpTo >= 1 && jumpTo <= 3 ? `Level ${jumpTo} jump — not submitted to the leaderboard.`
    : params.has('story') || params.has('results') || params.has('review')
      ? 'Review screen — not submitted to the leaderboard.'
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

  // The panels go up before the level is built, so the comic is what the
  // player looks at while it loads rather than a black screen.
  const level = spec.make();
  const mounting = level.mount(ctx);
  await tell(spec.beats);

  // Then the chapter card, which is where any load still outstanding hides:
  // it holds for a reading beat, or until the level is ready if that is
  // longer, and the iris closes on it before opening on the rehearsal.
  await showChapter(spec, mounting);
  current = level;

  // Every level opens in a rehearsal. The sheet explains the verbs, the
  // player can try them against the real scene, and nothing counts until
  // they tap through — which is also what holds the screen while a slow
  // level finishes building.
  tutorial.show(spec.copy, beginPlay);

  useInputFor(spec.id);
  switching = false;
  if (!lifecycle.isPaused) loop.start();
  // The iris opens on the rehearsal with the sheet already up, so the first
  // thing seen of a level is the level and how to play it, together.
  await fade.reveal();
}

async function finishLevel(result: 'complete' | 'defeated'): Promise<void> {
  if (switching) return;
  switching = true;

  const beaten = result === 'defeated';
  const last = index >= STAGES.length - 1;

  // Iris down before the swap: a level being torn down while another is
  // built is the one moment the scene is genuinely inconsistent. The loop
  // keeps drawing until the iris is shut, so the level's own ending — the
  // celebration at the gate, the confetti — plays out underneath it rather
  // than freezing on the frame the result arrived in.
  await fade.cover();
  loop.stop();

  if (beaten || last) { await endCampaign(result); return; }

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

  // The live readout is about a run in progress; the results card is now the
  // only true statement about the score.
  hud.setVisible(false);
  bossHud.setVisible(false);

  // Close on the comic, then the last page.
  await tell([result === 'complete' ? BEATS.win : BEATS.loss]);

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

  // The finished level stays mounted under the results, so a replay disposes
  // it the same way a seam would. Nothing draws: the iris is shut.
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
  // The results card is opaque, so the iris is already out of sight.
  fade.shut();
  loop.stop();
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

/**
 * A label for the review routes: which screen this is, and how many.
 *
 * Never shown to a player. It lets a reviewer tapping through on a phone
 * know where they are in the sequence without a second screen open.
 */
const chip = document.createElement('div');
chip.className = 'review-chip';
chip.hidden = true;
app.append(chip);
function mark(text: string): void { chip.hidden = false; chip.textContent = text; }

// ---- chapter card --------------------------------------------------------

/**
 * The title card between the comic and a level.
 *
 * A reading beat on an otherwise empty stage: the iris opens on it, holds,
 * and closes before opening on the level. In the campaign it also covers
 * whatever part of the level's build is still outstanding; in the story
 * review it stands in for the level entirely.
 */
const chapter = document.createElement('div');
chapter.className = 'chapter';
chapter.hidden = true;
app.append(chapter);

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * The card leaves on a tap, like a panel, and not before the level behind
 * it is ready. The cue appears once it is, so a tap never lands on a wait.
 */
async function showChapter(spec: StageSpec, until: Promise<unknown> = Promise.resolve()): Promise<void> {
  chapter.replaceChildren();
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = `Level ${spec.id}`;
  const title = document.createElement('p');
  title.className = 'headline chapter__title';
  title.textContent = spec.title;
  const cue = document.createElement('p');
  cue.className = 'chapter__cue';
  cue.textContent = 'tap to continue';
  cue.hidden = true;
  chapter.append(eyebrow, title, cue);
  chapter.hidden = false;
  await fade.reveal();
  await Promise.all([wait(600), until]);
  cue.hidden = false;
  await new Promise<void>((done) => chapter.addEventListener('click', () => done(), { once: true }));
  await fade.cover();
  chapter.hidden = true;
}

// ---- review routes -----------------------------------------------------

/**
 * `?review=story`: the whole comic, in order, with the real seams.
 *
 * Cover, every panel, and the two endings back to back, with the iris and a
 * placeholder card standing in for each level. Skip is ignored here, since
 * the point is to see every page.
 */
async function reviewStory(): Promise<void> {
  loading.hide();
  hud.setVisible(false);
  const pages: Array<{ beat: StoryBeat; slot?: NameEntry; then?: StageSpec | undefined }> = [
    { beat: BEATS.title, slot: nameEntry },
    { beat: BEATS.intro, then: STAGES[0] },
    { beat: BEATS.vault },
    { beat: BEATS.chase, then: STAGES[1] },
    { beat: BEATS.rooftop, then: STAGES[2] },
    { beat: BEATS.win },
    { beat: BEATS.loss },
  ];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    mark(`story ${i + 1}/${pages.length} · ${page.beat.id}`);
    await story.show(page.beat, page.slot);
    if (page.then) {
      // The panel is opaque, so the iris under it is already shut.
      fade.shut();
      await showChapter(page.then);
    }
  }
  mark('story · results');
  await fade.reveal();
  results.show({ outcome: 'win', total: 1750, levelScores: [600, 450, 700] }, null,
    () => { location.search = ''; });
  results.setSaveState({ kind: 'skipped', why: 'Review sample — nothing was submitted.' });
}

/**
 * `?review=chrome`: every screen that is not a level or a panel, in order.
 *
 * Each screen is left by its own control, so what is reviewed is the real
 * button in the real place. Nothing is mounted and nothing is submitted.
 */
async function reviewChrome(): Promise<void> {
  const total = 7;
  campaignOver = true;
  mark(`chrome 1/${total} · loader`);
  for (let i = 0; i <= 20; i++) { loading.set(i / 20); await wait(70); }
  await wait(500);
  loading.hide();
  hud.setVisible(false);

  mark(`chrome 2/${total} · cover + name`);
  await story.show(BEATS.title, nameEntry);
  await wait(10);

  mark(`chrome 3/${total} · tutorial sheet`);
  await new Promise<void>((done) => tutorial.show(STAGES[0]!.copy, () => { tutorial.hide(); done(); }));

  mark(`chrome 4/${total} · pause`);
  await new Promise<void>((done) => {
    showPause(true);
    resumeBtn.addEventListener('click', () => done(), { once: true });
  });
  showPause(false);

  mark(`chrome 5/${total} · results, win`);
  await new Promise<void>((done) => {
    results.show({ outcome: 'win', total: 1750, levelScores: [600, 450, 700] }, null, done);
    results.setSaveState({ kind: 'saved', rank: 3 });
  });

  mark(`chrome 6/${total} · results, loss`);
  await new Promise<void>((done) => {
    results.show({ outcome: 'loss', total: 850, levelScores: [500, 250, 100] }, null, done);
    results.setSaveState({ kind: 'offline' });
  });
  results.hide();

  mark(`chrome 7/${total} · rotate prompt (tap to finish)`);
  rotatePrompt.hidden = false;
  rotatePrompt.style.display = 'grid';
  await new Promise<void>((done) => rotatePrompt.addEventListener('click', () => done(), { once: true }));
  rotatePrompt.style.display = '';
  rotatePrompt.hidden = true;

  mark('chrome · done — reload to run again');
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
   * `?review=story|chrome` walk the glue without the levels.
   *
   * Neither mounts anything, so neither waits for the preload: the comic's
   * images load as ordinary `<img>` requests, and the chrome needs no files
   * at all.
   */
  const review = params.get('review');
  if (review === 'story') { await reviewStory(); return; }
  if (review === 'chrome') { await reviewChrome(); return; }

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
  // The first level opens through the iris like every later one. The cover
  // panel is opaque, so there is nothing to watch close: shut it outright.
  fade.shut();
  await mountStage();
})();
