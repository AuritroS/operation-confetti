import catalog from './catalog.json' with { type: 'json' };

export interface BossProp {
  readonly id: string;
  readonly source: string;
  readonly url: string;
  readonly nativeHeight: number;
  /** Provisional visual height; final placement is reviewed in the arena camera. */
  readonly targetHeight: number;
  readonly role: string;
}

export const BOSS_PROPS: readonly BossProp[] = catalog;

/** Existing recoloured character outputs; built in this worktree. */
export const BOSS_ACTORS = {
  matthew: {
    url: '/models/matthew.glb',
    source: 'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf/Rogue.glb',
    targetHeight: 1.55,
    hideMeshes: ['Rogue_Cape'],
    note: 'Same unhooded Rogue with grafted curls as Level 2 commit 4b5d989.',
    clips: { idle: 'Idle_A', aim: 'Idle_B', shoot: 'Throw', hit: 'Hit_A', win: 'Jump_Full_Short' },
  },
  aurora: {
    url: '/models/aurora.glb',
    source: 'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf/Mage.glb',
    /**
     * Visible height, not bounding-box height. With the hat excluded from the
     * fit she needs this much to read ~1.6x Matthew on screen at the low
     * camera: the lens is far closer to him than to her, so perspective eats
     * most of a raw height ratio.
     */
    targetHeight: 4.7,
    hideMeshes: ['Mage_Hat'],
    clips: { idle: 'Idle_B', raise: 'Use_Item', cast: 'Throw', hit: 'Hit_A', defeat: 'Death_A' },
  },
} as const;

export const BOSS_ANIMATION_LIBRARIES = [
  '/models/level3/animations/Rig_Medium_General.glb',
  '/models/level3/animations/Rig_Medium_MovementBasic.glb',
] as const;

/**
 * Level 2's right-hand mount, enlarged for this camera.
 *
 * Level 2's 0.5 scale is correct for a 2.385-unit hero seen close. Here Matthew
 * is 1.55 units and much further from the lens, which put the cannon at 11
 * screen pixels — invisible, in a game called Operation Confetti. It is
 * deliberately oversized rather than accurate, so the silhouette reads.
 */
/**
 * The cannon in Matthew's right hand.
 *
 * The final term was PI, which aimed the barrel at Aurora correctly but
 * rolled the cannon ninety degrees onto its side — its up axis came out along
 * world +X. The hand bone is not axis-aligned, so this is not derivable on
 * paper; measured through `?debug` on level3.html, which exposes the scene so
 * an attachment's real world axes can be read. At PI/2 the cannon's up reads
 * (0, 0.69, -0.02) and the barrel (0.18, -0.02, -0.67), which is upright and
 * pointing down the deck at her.
 */
export const BOSS_CANNON_MOUNT = {
  handNode: 'handslot.r',
  position: [0, 0, 0],
  rotationEuler: [-Math.PI / 2, 0, Math.PI / 2],
  scale: 1.05,
  muzzleLocal: [0.08, 0.11, 0.78],
} as const;

/** Curated transparent Kenney Particle Pack 1.1 sprites (CC0). */
export const BOSS_PARTICLES = {
  castRing: '/level3-particles/magic_01.png',
  chargedMagic: '/level3-particles/magic_03.png',
  shieldEdge: '/level3-particles/circle_03.png',
  cannonFlash: '/level3-particles/muzzle_02.png',
  giftSparkle: '/level3-particles/star_06.png',
  spellSmoke: '/level3-particles/smoke_03.png',
} as const;

/** No pack mesh is appropriate for these gameplay/story roles. */
export const BOSS_PROCEDURAL = {
  cake: 'Reuse buildCake, then add Level 3 cream piping and berries; cake floats above the gala platter',
  crown: 'Reuse buildCrown on Aurora head; hide the Mage hat',
  birthday: 'Velvet gala arch, candle stands, muted balloon clusters and rooftop side banners',
  shield: 'Purple magical ring/dome, driven by simulation shield state',
  laneStrike: 'Marked lane tile and vertical spell beam, driven by committed target',
  magicOrb: 'Slow magenta sphere with a trail and explicit collider',
  confetti: 'Pooled decorative paper pieces at impact, no individual damage',
  terrace: 'Dry inlaid slate rooftop, stepped oval dais and raised cake platform',
  backdrop: 'Gradient night sky, moon, cloud bands, prominent CN Tower and City Builder flank buildings',
} as const;
