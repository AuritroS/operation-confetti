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
    targetHeight: 1.45,
    hideMeshes: ['Rogue_Cape'],
    note: 'Same unhooded Rogue with grafted curls as Level 2 commit 4b5d989.',
    clips: { idle: 'Idle_A', aim: 'Idle_B', shoot: 'Throw', hit: 'Hit_A', win: 'Jump_Full_Short' },
  },
  aurora: {
    url: '/models/aurora.glb',
    source: 'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf/Mage.glb',
    targetHeight: 1.45,
    hideMeshes: ['Mage_Hat'],
    clips: { idle: 'Idle_B', raise: 'Use_Item', cast: 'Throw', hit: 'Hit_A', defeat: 'Death_A' },
  },
} as const;

export const BOSS_ANIMATION_LIBRARIES = [
  '/models/level3/animations/Rig_Medium_General.glb',
  '/models/level3/animations/Rig_Medium_MovementBasic.glb',
] as const;

/** Level 2's proven right-hand mount, copied from the committed manifest. */
export const BOSS_CANNON_MOUNT = {
  handNode: 'handslot.r',
  position: [0, 0, 0],
  rotationEuler: [-Math.PI / 2, 0, Math.PI],
  scale: 0.5,
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
  cake: 'Reuse buildCake: red velvet, frosting, six candles; on Aurora stage',
  crown: 'Reuse buildCrown on Aurora head; hide the Mage hat',
  birthday: 'Small bunting and balloon meshes at the stage sides',
  shield: 'Purple magical ring/dome, driven by simulation shield state',
  laneStrike: 'Marked lane tile and vertical spell beam, driven by committed target',
  magicOrb: 'Slow magenta sphere with a trail and explicit collider',
  confetti: 'Pooled decorative paper pieces at impact, no individual damage',
  terrace: 'Dry slate rooftop, low parapet and raised cake platform',
  backdrop: 'Reuse Level 2 city silhouettes as distant scenery after integration review',
} as const;
