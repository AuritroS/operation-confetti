import { POINTS, type RunEvent } from '../../core/scoring';
import { BOSS_RULES } from './config';
import { BossPractice } from './practice';
import {
  beatForPhase, markedLanesForDouble, phaseForHp, safeLaneForDouble,
  type AttackKind, type PhaseSpec,
} from './patterns';
import {
  CAKE_TIMING, GIFT_TIMING, IDLE_CUES, LaneStrike, MagicOrbShot, OrbImpact, Shield,
  type BossCues, type CakePhase, type GiftPhase,
} from './telegraph';

export type BossState = 'practice' | 'playing' | 'victory' | 'defeat';
export type BossBeat = 'attack' | 'exposed' | 'gap';
type Attack =
  | { kind: 'strike' | 'double'; strikes: LaneStrike[] }
  | { kind: 'orb'; orb: MagicOrbShot };
type Gift = { lane: number; phase: GiftPhase; elapsed: number };

/**
 * Local boss simulation. It owns damage, score and attack clocks. The scene
 * receives cue snapshots and cannot change a collision or open the shield.
 *
 * The shape of a fight: a *beat* runs one or more attacks back to back, then
 * her shield drops for `exposedSeconds` (the only window the player can damage
 * her in), then a short gap, then the next beat. `patterns.ts` decides which
 * attacks a beat contains, re-read at every beat so damage escalates her
 * immediately. Attacks inside a beat are strictly sequential, so there is only
 * ever one live commitment and always a reachable escape.
 */
export class BossRunner {
  readonly practice = new BossPractice();
  private shield = new Shield();
  private attack: Attack | null = null;
  private queue: AttackKind[] = [];
  private readonly orbImpacts: OrbImpact[] = [];
  private gift: Gift | null = null;
  private nextAttackId = 1;
  private nextGiftIndex = 0;
  private beatIndex = 0;
  private windowIndex = 0;
  private gapSeconds = 0;
  private beatElapsed = 0;
  private attackResolved = false;
  private lastHitCount = 0;
  private protection = 0;
  private cakeElapsed = 0;
  private phaseId = 'opening';
  private playerHits = 0;
  private bossHits = 0;
  private readonly eventLog: RunEvent[] = [];

  state: BossState = 'practice';
  beat: BossBeat = 'attack';
  playerHp: number = BOSS_RULES.playerHp;
  bossHp: number = BOSS_RULES.bossHp;
  score = 0;

  get lane(): number { return this.practice.lane; }
  get cooldownLeft(): number { return this.practice.cooldownLeft; }
  get protectedSeconds(): number { return this.protection; }
  get events(): readonly RunEvent[] { return this.eventLog; }
  get attackKind(): AttackKind | null { return this.attack?.kind ?? null; }
  get phase(): string { return this.phaseId; }

  /**
   * Lanes that will hurt Matthew if he is standing in one at contact.
   *
   * Empty while an orb is still drifting — it has no target yet, and
   * reporting a guess here is exactly the late-retargeting failure the cue
   * contract forbids.
   */
  get markedLanes(): readonly number[] {
    const attack = this.attack;
    if (!attack) return [];
    if (attack.kind === 'orb') {
      return attack.orb.lane === null ? [] : [attack.orb.lane];
    }
    return attack.strikes.map((strike) => strike.lane);
  }

  /** True when Matthew is standing somewhere an active attack will land. */
  get inDanger(): boolean {
    return this.markedLanes.includes(this.practice.lane);
  }

  swipe(dir: -1 | 1): boolean {
    if (this.state !== 'practice' && this.state !== 'playing') return false;
    return this.practice.swipe(dir);
  }

  fire(): boolean {
    if (this.state !== 'practice' && this.state !== 'playing') return false;
    return this.practice.fire();
  }

  startFight(): void {
    if (this.state !== 'practice') return;
    this.practice.reset();
    this.lastHitCount = 0;
    this.state = 'playing';
    this.beginBeat();
  }

  reset(): void {
    this.practice.reset();
    this.shield = new Shield();
    this.attack = null;
    this.queue = [];
    this.orbImpacts.length = 0;
    this.gift = null;
    this.nextAttackId = 1;
    this.nextGiftIndex = 0;
    this.beatIndex = 0;
    this.windowIndex = 0;
    this.gapSeconds = 0;
    this.beatElapsed = 0;
    this.attackResolved = false;
    this.lastHitCount = 0;
    this.protection = 0;
    this.cakeElapsed = 0;
    this.phaseId = 'opening';
    this.playerHits = 0;
    this.bossHits = 0;
    this.eventLog.length = 0;
    this.state = 'practice';
    this.beat = 'attack';
    this.playerHp = BOSS_RULES.playerHp;
    this.bossHp = BOSS_RULES.bossHp;
    this.score = 0;
  }

  update(step: number): void {
    if (!Number.isFinite(step) || step <= 0) return;
    // The controller normally calls this at 60 Hz. Substeps also make a
    // delayed frame cross an impact boundary exactly once.
    for (let left = step; left > 1e-9;) {
      const dt = Math.min(left, 1 / 60);
      this.tick(dt);
      left -= dt;
    }
  }

