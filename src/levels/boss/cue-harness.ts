import {
  CAKE_TIMING, GIFT_TIMING, IDLE_CUES, LaneStrike, MagicOrbShot, OrbImpact, Shield,
  type BossCues, type CakePhase, type CakeSnapshot, type GiftPhase, type GiftSnapshot,
} from './telegraph';

/**
 * A hand driver for the combat cues, so they can be reviewed before any fight
 * exists to produce them.
 *
 * This is explicitly not the boss. It owns no health, deals no damage, scores
 * nothing and decides nothing — it advances cue clocks and hands out
 * snapshots, which is the same shape the real runner will hand over. Keeping
 * it in `levels/` rather than in the renderer is the point: it proves the
 * views work from data alone.
 */
export class CueHarness {
  private readonly strikes: LaneStrike[] = [];
  private readonly orbs: MagicOrbShot[] = [];
  private readonly orbImpacts: OrbImpact[] = [];
  private readonly shield = new Shield();
  private gift: { lane: number; phase: GiftPhase; elapsed: number } | null = null;
  private cake: { phase: CakePhase; elapsed: number } = { phase: 'held', elapsed: 0 };
  private nextId = 1;

  strike(lane: number): void {
    if (this.strikes.length >= 3) return;
    this.strikes.push(new LaneStrike(this.nextId++, lane));
  }

  orb(lane: number): void {
    if (this.orbs.length >= 3) return;
    const orb = new MagicOrbShot(this.nextId++);
    // The harness exists to look at one cue in isolation, so it hands the orb
    // its lane up front. A real fight lets the orb drift and commit late; see
    // `BossRunner.advanceOrb`.
    orb.commit(lane);
    this.orbs.push(orb);
  }

  toggleShield(): void {
    this.shield.setOpen(!this.shield.open);
  }

  blockShot(): void {
    this.shield.block();
  }

  spawnGift(lane: number): void {
    this.gift = { lane, phase: 'falling', elapsed: 0 };
  }

  takeGift(): void {
    if (this.gift?.phase === 'idle') this.gift = { ...this.gift, phase: 'taken', elapsed: 0 };
  }

  endCake(phase: CakePhase): void {
    this.strikes.length = 0;
    this.orbs.length = 0;
    this.orbImpacts.length = 0;
    this.gift = null;
    this.cake = { phase, elapsed: 0 };
  }

  reset(): void {
    this.strikes.length = 0;
    this.orbs.length = 0;
    this.orbImpacts.length = 0;
    this.shield.setOpen(false);
    this.gift = null;
    this.cake = { phase: 'held', elapsed: 0 };
  }

  get shieldOpen(): boolean {
    return this.shield.open;
  }

  advance(step: number, playerLane = 1): BossCues {
    for (const impact of this.orbImpacts) impact.advance(step);
    for (let i = this.orbImpacts.length - 1; i >= 0; i--) {
      if (this.orbImpacts[i]!.finished) this.orbImpacts.splice(i, 1);
    }
    for (const strike of this.strikes) strike.advance(step);
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      if (this.strikes[i]!.finished) this.strikes.splice(i, 1);
    }
    for (const orb of this.orbs) orb.advance(step);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      if (this.orbs[i]!.finished) {
        const orb = this.orbs[i]!;
        if (orb.lane === playerLane) this.orbImpacts.push(new OrbImpact(orb.id, orb.lane));
        this.orbs.splice(i, 1);
      }
    }
    this.shield.advance(step);

    let gift: GiftSnapshot | null = null;
    if (this.gift) {
      this.gift.elapsed += step;
      if (this.gift.phase === 'falling' && this.gift.elapsed >= GIFT_TIMING.fall) {
        this.gift = { ...this.gift, phase: 'idle', elapsed: 0 };
      } else if (this.gift.phase === 'idle' && this.gift.elapsed >= GIFT_TIMING.life) {
        this.gift = { ...this.gift, phase: 'expired', elapsed: 0 };
      }
      const limit = this.gift.phase === 'falling' ? GIFT_TIMING.fall
        : this.gift.phase === 'idle' ? GIFT_TIMING.life : GIFT_TIMING.fade;
      gift = {
        lane: this.gift.lane,
        phase: this.gift.phase,
        progress: Math.min(1, this.gift.elapsed / limit),
      };
      if ((this.gift.phase === 'taken' || this.gift.phase === 'expired')
        && this.gift.elapsed >= GIFT_TIMING.fade) this.gift = null;
    }

    this.cake.elapsed += step;
    const cakeLimit = this.cake.phase === 'recovered' ? CAKE_TIMING.recovered : CAKE_TIMING.escaped;
    const cake: CakeSnapshot = {
      phase: this.cake.phase,
      progress: this.cake.phase === 'held' ? 0 : Math.min(1, this.cake.elapsed / cakeLimit),
    };

    return {
      ...IDLE_CUES,
      strikes: this.strikes.map((s) => s.snapshot),
      orbs: this.orbs.map((o) => o.snapshot),
      orbImpacts: this.orbImpacts.map((impact) => impact.snapshot),
      shield: this.shield.snapshot,
      gift,
      cake,
    };
  }
}
