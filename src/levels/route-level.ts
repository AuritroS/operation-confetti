import { Group } from 'three';
import type { LevelContext, LevelController, LevelOutcome } from '../core/level';
import { STEP_S } from '../core/loop';
import { LevelRunner } from './runner';
import { LEVEL_1 } from './level1';
import { Stage } from '../render/stage';
import { LOOK } from '../render/look';
import { buildRoute, makeCapsulePlayer, RouteMarkers, type PlayerVisual } from '../render/primitives';
import { EntityVisuals } from '../render/entities';
import { loadGameplayProps, type PropProvider } from '../render/props-loader';
import { buildVaultDoor } from '../render/custom';
import { loadRoguePlayer } from '../render/rogue';
import { Environment, requestedLayers } from '../render/environment';

/** What a HUD or debug panel needs from the route, as plain data. */
export interface RouteSnapshot {
  readonly laneIndex: number;
  readonly lanes: number;
  readonly travelled: number;
  readonly routeLength: number;
  readonly progress: number;
  readonly speed: number;
  readonly giftsCollected: number;
  readonly giftsTotal: number;
  readonly incidents: number;
  readonly invulnerable: boolean;
  readonly playerSource: string;
  readonly clipCount: number;
  readonly layers: string;
}

/**
 * Level 1 as a mountable level.
 *
 * Everything that used to be module-level state in `main.ts` lives here, so a
 * replay rebuilds a level instead of mutating one and the campaign can unmount
 * it to put a story panel on screen. It owns the route simulation and its
 * scene and nothing else: no DOM, no loop, no HUD, no score.
 *
 * Assets load without blocking. The run starts on primitives and upgrades in
 * place when props and the real character arrive, so a slow or failed load
 * leaves a playable level rather than an empty one.
 */
export class RouteLevel implements LevelController {
  readonly stage: Stage;
  private readonly world = new Group();
  private readonly enabledLayers = requestedLayers();
  private readonly hasRooftop: boolean;
  private readonly markers = new RouteMarkers(LEVEL_1);
  /**
   * The route's end, built to the same proportions level 2 finishes on.
   *
   * It used to span only the lanes at 4.8 by 3.6, which left the disc and
   * its mask too small to read and the rooftop visible either side of it.
   * Wider than the parapets and tall enough to block the route end, so the
   * emblem dominates the frame the way level 2's does.
   */
  private readonly vault = buildVaultDoor(12, 9);

  private runner = new LevelRunner(LEVEL_1);
  private entityVisuals: EntityVisuals;
  private environment: Environment | null = null;
  private gameplayProps: PropProvider = () => null;
  private player: PlayerVisual = makeCapsulePlayer();
  private playerSource = 'capsule';
  private clipCount = 0;
  private ctx: LevelContext | null = null;

  /** Rises when the runner reports a collision, which drives hit feedback. */
  private lastIncidents = 0;
  /** Time since the last collision, for the short red tint reaction. */
  private hitAge = 100;

  result: LevelOutcome | null = null;

  constructor(host: LevelContext['host']) {
    this.stage = new Stage(host);
    host.setExposure(LOOK.route.exposure);
    this.hasRooftop = this.enabledLayers.has('rooftop');
    this.stage.scene.add(this.world);

    // Hidden until the route end comes into range; `update` reveals it.
    this.vault.visible = false;
    this.vault.position.set(0, 0, -LEVEL_1.routeLength);
    this.world.add(this.vault);
    if (!this.hasRooftop) this.world.add(this.markers.group);
    this.world.add(buildRoute(LEVEL_1, { surface: !this.hasRooftop, dimDividers: this.hasRooftop }));

    this.entityVisuals = new EntityVisuals(LEVEL_1, this.runner.tracked, this.gameplayProps);
    this.world.add(this.entityVisuals.group);
    this.world.add(this.player.object);
  }

  async mount(ctx: LevelContext): Promise<void> {
    this.ctx = ctx;
    this.runner.onEvent((event) => ctx.emit(event));

    // None of these block play. `?layers=` selects which environment parts
    // render so each can be reviewed alone.
    void Environment.build(LEVEL_1, this.enabledLayers)
      .then((env) => { this.environment = env; this.world.add(env.object); })
      .catch((e: unknown) => console.error('[environment] build failed', e));

    void loadGameplayProps()
      .then((provider) => { this.gameplayProps = provider; this.rebuildEntities(); })
      .catch((e: unknown) => console.error('[props] load failed; keeping primitives', e));

    void loadRoguePlayer()
      .then(({ visual, clipCount }) => {
        this.clipCount = clipCount;
        this.installPlayer(visual, 'rogue');
      })
      .catch((e: unknown) => {
        this.playerSource = 'capsule (rogue failed)';
        console.error('[player] Rogue load failed, keeping capsule:', e);
      });
  }

  swipe(dir: -1 | 1): void { this.runner.swipe(dir); }

