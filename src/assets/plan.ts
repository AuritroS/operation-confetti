/**
 * The asset plan (design doc §10, §14).
 *
 * Single source of truth for which asset fills which gameplay role. The
 * gallery renders this for review; the levels will read it when the art goes
 * in. Keeping it as data means a swap is a one-line edit here rather than a
 * hunt through level code.
 *
 * `assetId` matches an id in the generated asset index (`<packId>/<name>`).
 * A null `assetId` means the role is filled procedurally — see `status`.
 */

export type PlanStatus =
  /** Chosen, pending visual sign-off. */
  | 'proposed'
  /** Signed off. */
  | 'confirmed'
  /** Built in code, not sourced from a pack. */
  | 'procedural';

export interface PlannedAsset {
  readonly role: string;
  readonly level: 1 | 2 | 3 | 'all';
  readonly assetId: string | null;
  readonly status: PlanStatus;
  readonly note: string;
  /** Clip roles this asset needs, for rigged characters. */
  readonly clips?: readonly string[];
}

export const PLAN: readonly PlannedAsset[] = [
  // ---------------------------------------------------------- characters --
  {
    role: 'Matthew',
    level: 'all',
    assetId: 'recoloured/matthew',
    status: 'proposed',
    note: 'Hood and cape give the thief silhouette. Mask is already a separate mesh, so the doc’s "custom bandit mask" is done. Recolour: body and legs blue, trim gold, skin untouched.',
    clips: ['Running_A', 'Idle_A', 'Hit_A', 'Jump_Idle', 'Idle_B', 'Throw', 'Jump_Full_Short'],
  },
  {
    role: 'Aurora',
    level: 3,
    assetId: 'recoloured/aurora',
    status: 'proposed',
    note: 'Hat retained per the doc. Recolour: robe purple, trim gold.',
    clips: ['Idle_B', 'Use_Item', 'Throw', 'Hit_A', 'Death_A', 'Death_A_Pose'],
  },
  {
    role: 'Guard',
    level: 1,
    assetId: 'recoloured/guard',
    status: 'proposed',
    note: 'Navy uniform with a gold badge. Hide the cape — that silhouette belongs to Matthew — and keep the helmet, which reads as security rather than knight once it is dark.',
    clips: ['Idle_A', 'Walking_A', 'Hit_B'],
  },

  // ------------------------------------------------------------- level 1 --
  {
    role: 'Scored gift',
    level: 'all',
    assetId: 'holiday/present_A_blue',
    status: 'proposed',
    note: 'One shape, one colour for every scored gift, plus the blue sparkle. With 40 present variants available, consistency is what keeps the collectible unambiguous.',
  },
  {
    role: 'Decorative presents',
    level: 'all',
    assetId: 'holiday/present_C_red',
    status: 'proposed',
    note: 'Non-interactive dressing. Any shape or colour EXCEPT the scored combination, so the world looks rich without confusing the pickup.',
  },
  {
    role: 'Hazard: laser barrier',
    level: 1,
    assetId: null,
    status: 'procedural',
    note: 'Primary obstacle. A glowing emissive beam reads as danger at 25+ units where a mesh is just a blob, states its lane unambiguously, and can never be mistaken for a collectible. Completes the colour language: blue means take, red means avoid.',
  },
  {
    role: 'Hazard: turret',
    level: 1,
    assetId: 'holiday/snowball_cannon',
    status: 'proposed',
    note: 'Static threat with a telegraphed shot. Gives a non-guard hazard some personality.',
  },
  {
    role: 'Hazard: blocker',
    level: 1,
    assetId: 'holiday/snowman_A',
    status: 'proposed',
    note: 'One physical blocker so the route is not wall-to-wall lasers.',
  },
  {
    role: 'Guard telegraph: searchlight',
    level: 1,
    assetId: null,
    status: 'procedural',
    note: 'Sweeping cone that commits to a lane before it strikes, satisfying the doc’s "telegraphs commit to a lane before impact" with no new controls.',
  },
  {
    role: 'Hit feedback',
    level: 1,
    assetId: 'holiday/bell_decorated',
    status: 'proposed',
    note: 'Rings and flashes on a collision. Feedback, not an obstacle.',
  },
  {
    role: 'Rooftop landmark',
    level: 1,
    assetId: 'city/watertower',
    status: 'proposed',
    note: 'Iconic rooftop silhouette, and the natural target for the spire-perch pose at the end of the level.',
  },
  {
    role: 'Vault door',
    level: 1,
    assetId: null,
    status: 'procedural',
    note: 'End-of-route reveal. Procedural now that the Kenney crates, whose open/close clips would have served, are out.',
  },

  // ------------------------------------------------------------- level 2 --
  {
    role: 'Grapple hook',
    level: 2,
    assetId: 'holiday/candycane_small',
    status: 'proposed',
    note: 'Sly’s signature is a hooked cane and a candy cane is literally that, at 240 tris. More on-theme than anything custom, and birthday-appropriate rather than borrowed.',
  },
  {
    role: 'Grapple anchor',
    level: 2,
    assetId: 'city/streetlight',
    status: 'proposed',
    note: 'The arm reads as a hook point. Alternatives: trafficlight_A/B/C.',
  },
  {
    role: 'Grapple cable',
    level: 2,
    assetId: null,
    status: 'procedural',
    note: 'Cylinder stretched between the gadget and the anchor.',
  },
  {
    role: 'Moving hazard',
    level: 2,
    assetId: null,
    status: 'procedural',
    note: 'A magenta magic orb Aurora throws during the chase. Procedural rather than a prop: it is her magic, so it should be her colour and share the sparkle system. Replaces the earlier lantern_mini pick, which read as set dressing rather than a threat.',
  },
  {
    role: 'Interpol nod',
    level: 2,
    assetId: 'city/car_police',
    status: 'proposed',
    note: 'Parked below the chase. A Carmelita reference for anyone who knows the games.',
  },

  // ------------------------------------------------------------- level 3 --
  {
    role: 'Confetti blaster',
    level: 3,
    assetId: 'holiday/snowball_cannon',
    status: 'proposed',
    note: 'Replaces the Kenney blaster so the whole project stays in one art language. Attaches to handslot.r.',
  },
  {
    role: 'Aurora’s shield',
    level: 3,
    assetId: 'props/shield_round',
    status: 'proposed',
    note: 'The doc has Aurora raising and lowering a shield for the firing window. Attaches to handslot.l.',
  },
  {
    role: 'Aurora’s wand',
    level: 3,
    assetId: 'props/wand',
    status: 'proposed',
    note: 'Attaches to handslot.r. Alternative: staff.',
  },
  {
    role: 'The cake',
    level: 3,
    assetId: null,
    status: 'procedural',
    note: 'Nothing resembling a cake exists in any pack, and it is the entire plot. Stacked cylinders plus candle cones.',
  },
  {
    role: 'Confetti burst',
    level: 3,
    assetId: null,
    status: 'procedural',
    note: 'Decorative only, never a damage object, per the doc. Shared particle pool.',
  },

  // ----------------------------------------------------------- all levels --
  {
    role: 'Thief sparkle',
    level: 'all',
    assetId: null,
    status: 'procedural',
    note: 'The Sly signature and the highest-payoff effect on this list. Marks everything interactable, and doubles as the readability fix for collectibles at distance.',
  },
  {
    role: 'Skyline backdrop',
    level: 'all',
    assetId: 'city/building_A',
    status: 'proposed',
    note: 'building_A through H, instanced on one shared atlas. Use the withoutBase variants on rooftops.',
  },
] as const;

/** Roles with no asset behind them yet, which the gallery flags for review. */
export function proceduralRoles(): readonly PlannedAsset[] {
  return PLAN.filter((p) => p.status === 'procedural');
}

export function planFor(assetId: string): PlannedAsset | undefined {
  return PLAN.find((p) => p.assetId === assetId);
}
