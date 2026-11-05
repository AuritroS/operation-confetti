/**
 * The combat cue contract.
 *
 * Plain data and phase arithmetic. No three.js, no DOM — this is the
 * simulation side, and `src/render/boss/effects.ts` only ever reads what is
 * produced here.
 *
 * The boundary matters more than it looks. `design-level3.md` requires that a
 * telegraph and the damage it predicts use the same committed target and the
 * same time bounds. If a cue animated on its own internal clock, the warning
 * and the strike could drift apart under frame-rate changes or a pause, and
 * the player would be hit by something that showed them the wrong lane. So a
 * view is handed `{ phase, progress }` and draws exactly that; it never counts
 * time for itself.
 *
 * Nothing here deals damage, scores, or tracks health. `runner.ts` owns all of
 * that and drives these objects; they only describe shape and timing.
 */

export type StrikePhase = 'warning' | 'strike' | 'recovery';

/**
 * Lane strike timings.
 *
 * `warning` sits above the design's 1.2s reaction floor. It is the one number
 * here that is a fairness guarantee rather than a presentation choice, so the
 * floor is asserted in tests rather than left as a comment.
 */
export const STRIKE_TIMING = {
  warning: 1.35,
  strike: 0.22,
  recovery: 0.55,
} as const;

export const WARNING_FLOOR_SECONDS = 1.2;

export interface StrikeSnapshot {
  readonly id: number;
  /** Committed when the strike is created and never reassigned. */
  readonly lane: number;
  readonly phase: StrikePhase;
  /** 0..1 within the current phase. */
  readonly progress: number;
}

/**
 * One lane strike, from warning through impact to recovery.
 *
 * `lane` is readonly and set at construction. That is deliberate: "no late
 * retargeting" is a correctness gate for this fight, and making it structurally
 * impossible is worth more than remembering not to do it.
 */
export class LaneStrike {
  private elapsed = 0;

  constructor(readonly id: number, readonly lane: number) {}

  advance(step: number): void {
    this.elapsed += step;
  }

  get finished(): boolean {
    return this.elapsed >= STRIKE_TIMING.warning + STRIKE_TIMING.strike + STRIKE_TIMING.recovery;
  }

  /** True only while the strike is actually in contact. */
  get contacting(): boolean {
    return this.elapsed >= STRIKE_TIMING.warning
      && this.elapsed < STRIKE_TIMING.warning + STRIKE_TIMING.strike;
  }

  get snapshot(): StrikeSnapshot {
    const { warning, strike } = STRIKE_TIMING;
    if (this.elapsed < warning) {
      return { id: this.id, lane: this.lane, phase: 'warning', progress: this.elapsed / warning };
    }
    if (this.elapsed < warning + strike) {
      return { id: this.id, lane: this.lane, phase: 'strike', progress: (this.elapsed - warning) / strike };
    }
    const recovered = (this.elapsed - warning - strike) / STRIKE_TIMING.recovery;
    return { id: this.id, lane: this.lane, phase: 'recovery', progress: Math.min(1, recovered) };
  }
}

export type ShieldPhase = 'up' | 'blocked' | 'down';

export const SHIELD_TIMING = { blocked: 0.34, drop: 0.3, raise: 0.4 } as const;

export interface ShieldSnapshot {
  readonly phase: ShieldPhase;
  /** 0..1 through a transient phase; always 1 while steady. */
  readonly progress: number;
}

/**
 * Her shield.
 *
 * `down` is the window the player can actually hurt her in, so it has to be
 * unmistakable rather than merely different — the view drops the dome AND
 * changes her lighting, because a player who misreads it wastes the only
 * opening the fight offers.
 */
export class Shield {
  private phase: ShieldPhase = 'up';
  private elapsed = 0;

  get snapshot(): ShieldSnapshot {
    const limit = this.phase === 'blocked' ? SHIELD_TIMING.blocked
      : this.phase === 'down' ? SHIELD_TIMING.drop
        : SHIELD_TIMING.raise;
    return { phase: this.phase, progress: Math.min(1, this.elapsed / limit) };
  }

  /** A blocked hit is a transient flash; it never changes whether she is open. */
  block(): void {
    if (this.phase !== 'up') return;
    this.phase = 'blocked';
    this.elapsed = 0;
  }

  setOpen(open: boolean): void {
    const next: ShieldPhase = open ? 'down' : 'up';
    if (this.phase === next) return;
    this.phase = next;
    this.elapsed = 0;
  }

  get open(): boolean {
    return this.phase === 'down';
  }

  advance(step: number): void {
    this.elapsed += step;
    if (this.phase === 'blocked' && this.elapsed >= SHIELD_TIMING.blocked) {
      this.phase = 'up';
      this.elapsed = SHIELD_TIMING.raise;
    }
  }
}

export interface OrbSnapshot {
  readonly id: number;
  /**
   * The committed lane, or `null` while the orb is still drifting.
   *
   * `null` is load-bearing: it is how the renderer knows not to draw a floor
   * marker yet. A marker under an uncommitted orb would be a warning that
   * later moves, which is the exact failure `LaneStrike` is built to prevent.
   */
  readonly lane: number | null;
  /** 0..1 from her stage to the player's line. */
  readonly progress: number;
  /** 0..1 ease from the drifting path onto the committed lane. */
  readonly lockProgress: number;
}