  /**
   * Replay the route from the start.
   *
   * The runner is rebuilt rather than reset so no resolved flag, event or mesh
   * survives into the next run. The environment is independent of run state,
   * so it is kept — which is also what stops a replay leaking its meshes.
   */
  restart(): void {
    this.runner = new LevelRunner(LEVEL_1);
    if (this.ctx) {
      const ctx = this.ctx;
      this.runner.onEvent((event) => ctx.emit(event));
    }
    this.rebuildEntities();
    this.lastIncidents = 0;
    this.hitAge = 100;
    this.player.setHitFlash(false);
    this.player.setBlink(false);
    this.player.setLean(0);
    this.result = null;
  }

  /**
   * Fast-forward before play begins — a review affordance behind `?start=`.
   *
   * It replays real simulation steps rather than teleporting, so every event
   * that would have fired still fires and the run stays identical to one
   * played through.
   */
  fastForward(units: number): number {
    const limit = Math.min(units, LEVEL_1.routeLength);
    let guard = 0;
    while (this.runner.snapshot.travelled < limit && guard++ < 60_000) {
      this.runner.update(STEP_S);
    }
    return this.runner.snapshot.travelled;
  }

  update(step: number): void {
    if (this.result !== null) {
      // Keep animating after the run ends, or the celebration never plays and
      // Matthew freezes mid-stride at the vault.
      this.player.update(step, false);
      this.environment?.update(this.runner.snapshot.travelled, step);
      return;
    }

    this.runner.update(step);
    const snap = this.runner.snapshot;
    this.environment?.update(snap.travelled, step);

    this.hitAge += step;
    if (this.player.setHitTint) this.player.setHitTint(this.hitAge);
    else this.player.setHitFlash(this.hitAge < 0.25);
    // Bank into the lane change; there is no strafe clip to play instead.
    this.player.setLean(this.runner.lanes.lean);
    this.player.setBlink(false);
    this.player.setDimmed(false);
    this.player.update(step, true);

    // The vault grows out of the fog as the route ends, so the run has a
    // visible goal rather than just a progress bar.
    this.vault.position.z = -(LEVEL_1.routeLength - snap.travelled);
    this.vault.visible = LEVEL_1.routeLength - snap.travelled < 70;

    if (snap.incidents > this.lastIncidents) {
      this.lastIncidents = snap.incidents;
      this.hitAge = 0;
    }

    if (snap.complete) {
      this.result = 'complete';
      this.player.setBlink(false);
      this.player.celebrate();
    }
  }

  render(): void {
    const snap = this.runner.snapshot;
    // Cross markers only earn their place on a bare surface; the rooftop
    // layer's gravel and parapets already convey speed.
    if (!this.hasRooftop) this.markers.update(snap.travelled);
    this.entityVisuals.update(this.runner.tracked, STEP_S);

    const x = this.runner.lanes.renderX;
    this.player.object.position.x = x;
    // Camera trails the lane slightly, which reads as weight without taking
    // the next hazard out of frame.
    this.stage.camera.position.set(x * 0.3, 2.5, 5.2);
    this.stage.camera.lookAt(x * 0.12, 1.0, -6);
    this.stage.render();
  }

  get snapshot(): RouteSnapshot {
    const snap = this.runner.snapshot;
    return {
      laneIndex: snap.laneIndex,
      lanes: LEVEL_1.laneCount,
      travelled: snap.travelled,
      routeLength: LEVEL_1.routeLength,
      progress: snap.progress,
      speed: this.runner.speed,
      giftsCollected: snap.giftsCollected,
      giftsTotal: snap.giftsTotal,
      incidents: snap.incidents,
      invulnerable: snap.invulnerable,
      playerSource: this.playerSource,
      clipCount: this.clipCount,
      layers: this.environment
        ? this.environment.layers.map((l) => l.id).join(',') || 'none'
        : 'loading',
    };
  }

  get drawCalls(): number { return this.stage.drawCalls; }
  get triangles(): number { return this.stage.triangles; }

  /**
   * Rebuild entity visuals against the current prop provider.
   *
   * Disposing first is what stops a replay — or a late prop load — from
   * accumulating meshes, which the design doc calls out as a specific risk.
   */
  private rebuildEntities(): void {
    this.entityVisuals.dispose();
    this.entityVisuals = new EntityVisuals(LEVEL_1, this.runner.tracked, this.gameplayProps);
    this.world.add(this.entityVisuals.group);
  }

  private installPlayer(next: PlayerVisual, source: string): void {
    this.world.remove(this.player.object);
    this.player.dispose?.();
    this.player = next;
    this.playerSource = source;
    this.world.add(next.object);
  }

  dispose(): void {
    this.entityVisuals.dispose();
    this.player.dispose?.();
    this.environment?.dispose?.();
    this.stage.dispose();
    this.world.clear();
    this.ctx = null;
  }
}
