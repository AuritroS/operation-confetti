import { BOSS_ACTORS } from '../../assets/boss/catalog';
import { BOSS_LAYOUT } from '../../levels/boss/layout';

/** Visual endpoints only. The runner resolves damage from lanes and timing. */
export const AURORA_TORSO = {
  x: 0,
  y: BOSS_LAYOUT.bossStageY + 0.08 + BOSS_LAYOUT.bossFloat
    + BOSS_ACTORS.aurora.targetHeight * 0.46,
  z: BOSS_LAYOUT.bossZ + 0.7,
} as const;

export const MATTHEW_ORB_IMPACT = {
  y: BOSS_LAYOUT.playerY + 0.95,
  z: BOSS_LAYOUT.playerZ + 0.25,
} as const;
