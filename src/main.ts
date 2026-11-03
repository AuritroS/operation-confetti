/**
 * Level 1 slice (design doc §5, §12 Phase 2 partial).
 *
 * What this covers: the full route loop with gifts and static obstacles —
 * travel, lane movement, collisions, one-shot penalties, invulnerability,
 * score events into the reducer, and route completion. The player visual is
 * the real Rogue, loaded non-blockingly over a capsule stand-in, which proves
 * the asset seam against live gameplay.
 *
 * Not yet built: guards, the tutorial beat, levels 2 and 3, story panels,
 * name entry and the leaderboard.
 */
import { Group } from 'three';
import { FixedLoop, STEP_S } from './core/loop';
import { InputRecogniser } from './core/input';
import { isTouchDevice, Lifecycle } from './core/lifecycle';
import { scoreRun, type RunEvent } from './core/scoring';
import { LevelRunner } from './levels/runner';
import { LEVEL_1 } from './levels/level1';
import { Stage } from './render/stage';
import { buildRoute, makeCapsulePlayer, RouteMarkers, type PlayerVisual } from './render/primitives';
import { EntityVisuals } from './render/entities';
import { loadGameplayProps, type PropProvider } from './render/props-loader';
import { buildVaultDoor } from './render/custom';
import { CLIPS } from './assets/manifest';
import { loadRoguePlayer } from './render/rogue';
import { Environment, requestedLayers } from './render/environment';
import { DebugPanel, Hud } from './ui/hud';
import { health } from './net/scoreClient';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const surface = document.getElementById('surface') as HTMLElement;
const rotatePrompt = document.getElementById('rotate') as HTMLElement;
const pausePill = document.getElementById('pause') as HTMLElement;
const pauseNote = document.getElementById('pause-note') as HTMLElement;
const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;

const stage = new Stage(canvas);
stage.observe();

const hud = new Hud();
const debug = new DebugPanel();

// ---- scene -------------------------------------------------------------

const world = new Group();
stage.scene.add(world);

const enabledLayers = requestedLayers();
const hasRooftop = enabledLayers.has('rooftop');

/**
 * Prop provider for gameplay visuals.
 *
 * Returns nothing until the props arrive, at which point the entities are
 * rebuilt with real assets — the same non-blocking pattern the player uses,
 * so a slow or failed load leaves a playable level built from primitives
 * rather than an empty one.
 */
let gameplayProps: PropProvider = () => null;

let runner = new LevelRunner(LEVEL_1);
let entityVisuals = new EntityVisuals(LEVEL_1, runner.tracked, gameplayProps);

/** The route endpoint, revealed as the vault comes into range. */
const vault = buildVaultDoor(LEVEL_1.laneWidth * LEVEL_1.laneCount, 3.6);
vault.visible = false;
world.add(vault);
const markers = new RouteMarkers(LEVEL_1);
// The rooftop layer brings its own surface and parapets, so the primitive
// ground would z-fight with it, and the dividers can drop right back once the
// parapets bound the play area visually.
const route = buildRoute(LEVEL_1, { surface: !hasRooftop, dimDividers: hasRooftop });

world.add(route, entityVisuals.group);
if (!hasRooftop) world.add(markers.group);

/** Hit feedback bell, parked above the player and shown only on impact. */
const bell = new Group();
bell.position.set(0, 2.1, -1.4);
bell.visible = false;
world.add(bell);

/** Built asynchronously; gameplay never waits on decoration. */
let environment: Environment | null = null;

let player: PlayerVisual = makeCapsulePlayer();
let playerSource = 'capsule';
let clipCount = 0;
world.add(player.object);

/** Swap the capsule for the Rogue once it is ready, preserving run state. */
function installPlayer(next: PlayerVisual, source: string): void {
  player.dispose();
  player = next;
  playerSource = source;
  world.add(player.object);
}

// ---- run state ---------------------------------------------------------

const run = {
  score: 0,
  events: [] as RunEvent[],
  finished: false,
};

/** Rises when the runner reports a collision, which drives hit feedback. */
let lastIncidents = 0;

/**
 * Hit feedback.
 *
 * A collision previously only flashed the character. Now it also plays the
 * hit reaction and swings the bell, which matters because the doc requires
 * damage to be distinguishable without sound (§12 Phase 4).
 *
 * None of this touches the simulation: the penalty is already recorded by
 * the time this runs.
 */
