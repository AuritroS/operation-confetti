/** Combat values are simulation data; the scene only receives snapshots. */
export const BOSS_RULES = {
  playerHp: 5,
  bossHp: 100,
  shotDamage: 5,
  invulnerableSeconds: 1,
  /**
   * The damage budget, and the single number that sets fight length.
   *
   * Against a 300 ms cooldown and a 380 ms flight, 1.5 s is four landed shots
   * — 20 damage — for a player who fires when they see the shield drop. So
   * Aurora's 100 HP costs five exposed windows, which is five dodges and about
   * thirty seconds. A frame-perfect player who pre-fires into the opening gets
   * six (30 damage) and finishes in four windows; a sloppy one gets three and
   * takes seven. That spread is deliberate: landing every shot is the skill
   * the window tests.
   *
   * Her HP and the 5 damage per shot are fixed by the shared scoring contract
   * (`core/scoring` rejects any boss damage above 5 and the Worker recomputes
   * from the same rules), so this is the only lever that may move.
   */
  exposedSeconds: 1.5,
  /**
   * How long the cannon jams after confetti splashes off her raised shield.
   *
   * A block is only detected when the shot arrives, 380 ms after firing, by
   * which point the ordinary 300 ms cooldown has already elapsed — so this is
   * applied at the arrival, landing at the same instant as the visible block.
   *
   * It exists because a blocked shot used to be free, which made mashing the
   * fire button strictly optimal and pre-firing into the opening the best
   * strategy. Firing when the shield actually drops is never punished, so
   * this costs a disciplined player nothing.
   */
  blockedLockoutSeconds: 0.75,
  /** Descent before a gift settles. It cannot be collected during this. */
  giftFallSeconds: 0.7,
  /** How long a settled gift waits to be collected. */
  giftPickupSeconds: 2,
  /**
   * Preferred lane per gift, in order. A gift that would land in Matthew's
   * own lane is nudged one lane across so every gift costs a deliberate move
   * rather than rewarding wherever he happens to be standing.
   */
  giftLanes: [0, 2, 1, 0] as const,
} as const;
