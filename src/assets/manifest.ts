/**
 * Asset manifest (design doc §10).
 *
 * Pins the exact source pack versions, records the clip mapping from semantic
 * roles to the clips that actually exist in the free packs, and holds
 * attachment offsets. Edit this file rather than hard-coding names in gameplay.
 *
 * PINNED BASELINE — do not silently mix with other releases:
 *   KayKit Adventurers           2.0 FREE  (CC0, dated 2025-10-22)
 *   KayKit City Builder Bits     1.0 FREE  (CC0)
 *   Kenney Blaster Kit           2.1       (CC0)
 *
 * NOTE: this baseline differs from the 1.0 GitHub pack audited in the design
 * doc. The 2.0 character GLBs contain ZERO embedded animations; all clips come
 * from the two Rig_Medium libraries below. All four files share an identical
 * 23-joint `Rig_Medium` skeleton, verified by name, so clips transplant
 * directly with no retargeting layer.
 */

export const ASSET_VERSION = '2.0.0-free+city1.0+blaster2.1';

/** Paths are relative to the Vite public root. */
export const SOURCES = {
  characters: {
    matthew: '/models/src/Rogue_Hooded.glb',
    aurora: '/models/src/Mage.glb',
    guard: '/models/src/Knight.glb',
  },
  animationLibraries: [
    '/models/src/Rig_Medium_General.glb',
    '/models/src/Rig_Medium_MovementBasic.glb',
  ],
  props: {
    blaster: '/models/src/blaster-f.glb',
  },
} as const;

/**
 * Semantic role -> clip name present in the 2.0 FREE libraries.
 *
 * The design doc's preferred clips 1H_Ranged_Aiming, 1H_Ranged_Shoot,
 * Spellcast_Raise, Spellcast_Shoot, Cheer and Dodge_Left/Right do NOT exist in
 * the free tier. Substitutions below are marked SUBSTITUTE and need a visual
 * sign-off at gameplay camera distance.
 */
export const CLIPS = {
  matthew: {
    idle: 'Idle_A',
    run: 'Running_A',
    hang: 'Jump_Idle',          // SUBSTITUTE for a hanging pose (doc §10)
    aim: 'Idle_B',              // SUBSTITUTE for 1H_Ranged_Aiming
    shoot: 'Throw',             // SUBSTITUTE for 1H_Ranged_Shoot
    hit: 'Hit_A',
    cheer: 'Jump_Full_Short',   // SUBSTITUTE for Cheer
    pickUp: 'PickUp',
  },
  aurora: {
    idle: 'Idle_B',
    castRaise: 'Use_Item',      // SUBSTITUTE for Spellcast_Raise
    castShoot: 'Throw',         // SUBSTITUTE for Spellcast_Shoot
    hit: 'Hit_A',
    death: 'Death_A',
    deathPose: 'Death_A_Pose',
  },
  guard: {
    idle: 'Idle_A',
    walk: 'Walking_A',
    react: 'Hit_B',
  },
} as const;

/** Attachment node names present in every character GLB. */
export const ATTACH_NODES = {
  handRight: 'handslot.r',
  handLeft: 'handslot.l',
  head: 'head',
} as const;

/** Local transform for the blaster inside `handslot.r`. Tune in the probe. */
export const ATTACH_OFFSETS = {
  blaster: {
    position: [0, 0, 0] as [number, number, number],
    rotationEuler: [0, 0, 0] as [number, number, number],
    scale: 1,
  },
} as const;

export type MatthewClip = keyof typeof CLIPS.matthew;
export type AuroraClip = keyof typeof CLIPS.aurora;
export type GuardClip = keyof typeof CLIPS.guard;