function onHit(): void {
  bellSwing = 1;
  player.playOneShot(CLIPS.matthew.hit);
}

/** Decays to zero after a hit; drives the bell's swing. */
let bellSwing = 0;

function onEvent(event: RunEvent): void {
  run.events.push(event);
  // The reducer is the single source of truth for score, exactly as the
  // Worker will recompute it, so the HUD can never drift from the server.
  run.score = scoreRun(run.events).total;
  hud.setScore(run.score);
}

runner.onEvent(onEvent);

// ---- simulation --------------------------------------------------------

function update(step: number): void {
  if (run.finished) return;

  runner.update(step);

  const snap = runner.snapshot;
  environment?.update(snap.travelled, step);
  player.setHitFlash(snap.invulnerable);
  // Bank into the lane change; there is no strafe clip to play instead.
  player.setLean(runner.lanes.lean);
  // Blink while protected. An emissive flash alone was easy to miss, and the
  // doc wants damage legible without sound (§12 Phase 4).
  player.setBlink(snap.invulnerable && Math.floor(snap.travelled * 9) % 2 === 0);
  player.update(step, true);

  // The vault grows out of the fog as the route ends, so the run has a
  // visible goal rather than just a progress bar.
  vault.position.z = -(LEVEL_1.routeLength - snap.travelled);
  vault.visible = LEVEL_1.routeLength - snap.travelled < 70;

  if (snap.incidents > lastIncidents) {
    lastIncidents = snap.incidents;
    onHit();
  }

  if (bellSwing > 0) {
    bellSwing = Math.max(0, bellSwing - step * 1.6);
    bell.rotation.z = Math.sin(bellSwing * 34) * bellSwing * 0.5;
  }
  bell.visible = bellSwing > 0;

  if (snap.complete && !run.finished) {
    run.finished = true;
    input.setEnabled(false);
    showBanner('Vault reached', `Score ${run.score}  ·  press R to run again`);
  }
}

function render(): void {
  const snap = runner.snapshot;

  // Cross markers only earn their place on a bare surface; the rooftop
  // layer's gravel and parapets already convey speed.
  if (!hasRooftop) markers.update(snap.travelled);
  entityVisuals.update(runner.tracked, 1 / 60);

  const x = runner.lanes.renderX;
  player.object.position.x = x;

  // Camera trails the lane slightly, which reads as weight without taking
  // the next hazard out of frame.
  stage.camera.position.set(x * 0.3, 2.5, 5.2);
  stage.camera.lookAt(x * 0.12, 1.0, -6);
  stage.render();

  hud.setProgress(snap.progress);
  hud.setGifts(snap.giftsCollected, snap.giftsTotal);

  debug.set({
    fps: loop.stats.fps,
    steps: loop.stats.stepsLastFrame,
    dropped: loop.stats.droppedSteps,
    lane: `${snap.laneIndex + 1}/${LEVEL_1.laneCount}`,
    dist: `${snap.travelled.toFixed(0)}/${LEVEL_1.routeLength}`,
    gifts: `${snap.giftsCollected}/${snap.giftsTotal}`,
    hits: snap.incidents,
    invuln: snap.invulnerable ? 'yes' : 'no',
    score: run.score,
    player: `${playerSource}${clipCount ? ` (${clipCount} clips)` : ''}`,
    layers: environment ? environment.layers.map((l) => l.id).join(',') || 'none' : 'loading',
    draws: stage.drawCalls,
    tris: stage.triangles,
  });
}

const loop = new FixedLoop({ update, render });

// ---- banner (never blocks input) ---------------------------------------

function showBanner(title: string, note: string): void {
  pausePill.firstChild!.textContent = `${title} `;
  pauseNote.textContent = note;
  pausePill.hidden = false;
}

function hideBanner(): void {
  pausePill.hidden = true;
}

// ---- input -------------------------------------------------------------

const input = new InputRecogniser(surface);
input.onGesture((g) => {
  switch (g.type) {
    case 'swipe':
      runner.swipe(g.dir);
      break;
    case 'tap':
      // Tapping resumes from pause. Level 1 has no tap action of its own.
      if (lifecycle.isPaused) resume();
      break;
    case 'pauseToggle':
      if (lifecycle.isPaused) resume();
      else lifecycle.pause('user');
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
    if (!run.finished) showBanner('Paused', 'Tap or press P to resume');
  },
  onResumeRequested: () => {
    if (!run.finished) showBanner('Paused', 'Tap or press P to resume');
  },
  onOrientation: (isLandscape) => {
    rotatePrompt.hidden = !isLandscape;
  },
});
lifecycle.attach();