export const ORB_TRAVEL_SECONDS = 2.1;
/**
 * How long the orb drifts before it commits a lane.
 *
 * The remainder of its travel is the player's reaction window, so this number
 * and `ORB_TRAVEL_SECONDS` together have to leave at least the reaction floor:
 * 2.1 - 0.8 = 1.3 s. Asserted in tests, because it is a fairness guarantee
 * rather than a presentation choice.
 */
export const ORB_LOCK_SECONDS = 0.8;
/** How long the orb takes to swing onto the lane it just committed to. */
export const ORB_LOCK_BLEND_SECONDS = 0.28;
export const ORB_IMPACT_SECONDS = 0.42;

/**
 * A slow projectile that commits its lane late.
 *
 * The lane strike shows a floor marker and then lands on it. This is the other
 * half of the vocabulary: the flight itself is the warning, so the player
 * tracks a moving threat instead of reading a static mark. It leaves her
 * un-aimed, sweeps the deck, then locks a lane with `ORB_TRAVEL_SECONDS -
 * ORB_LOCK_SECONDS` left to run.
 *
 * The commitment still happens exactly once. `commit` throws on a second call,
 * so "no late retargeting" survives the fact that the target is now chosen
 * mid-flight rather than at construction.
 */
export class MagicOrbShot {
  private elapsed = 0;
  private committed: number | null = null;

  constructor(readonly id: number) {}

  advance(step: number): void {
    this.elapsed += step;
  }

  /** True on the first tick at or after the lock time, until `commit` is called. */
  get needsCommit(): boolean {
    return this.committed === null && this.elapsed >= ORB_LOCK_SECONDS;
  }

  commit(lane: number): void {
    if (this.committed !== null) {
      throw new Error(`orb ${this.id} already committed to lane ${this.committed}`);
    }
    this.committed = lane;
  }

  /** The committed lane, or `null` while still drifting. Never reassigned. */
  get lane(): number | null {
    return this.committed;
  }

  get finished(): boolean {
    return this.elapsed >= ORB_TRAVEL_SECONDS;
  }

  get snapshot(): OrbSnapshot {
    // Measured from the lock time rather than from whichever frame `commit`
    // happened to land on, so the swing is identical at any frame rate.
    const sinceLock = this.elapsed - ORB_LOCK_SECONDS;
    return {
      id: this.id,
      lane: this.committed,
      progress: Math.min(1, this.elapsed / ORB_TRAVEL_SECONDS),
      lockProgress: this.committed === null
        ? 0
        : Math.min(1, Math.max(0, sinceLock / ORB_LOCK_BLEND_SECONDS)),
    };
  }
}

export interface OrbImpactSnapshot {
  readonly id: number;
  readonly lane: number;
  /** 0..1 through a visible explosion after player contact. */
  readonly progress: number;
}

/** Once-only contact cue; it has no damage or collision authority. */
export class OrbImpact {
  private elapsed = 0;

  constructor(readonly id: number, readonly lane: number) {}

  advance(step: number): void { this.elapsed += step; }
  get finished(): boolean { return this.elapsed >= ORB_IMPACT_SECONDS; }
  get snapshot(): OrbImpactSnapshot {
    return { id: this.id, lane: this.lane, progress: Math.min(1, this.elapsed / ORB_IMPACT_SECONDS) };
  }
}

/**
 * `falling` is not collectible.
 *
 * Without it the gift was scored the instant Matthew entered its lane while
 * the renderer was still flying the model down the deck, so it read as being
 * dragged towards him. Separating arrival from availability makes the rule and
 * the picture share one clock: it lands, then you can take it.
 */
export type GiftPhase = 'falling' | 'idle' | 'taken' | 'expired';
// The cue harness matches the live fight's descent and pickup windows.
export const GIFT_TIMING = { fall: 0.7, life: 2.0, fade: 0.45 } as const;

export interface GiftSnapshot {
  readonly lane: number;
  readonly phase: GiftPhase;
  readonly progress: number;
}

/**
 * The confetti cannon's readiness.
 *
 * Both the HUD bar and the glow on the muzzle read this, so the precise
 * readout and the keep-your-eyes-forward cue can never disagree.
 */
export interface GunSnapshot {
  readonly ready: boolean;
  /** 0..1 through the current recharge; 1 when ready. */
  readonly progress: number;
  /** True while this is a blocked-shot lockout rather than a normal recharge. */
  readonly jammed: boolean;
}

export type CakePhase = 'held' | 'recovered' | 'escaped';
export const CAKE_TIMING = { recovered: 4, escaped: 3.4 } as const;

export interface CakeSnapshot {
  readonly phase: CakePhase;
  readonly progress: number;
}

/** Everything the renderer needs for one frame of combat presentation. */
export interface BossCues {
  readonly strikes: readonly StrikeSnapshot[];
  readonly orbs: readonly OrbSnapshot[];
  readonly orbImpacts: readonly OrbImpactSnapshot[];
  readonly shield: ShieldSnapshot;
  readonly gift: GiftSnapshot | null;
  readonly cake: CakeSnapshot;
  readonly gun: GunSnapshot;
  /**
   * Monotonic contact counters.
   *
   * The renderer plays a reaction when one of these changes, which makes a
   * hit a once-only event without the cue having to carry a list. They only
   * ever count up; they are never a health value.
   */
  readonly playerHitId: number;
  readonly bossHitId: number;
}

export const IDLE_CUES: BossCues = {
  strikes: [],
  orbs: [],
  orbImpacts: [],
  shield: { phase: 'up', progress: 1 },
  gift: null,
  cake: { phase: 'held', progress: 0 },
  gun: { ready: true, progress: 1, jammed: false },
  playerHitId: 0,
  bossHitId: 0,
};
