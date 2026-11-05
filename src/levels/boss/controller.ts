import type { LevelContext, LevelController, LevelOutcome } from '../../core/level';
import type { RunEvent } from '../../core/scoring';
import { BossScene } from '../../render/boss/scene';
import { BossRunner } from './runner';
import type { BossCues } from './telegraph';

/**
 * What any HUD needs from the boss fight, as plain data.
 *
 * The seam that lets level 3 drop its bespoke readouts later: the shared HUD
 * and the standalone dev page render the same snapshot, so unifying them is a
 * presentation swap rather than a rewrite. Nothing here is live state — it is
 * copied per read, so a HUD cannot accidentally hold a reference into the
 * simulation and mutate it.
 */
export interface BossSnapshot {
  readonly state: 'practice' | 'playing' | 'victory' | 'defeat';
  readonly beat: 'attack' | 'exposed' | 'gap';
  readonly phase: string;
  readonly playerHp: number;
  readonly bossHp: number;
  readonly lane: number;
  readonly attackKind: 'strike' | 'double' | 'orb' | null;
  readonly markedLanes: readonly number[];
  readonly gun: BossCues['gun'];
  readonly cake: BossCues['cake'];
  /** Local mirror of the score. The campaign's figure comes from `scoreRun`. */
  readonly score: number;
  readonly shotCount: number;
  readonly hitCount: number;
}

/**
 * Level 3 as a mountable level.
 *
 * It owns the boss simulation and its scene, and nothing else — no DOM, no
 * loop, no renderer, no score of record. Events go outward through
 * `ctx.emit`; the shell reduces them with `scoreRun`, which is the figure that
 * counts. The runner keeps its own mirror because its tests assert the two
 * agree, and that agreement is the thing worth testing.
 */
export class BossLevel implements LevelController {
  readonly runner = new BossRunner();
  private view: BossScene | null = null;
  private ctx: LevelContext | null = null;
  /** How many of the runner's events have been forwarded to the shell. */
  private forwarded = 0;
  result: LevelOutcome | null = null;

  /**
   * Debug-only telegraph substitution for the `?debug` cue harness.
   *
   * Review tooling drives the cue vocabulary by hand before a fight produces
   * it. It awards nothing and moves no health, and it is never set in a
   * campaign run.
   */
  cueOverride: (() => BossCues | null) | null = null;

  /**
   * Wire the context without building a scene.
   *
   * `mount` does this and then builds the scene, which needs WebGL. Exposed
   * separately so the parts worth testing — event forwarding, once-only
   * emission, and when the level reports it has ended — can be driven
   * headlessly, where no renderer exists.
   */
  attach(ctx: LevelContext): void {
    this.ctx = ctx;
  }

  async mount(ctx: LevelContext): Promise<void> {
    this.attach(ctx);
    this.view = new BossScene(ctx.host);
    await this.view.load();
  }

  /** Leave the protected practice state and begin scored combat. */
  startFight(): void {
    this.runner.startFight();
    this.view?.reset();
  }

  swipe(dir: -1 | 1): boolean { return this.runner.swipe(dir); }
  fire(): boolean { return this.runner.fire(); }

  /** Return to practice, discarding the attempt. The shell re-emits nothing. */
  restart(): void {
    this.runner.reset();
    this.view?.reset();
    this.forwarded = 0;
    this.result = null;
  }

  update(step: number): void {
    this.runner.update(step);
    this.drain();

    const cues = (this.ctx?.debug && this.runner.state === 'practice'
      ? this.cueOverride?.() : null) ?? this.runner.cues;
    this.view?.update(this.runner.practice, step, cues, this.runner.state === 'practice');

    // The fight is over when the ending choreography has finished, not when
    // the last point of health goes: the shell transitions on `result`, and
    // cutting away mid-ending would eat the cake recovery.
    if (this.result === null && this.runner.cues.cake.progress >= 1) {
      if (this.runner.state === 'victory') this.result = 'complete';
      else if (this.runner.state === 'defeat') this.result = 'defeated';
    }
  }

  render(): void {
    this.view?.render();
  }

  /** Forward anything the simulation has recorded since the last tick. */
  private drain(): void {
    const events: readonly RunEvent[] = this.runner.events;
    for (; this.forwarded < events.length; this.forwarded++) {
      this.ctx?.emit(events[this.forwarded]!);
    }
  }

  get snapshot(): BossSnapshot {
    const runner = this.runner;
    const cues = runner.cues;
    return {
      state: runner.state,
      beat: runner.beat,
      phase: runner.phase,
      playerHp: runner.playerHp,
      bossHp: runner.bossHp,
      lane: runner.lane,
      attackKind: runner.attackKind,
      markedLanes: runner.markedLanes,
      gun: cues.gun,
      cake: cues.cake,
      score: runner.score,
      shotCount: runner.practice.shotCount,
      hitCount: runner.practice.hitCount,
    };
  }

  get drawCalls(): number { return this.view?.drawCalls ?? 0; }
  get triangles(): number { return this.view?.triangles ?? 0; }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
    this.ctx = null;
  }
}