  private tick(step: number): void {
    for (const impact of this.orbImpacts) impact.advance(step);
    for (let i = this.orbImpacts.length - 1; i >= 0; i--) {
      if (this.orbImpacts[i]!.finished) this.orbImpacts.splice(i, 1);
    }
    if (this.state === 'victory' || this.state === 'defeat') {
      this.cakeElapsed += step;
      return;
    }
    this.practice.update(step);
    if (this.state === 'practice') return;

    this.protection = Math.max(0, this.protection - step);
    this.shield.advance(step);

    // Player shots resolve first. A killing shot cancels all remaining damage
    // in this tick, including an enemy strike reaching Matthew at the same time.
    const arrivals = this.practice.hitCount - this.lastHitCount;
    this.lastHitCount = this.practice.hitCount;
    for (let i = 0; i < arrivals; i++) {
      if (!this.shield.open) {
        this.shield.block();
        // The block is only known now, at arrival. Jamming here ties the
        // penalty to the moment the player actually sees it bounce off.
        this.practice.jam(BOSS_RULES.blockedLockoutSeconds);
        continue;
      }
      const removed = Math.min(BOSS_RULES.shotDamage, this.bossHp);
      this.bossHp -= removed;
      this.bossHits++;
      this.score += removed * POINTS.perBossHp;
      this.eventLog.push({ t: 'bossDamage', amount: removed });
      if (this.bossHp === 0) { this.finish('victory'); return; }
    }

    this.advanceAttack(step);
    if (this.state !== 'playing') return;
    this.advanceGift(step);
  }

  /** Start a beat, re-reading the phase so damage escalates her at once. */
  private beginBeat(): void {
    const phase: PhaseSpec = phaseForHp(this.bossHp);
    this.phaseId = phase.id;
    this.gapSeconds = phase.gapSeconds;
    this.queue = [...beatForPhase(phase, this.beatIndex).attacks];
    this.beat = 'attack';
    this.beatElapsed = 0;
    this.shield.setOpen(false);
    this.beginNextAttack();
  }

  /** Commit the next attack in the beat. Returns false when the beat is spent. */
  private beginNextAttack(): boolean {
    const kind = this.queue.shift();
    if (!kind) { this.attack = null; return false; }
    const lane = this.practice.lane;
    if (kind === 'orb') {
      // No lane yet: an orb chooses its target partway down the deck.
      this.attack = { kind, orb: new MagicOrbShot(this.nextAttackId++) };
    } else if (kind === 'strike') {
      this.attack = { kind, strikes: [new LaneStrike(this.nextAttackId++, lane)] };
    } else {
      const safe = safeLaneForDouble(lane, this.beatIndex);
      this.attack = {
        kind,
        strikes: markedLanesForDouble(safe).map((marked) => new LaneStrike(this.nextAttackId++, marked)),
      };
    }
    this.attackResolved = false;
    return true;
  }

  private advanceAttack(step: number): void {
    this.beatElapsed += step;
    if (this.beat === 'attack') {
      const attack = this.attack;
      if (!attack) { this.openWindow(); return; }
      if (attack.kind === 'orb') this.advanceOrb(attack.orb, step);
      else this.advanceStrikes(attack.strikes, step);
      return;
    }
    if (this.beat === 'exposed' && this.beatElapsed >= BOSS_RULES.exposedSeconds) {
      this.shield.setOpen(false);
      this.beat = 'gap';
      this.beatElapsed = 0;
    } else if (this.beat === 'gap' && this.beatElapsed >= this.gapSeconds) {
      this.beatIndex++;
      this.beginBeat();
    }
  }

  private advanceOrb(orb: MagicOrbShot, step: number): void {
    orb.advance(step);
    // Commit to wherever Matthew stands at the lock time, then never again.
    // `commit` throws on a second call, so this cannot silently retarget.
    if (orb.needsCommit) orb.commit(this.practice.lane);
    if (orb.finished && !this.attackResolved) {
      this.attackResolved = true;
      const lane = orb.lane;
      // An orb that somehow reached the end uncommitted deals nothing rather
      // than guessing a lane.
      if (lane !== null) {
        if (lane === this.practice.lane) this.orbImpacts.push(new OrbImpact(orb.id, lane));
        this.hitPlayer(lane);
        if (this.state !== 'playing') return;
      }
    }
    if (orb.finished) this.endAttack();
  }

  private advanceStrikes(strikes: LaneStrike[], step: number): void {
    for (const strike of strikes) strike.advance(step);
    // Every strike in a double shares one set of timings, so contact and the
    // single hit it can cause resolve together.
    if (strikes.some((strike) => strike.contacting) && !this.attackResolved) {
      this.attackResolved = true;
      for (const strike of strikes) {
        this.hitPlayer(strike.lane);
        if (this.state !== 'playing') return;
      }
    }
    if (strikes.every((strike) => strike.finished)) this.endAttack();
  }

  /** Chain into the next attack of this beat, or open her shield. */
  private endAttack(): void {
    this.attack = null;
    if (this.beginNextAttack()) return;
    this.openWindow();
  }

