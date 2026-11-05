/** World-space layout shared by the control harness and the Level 3 renderer. */
export const BOSS_LAYOUT = {
  laneWidth: 2.2,
  laneCentres: [-2.2, 0, 2.2] as const,
  /**
   * Matthew stands well forward of centre. Closer to the lens puts him lower
   * in frame and lengthens the runway Aurora's magic has to cross, which is
   * what makes an incoming orb readable.
   */
  playerZ: 5.4,
  /** Deck clearance Matthew's feet stand at. */
  playerY: 0.08,
  bossZ: -5.6,
  /**
   * Top of Aurora's dais.
   *
   * The low "camera A" framing takes its up-angle from her elevation rather
   * than from pitching the lens, because pitching up foreshortens the deck and
   * costs the player their lane read. Raising the subject buys the same power
   * relationship and keeps the floor legible.
   */
  bossStageY: 2.6,
  /** She hovers clear of the dais: the last bit of lift is hers, not the architecture's. */
  bossFloat: 0.3,
  cakeX: 2.25,
  cakeZ: -5.8,
  deckHalfWidth: 4.8,
  sideDressingMinX: 3.35,
} as const;
