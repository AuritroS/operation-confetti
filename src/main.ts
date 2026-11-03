/**
 * Phase 0 vertical slice (design doc §12).
 *
 * Proves the environment end to end: portrait frame with safe areas, a
 * non-scrolling gameplay surface, the gesture recogniser, the fixed-step loop,
 * pause/resume on focus loss and rotation, and a live API round trip.
 *
 * Deliberately primitives only. No level content yet.
 */
import { BoxGeometry, CapsuleGeometry, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { FixedLoop } from './core/loop';
import { InputRecogniser } from './core/input';
import { LaneRunner } from './core/lanes';
import { Lifecycle } from './core/lifecycle';
import { Stage } from './render/stage';
import { DebugPanel, Hud, Overlay } from './ui/hud';
import { health } from './net/scoreClient';

const LANE_COUNT = 3;
const LANE_WIDTH = 1.6;
const ROUTE_LENGTH = 90;
const FORWARD_SPEED = 7.5;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const surface = document.getElementById('surface') as HTMLElement;
const rotatePrompt = document.getElementById('rotate') as HTMLElement;
const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;

const stage = new Stage(canvas);
stage.observe();

const hud = new Hud();
const overlay = new Overlay();
const debug = new DebugPanel();
const lanes = new LaneRunner(LANE_COUNT, LANE_WIDTH);

// ---- primitive scene ---------------------------------------------------

const ground = new Mesh(
  new PlaneGeometry(LANE_WIDTH * LANE_COUNT, ROUTE_LENGTH + 40),
  new MeshStandardMaterial({ color: 0x27354f, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -ROUTE_LENGTH / 2;
stage.scene.add(ground);

// Lane dividers make the swipe result legible without any art.
for (let i = 0; i <= LANE_COUNT; i++) {
  const stripe = new Mesh(
    new PlaneGeometry(0.05, ROUTE_LENGTH + 40),
    new MeshStandardMaterial({ color: 0x3c4e73, roughness: 1 }),
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set((i - LANE_COUNT / 2) * LANE_WIDTH, 0.01, -ROUTE_LENGTH / 2);
  stage.scene.add(stripe);
}

const player = new Mesh(
  new CapsuleGeometry(0.33, 0.72, 6, 12),
  new MeshStandardMaterial({ color: 0x4da3ff, roughness: 0.5 }),
);
player.position.set(0, 0.69, 0);
stage.scene.add(player);

// Markers every 10 units give an unmistakable read on forward travel speed.
const markers: Mesh[] = [];
for (let z = -10; z > -ROUTE_LENGTH; z -= 10) {
  const m = new Mesh(
    new BoxGeometry(LANE_WIDTH * LANE_COUNT, 0.08, 0.25),
    new MeshStandardMaterial({ color: 0xffc54d, roughness: 0.6 }),
  );
  m.position.set(0, 0.04, z);
  stage.scene.add(m);
  markers.push(m);
}

// ---- simulation state --------------------------------------------------

const state = {
  distance: 0,
  swipes: 0,
  taps: 0,
  holds: 0,
  finished: false,
};

function update(step: number): void {
  if (state.finished) return;

  state.distance = Math.min(state.distance + FORWARD_SPEED * step, ROUTE_LENGTH);
  lanes.update(step);

  if (state.distance >= ROUTE_LENGTH) {
    state.finished = true;
    loop.stop();
    input.setEnabled(false);
    overlay.show(
      'Route complete',
      `Phase 0 slice finished. ${state.swipes} swipes, ${state.taps} taps.`,
      'Run again',
      resetRun,
    );
  }
}

function render(): void {
  player.position.x = lanes.renderX;
  // Travel the world past a stationary player so the camera stays fixed.
  ground.position.z = -ROUTE_LENGTH / 2 + state.distance;
  for (const [i, m] of markers.entries()) m.position.z = -10 - i * 10 + state.distance;

  stage.camera.position.set(lanes.renderX * 0.25, 2.5, 5.2);
  stage.camera.lookAt(lanes.renderX * 0.1, 1.0, -5);
  stage.render();

  hud.setProgress(state.distance / ROUTE_LENGTH);
  debug.set({
    fps: loop.stats.fps,
    steps: loop.stats.stepsLastFrame,
    dropped: loop.stats.droppedSteps,
    lane: `${lanes.laneIndex + 1}/${LANE_COUNT}`,
    dist: state.distance.toFixed(1),
    gestures: `s${state.swipes} t${state.taps} h${state.holds}`,
    draws: stage.drawCalls,
    tris: stage.triangles,
    dpr: stage.renderer.getPixelRatio().toFixed(2),
  });
}

const loop = new FixedLoop({ update, render });

// ---- input -------------------------------------------------------------

const input = new InputRecogniser(surface);
input.onGesture((g) => {
  switch (g.type) {
    case 'swipe':
      state.swipes++;
      lanes.swipe(g.dir);
      hud.setScore(state.swipes * 10);
      break;
    case 'tap':
      state.taps++;
      player.material.color.setHex(0xffc54d);
      setTimeout(() => player.material.color.setHex(0x4da3ff), 90);
      break;
    case 'holdStart':
      state.holds++;
      break;
    default:
      break;
  }
});
input.attach();

// ---- lifecycle ---------------------------------------------------------

const lifecycle = new Lifecycle({
  onPause: (reason) => {
    loop.stop();
    input.setEnabled(false);
    input.clearHeld();
    if (reason !== 'orientation' && !state.finished) {
      overlay.show('Paused', pauseCopy(reason), 'Resume', resumeFromOverlay);
    }
  },
  onResumeRequested: () => {
    // Resume is explicit. Rotating back still requires the Resume button.
    if (state.finished) return;
    if (!overlay.isVisible) overlay.show('Paused', 'Ready when you are.', 'Resume', resumeFromOverlay);
  },
  onOrientation: (isLandscape) => {
    rotatePrompt.hidden = !isLandscape;
  },
});
lifecycle.attach();

function pauseCopy(reason: string): string {
  return reason === 'hidden'
    ? 'The game paused while the tab was in the background.'
    : 'The game paused because the window lost focus.';
}

function resumeFromOverlay(): void {
  // Held inputs were cleared on pause, so a fresh gesture is required.
  input.setEnabled(true);
  if (!state.finished) loop.start();
}

function resetRun(): void {
  state.distance = 0;
  state.swipes = 0;
  state.taps = 0;
  state.holds = 0;
  state.finished = false;
  lanes.reset();
  hud.setScore(0);
  input.setEnabled(true);
  loop.start();
}

pauseBtn.addEventListener('click', () => {
  if (lifecycle.isPaused) lifecycle.clear('user');
  else lifecycle.pause('user');
});

// ---- boot --------------------------------------------------------------

hud.setStage(0);
hud.setScore(0);
hud.setGifts(0, 4);
debug.setVisible(true);

loop.start();

// End-to-end check that the Worker and Supabase are reachable from the page.
void health().then((h) => {
  const el = document.getElementById('hud-stage');
  if (el) el.textContent = h.ok && h.db ? 'api ok' : h.ok ? 'db down' : 'no api';
  console.info('[health]', h);
});
