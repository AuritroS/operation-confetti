/** World-space layout shared by the control harness and the Level 3 renderer. */
export const BOSS_LAYOUT = {
  laneWidth: 2.2,
  laneCentres: [-2.2, 0, 2.2] as const,
  playerZ: 4,
  bossZ: -5.6,
  bossStageY: 1.05,
  cakeX: 2.25,
  cakeZ: -5.8,
  deckHalfWidth: 4.8,
  sideDressingMinX: 3.35,
} as const;
