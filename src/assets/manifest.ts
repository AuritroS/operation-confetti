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
    /** Confetti blaster / grappling gun. Kenney's compact pistol, tinted gold by the asset build. */
    blaster: '/models/props/blaster.glb',
    /**
     * The scored collectible, as gameplay actually loads it.
     *
     * This pointed at `present_A_blue.glb`, which the asset build has never
     * produced. Nothing noticed because gameplay reads the prop registry in
     * `render/environment/props.ts`, not this entry — so the manifest simply
     * described a file that did not exist. Level 3 keeps its own blue
     * present; levels 1 and 2 collect the yellow one.
     */
    gift: '/models/props/present_A_yellow.glb',
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

/**
 * Meshes hidden at load, per character.
 *
 * Each body part is its own mesh, so removing one is a visibility toggle
 * rather than an export — and reversible without an asset rebuild, which is
 * why it is preferred over surgery for anything still under review.
 *
 * Matthew loses the cape. It was fine under the hood, which draped over it,
 * but the curl shell is a cluster of spheres reaching down to y 1.169 while
 * the cape's top edge is at 1.236, so the two intersect even standing still
 * — and the chest lean then shears them, because the head is weighted 100%
 * to `head` while the cape is 50% spine / 27% hips / 23% chest. The
 * reference has no cape either: what sits behind his shoulders there reads
 * as a lowered hood. Checked first that the torso is closed underneath —
 * `Rogue_Body`'s only open edges are at the front waist, under the belt.
 *
 * Aurora loses the Mage hat because the reference gives her a crown, which
 * `buildCrown` supplies instead. The guard loses its cape to keep that
 * silhouette distinct from Matthew's.
 */
export const HIDDEN_MESHES: Record<string, readonly string[]> = {
  matthew: ['Rogue_Cape'],
  aurora: ['Mage_Hat'],
  guard: ['Knight_Cape'],
};

/** Attachment node names present in every character GLB. */
export const ATTACH_NODES = {
  handRight: 'handslot.r',
  handLeft: 'handslot.l',
  head: 'head',
} as const;

/**
 * Local transform for the blaster inside `handslot.r`.
 *
 * Solved from the rig rather than nudged into place. In bind pose the slot's
 * own axes land as localX -> world -X, localY -> world +Z, localZ -> world
 * +Y, while the blaster's barrel runs along its own +Z. At zero rotation
 * those compose to a barrel pointing along world +Y, which is to say
 * straight up at the sky — which is exactly how it first appeared.
 *
 * The final term was PI, which pointed the barrel forward but rolled the gun
 * ninety degrees onto its side — its width axis ended up as world up. The
 * hand bone is not axis-aligned, so this is not derivable on paper; it was
 * measured in `probe.html?characters`, which now applies these same offsets
 * and can report the attachment's real world axes. At PI/2 the barrel reads
 * (-0.25, 0, 0.92) and the gun's own up reads (0, 0.95, 0).
 */
export const ATTACH_OFFSETS = {
  blaster: {
    /**
     * The grip, not the centre of the model.
     *
     * The blaster's origin sits mid-body — its bounds run Y -0.268..0.153 and
     * Z -0.37..0.43 — so attaching at zero put the hand bone through the
     * barrel and Matthew appeared to hold it by the middle. The handle is
     * back and down in model space; under this rotation that maps to +Y and
     * +Z in the slot, scaled by the same factor the model is.
     */
    position: [0, 0.24, 0.11] as [number, number, number],
    rotationEuler: [-Math.PI / 2, 0, Math.PI / 2] as [number, number, number],
    /**
     * A pistol, not a carbine.
     *
     * The swing animations put his arm through a wide arc, and a long barrel
     * fouls it — which is why this is Kenney's compact blaster rather than
     * level 3's cannon, despite the two otherwise wanting to be one gun.
     */
    scale: 0.95,
  },
} as const;

export type MatthewClip = keyof typeof CLIPS.matthew;
export type AuroraClip = keyof typeof CLIPS.aurora;
export type GuardClip = keyof typeof CLIPS.guard;