function resume(): void {
  for (const reason of lifecycle.pauseReasons) lifecycle.clear(reason);
  if (lifecycle.isPaused) return;
  hideBanner();
  input.setEnabled(true);
  if (!run.finished) loop.start();
}

/**
 * Rebuild the entity visuals against the current prop provider.
 *
 * Disposing first is what stops a replay — or a late prop load — from
 * accumulating meshes, which the doc calls out as a specific risk (§13).
 */
function rebuildEntities(): void {
  entityVisuals.dispose();
  entityVisuals = new EntityVisuals(LEVEL_1, runner.tracked, gameplayProps);
  world.add(entityVisuals.group);
}

function resetRun(): void {
  // The environment is independent of run state, so a replay keeps it rather
  // than rebuilding — which also means a replay cannot leak its meshes.
  // Rebuild the level cleanly rather than mutating it, so no resolved flag,
  // event or mesh survives into the next run.
  runner = new LevelRunner(LEVEL_1);
  runner.onEvent(onEvent);
  rebuildEntities();

  lastIncidents = 0;
  bellSwing = 0;
  player.setBlink(false);
  player.setLean(0);
  run.score = 0;
  run.events = [];
  run.finished = false;

  hud.setScore(0);
  hideBanner();
  input.setEnabled(true);
  loop.start();
}

pauseBtn.addEventListener('click', () => {
  pauseBtn.blur();
  if (lifecycle.isPaused) resume();
  else lifecycle.pause('user');
});

// ---- boot --------------------------------------------------------------

hud.setStage(1);
hud.setScore(0);
hud.setGifts(0, runner.snapshot.giftsTotal);
// ?clean hides the debug panel, so a review screenshot shows only what a
// player sees. The panel otherwise overlaps the character.
const params = new URLSearchParams(location.search);
debug.setVisible(!params.has('clean'));

/**
 * `?start=400` fast-forwards the run before play begins.
 *
 * A review affordance, like ?clean and ?layers. The vault only enters view in
 * the last 70 units, roughly a minute in, and nobody should have to play a
 * full route to look at the ending. The skip replays real simulation steps
 * rather than teleporting, so every event that would have fired still fires
 * and the run stays identical to one played through.
 */
const skipTo = Number(params.get('start') ?? 0);
if (skipTo > 0) {
  const limit = Math.min(skipTo, LEVEL_1.routeLength);
  let guard = 0;
  while (runner.snapshot.travelled < limit && guard++ < 60_000) {
    runner.update(STEP_S);
  }
  console.info(`[dev] skipped to ${runner.snapshot.travelled.toFixed(0)} units`);
}

const hint = document.getElementById('hint');
if (hint) hint.hidden = isTouchDevice();

loop.start();

// Build the environment without blocking play. ?layers= selects which parts
// render, so each can be reviewed alone: ?layers=sky, ?layers=none, etc.
void Environment.build(LEVEL_1, enabledLayers)
  .then((env) => {
    environment = env;
    world.add(env.object);
    const { triangles, materials } = env.measure();
    console.info(
      `[environment] ${env.layers.length} layers, ${triangles.toLocaleString()} triangles, ` +
        `${materials} materials`,
    );
  })
  .catch((e) => console.error('[environment] build failed', e));

/**
 * Gameplay assets, loaded without blocking play.
 *
 * The entities are rebuilt once the props arrive so the run starts instantly
 * on primitives and upgrades in place. Guards resolve to null on failure,
 * which costs the telegraph but not the encounter — the collider lives in
 * the runner and does not depend on any of this.
 */
void loadGameplayProps()
  .then((provider) => {
    gameplayProps = provider;
    rebuildEntities();
    console.info('[props] gameplay props ready');
  })
  .catch((e) => console.error('[props] load failed; keeping primitives', e));

// Load the real character without blocking play.
void loadRoguePlayer()
  .then(({ visual, clipCount: clips }) => {
    clipCount = clips;
    installPlayer(visual, 'rogue');
    console.info(`[player] Rogue installed with ${clips} clips`);
  })
  .catch((e) => {
    playerSource = 'capsule (rogue failed)';
    console.error('[player] Rogue load failed, keeping capsule:', e);
  });

void health().then((h) => {
  console.info('[health]', h);
});