  private openWindow(): void {
    this.beat = 'exposed';
    this.beatElapsed = 0;
    this.shield.setOpen(true);
    // Gifts are anchored to exposed windows, not to a wall clock.
    //
    // This is what makes the 1,100 maximum actually reachable. On a timer, a
    // player who killed her efficiently finished before the fourth gift had
    // spawned, so playing well cost 100 points and the advertised maximum
    // needed deliberate stalling. Even six-hit windows take four of them to
    // remove 100 HP, so hanging the first four gifts on the first four windows
    // guarantees all four appear in every winning run.
    this.windowIndex++;
    if (this.windowIndex <= BOSS_RULES.giftLanes.length) this.spawnGift();
  }

  private hitPlayer(targetLane: number): void {
    // The logical lane commits immediately on swipe; actor slide is visual.
    if (targetLane !== this.practice.lane || this.protection > 0) return;
    this.playerHp--;
    this.playerHits++;
    this.protection = BOSS_RULES.invulnerableSeconds;
    // Hearts cost points as well as survival, using the same currency as a
    // level 1 or 2 incident. Clamped at zero exactly as `scoreRun` clamps, so
    // the local score and the Worker's recompute cannot drift apart.
    this.score = Math.max(0, this.score + POINTS.incident);
    this.eventLog.push({ t: 'incident', level: 3 });
    if (this.playerHp <= 0) this.finish('defeat');
  }

  private advanceGift(step: number): void {
    const gift = this.gift;
    if (!gift) return;
    if (gift.phase === 'falling') {
      // Deliberately not collectible yet. Standing in the lane during the
      // descent is how a player commits to where it will land, not a pickup.
      gift.elapsed += step;
      if (gift.elapsed < BOSS_RULES.giftFallSeconds) return;
      gift.phase = 'idle';
      gift.elapsed = 0;
      // Fall through rather than returning: it is collectible from the very
      // tick it settles, so there is no dead frame where it looks ready and
      // standing on it does nothing.
    }
    if (gift.phase === 'idle') {
      // Credited on contact once settled — the first tick Matthew's lane
      // matches. Snapshotting at expiry instead meant standing on it for 1.9s
      // earned nothing while arriving at 1.99s earned 100, which read as a
      // timing trick rather than a pickup.
      if (this.practice.lane === gift.lane) {
        gift.phase = 'taken';
        gift.elapsed = 0;
        this.score += POINTS.gift;
        this.eventLog.push({ t: 'gift', level: 3 });
        return;
      }
      gift.elapsed += step;
      if (gift.elapsed >= BOSS_RULES.giftPickupSeconds) {
        gift.phase = 'expired';
        gift.elapsed = 0;
      }
      return;
    }
    gift.elapsed += step;
    if (gift.elapsed >= GIFT_TIMING.fade) this.gift = null;
  }

  private spawnGift(): void {
    if (this.nextGiftIndex >= BOSS_RULES.giftLanes.length || this.gift) return;
    const preferred = BOSS_RULES.giftLanes[this.nextGiftIndex++]!;
    // Never spawn under Matthew: contact credit would award it instantly and
    // reward standing still instead of a deliberate move.
    const lane = preferred !== this.practice.lane ? preferred
      : preferred === 2 ? 1 : preferred + 1;
    this.gift = { lane, phase: 'falling', elapsed: 0 };
  }

  private finish(outcome: 'victory' | 'defeat'): void {
    this.state = outcome;
    this.attack = null;
    this.queue = [];
    this.gift = null;
    this.practice.clearShots();
    this.shield.setOpen(false);
    if (outcome === 'victory') this.score += POINTS.victory;
    this.eventLog.push({ t: outcome === 'victory' ? 'victory' : 'defeat' });
    this.cakeElapsed = 0;
  }

  get cues(): BossCues {
    const cakePhase: CakePhase = this.state === 'victory' ? 'recovered'
      : this.state === 'defeat' ? 'escaped' : 'held';
    const cakeLimit = cakePhase === 'recovered' ? CAKE_TIMING.recovered : CAKE_TIMING.escaped;
    const attack = this.attack;
    return {
      ...IDLE_CUES,
      strikes: attack && attack.kind !== 'orb' ? attack.strikes.map((strike) => strike.snapshot) : [],
      orbs: attack?.kind === 'orb' ? [attack.orb.snapshot] : [],
      orbImpacts: this.orbImpacts.map((impact) => impact.snapshot),
      shield: this.shield.snapshot,
      gift: this.gift ? {
        lane: this.gift.lane,
        phase: this.gift.phase,
        progress: Math.min(1, this.gift.elapsed / (
          this.gift.phase === 'falling' ? BOSS_RULES.giftFallSeconds
            : this.gift.phase === 'idle' ? BOSS_RULES.giftPickupSeconds
              : GIFT_TIMING.fade)),
      } : null,
      cake: { phase: cakePhase, progress: cakePhase === 'held' ? 0 : Math.min(1, this.cakeElapsed / cakeLimit) },
      gun: this.practice.gun,
      playerHitId: this.playerHits,
      bossHitId: this.bossHits,
    };
  }
}
