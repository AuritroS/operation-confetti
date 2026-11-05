/**
 * One tone response for the whole game.
 *
 * Levels 1 and 2 ran with no tone mapping while level 3 used ACES filmic at
 * 1.25 exposure. That is not a lighting difference — it is two different
 * colour responses in one game, so the same palette hex rendered differently
 * either side of a transition, and the first two levels read as murky next to
 * the third. Every level now shares the curve and differs only in exposure.
 *
 * Exposure is per level because the scenes genuinely differ: the route and
 * the chase are fogged exteriors lit by a dim key, the boss arena is a close
 * lit interior. These numbers are a starting point tuned against the campaign
 * capture at 390x844; they are presentation, so they belong in one table
 * rather than scattered through three scene constructors.
 */
export const LOOK = {
  /** Level 1, the rooftop route. */
  route: { exposure: 1.55 },
  /** Level 2, the skyline chase. */
  skyline: { exposure: 1.5 },
  /** Level 3, the boss arena. Already tuned under filmic. */
  boss: { exposure: 1.25 },
} as const;

export type LookId = keyof typeof LOOK;

/**
 * Where the moon sits, per level.
 *
 * The same motif at three distances is what ties the levels together: level 1
 * sees it far off over the rooftops, level 2 closer down the street canyon,
 * level 3 nearest of all from the top of the tower. Two rules keep it from
 * going wrong again, both of which it previously broke:
 *
 * 1. Never behind the CN Tower. Level 3's sat at z -22 directly behind the
 *    shaft and was invisible.
 * 2. Never under the HUD. The score sits top-left, so the moon is offset away
 *    from that corner rather than clipped by it.
 * 3. Inside the camera's far plane, which for levels 1 and 2 is 160 units.
 *    Level 1's moon sat at z -175 and its CN Tower at -165, so neither had
 *    ever rendered — what looked like the tower being lost to fog was the
 *    tower being clipped away entirely.
 *
 * There is exactly one moon implementation — `buildMoon` — and exactly one
 * moon per level. `SkyLayer` used to draw a second plain disc, which is why
 * levels 1 and 2 each had two.
 */
/**
 * The CN Tower, per level.
 *
 * Levels 1 and 2 run toward it, level 3 stands on it. Level 1's sat at
 * z -165 against a 160-unit far plane and was clipped away entirely.
 */
export const TOWER = {
  route: { height: 52, x: -26, y: -4, z: -148 },
} as const;

export const MOON = {
  route: { size: 24, x: 22, y: 26, z: -140 },
  skyline: { size: 28, x: 16, y: 32, z: -155 },
  /** Left of the tower shaft and above the SkyPod, so nothing occludes it. */
  boss: { size: 4.6, x: -10.4, y: 12.4, z: -24 },
} as const;
