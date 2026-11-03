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
 *   KayKit Holiday Bits          1.0 FREE  (CC0)
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
    // Recoloured exports from `npm run assets:recolour`, which bakes the
    // project palette into each atlas. The pristine source packs stay in
    // assets/ and are never modified.
    matthew: '/models/matthew.glb',
    aurora: '/models/aurora.glb',
    guard: '/models/guard.glb',
  },
  animationLibraries: [
    '/models/src/Rig_Medium_General.glb',
    '/models/src/Rig_Medium_MovementBasic.glb',
  ],
  props: {
    /** Confetti blaster. The Kenney blaster is gone — see plan.ts. */
    blaster: '/models/props/snowball_cannon.glb',
    gift: '/models/props/present_A_blue.glb',
    grappleHook: '/models/props/candycane_small.glb',
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

/**
 * Gameplay-authoritative character height in world units.
 *
 * The colliders and lane width were authored around a 1.38-unit capsule in
 * 1.6-unit lanes. The KayKit characters are authored at 2.17-2.65 units tall
 * and 1.94 wide, so dropping one in unscaled makes the player 57% taller than
 * its own collider and wider than the lane it occupies.
 *
 * Visuals conform to gameplay, never the reverse (design doc §12 Phase 4:
 * replace primitives "without changing colliders or gameplay timings"), so
 * characters are scaled to this height at load from their measured bounds
 * rather than by a hard-coded factor — which keeps it correct if an asset is
 * ever swapped for one authored at a different scale.
 */
export const CHARACTER_HEIGHT = 1.45;

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
