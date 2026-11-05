/**
 * Every geometric contract in level 2, checked by arithmetic.
 *
 * "Does anything overlap or phase into anything else" is a terrible question
 * to answer by looking at a screenshot and a trivial one to answer by
 * subtracting two boxes. The eye is good at *that looks wrong* and bad at
 * *those two share 0.4 units*; this covers the second kind so review can
 * spend itself on the first.
 *
 * Pure and offline. Prop facts arrive through a `PropLookup`, so the same
 * code runs against measured glTF bounds in a test and against loaded GLBs
 * in the browser, and cannot certify a scene that differs from the one
 * being drawn.
 */
import {
  overlap,
  resolveAnchor,
  resolveAttach,
  resolvePlacement,
  wireHeightAt,
  worldBox,
  type Box,
  type PropLookup,
  type ResolvedWire,
} from './resolve';
import { ASSEMBLY, COURSE, GAME_ZONE_HALF, PLAYER_HALF, ROUTE_LENGTH } from './config';
import { SCENE } from './scene';
import { SKYLINE } from './course';

export interface Finding {
  readonly severity: 'error' | 'warn';
  readonly kind: string;
  readonly detail: string;
}

/** Ignore contacts shallower than this; they are rounding, not interpenetration. */
const TOUCHING = 0.05;

/**
 * Props allowed to interpenetrate.
 *
 * A terrace is supposed to share party walls, and the road is a continuous
 * surface whose tiles meet. Flagging those would bury the findings that
 * matter in noise.
 */
const MAY_TOUCH = new Set(['road', 'roadCrossing', 'lowAnchor']);
const isWall = (prop: string) => prop.startsWith('tower');

export function auditScene(look: PropLookup): Finding[] {
  const findings: Finding[] = [];
  const err = (kind: string, detail: string) => findings.push({ severity: 'error', kind, detail });
  const warn = (kind: string, detail: string) => findings.push({ severity: 'warn', kind, detail });

  // ---- resolve everything once -----------------------------------------
  const placed: { id: string; prop: string; box: Box }[] = [];
  for (const placement of SCENE.objects) {
    const facts = look(placement.prop);
    const resolved = resolvePlacement(placement, look);
    if (!facts || !resolved) {
      err('unresolved', `${placement.id} (${placement.prop}) could not be resolved`);
      continue;
    }
    placed.push({ id: placement.id, prop: placement.prop, box: worldBox(resolved, facts) });
  }

  // ---- 1. nothing decorative may enter the interactive zone -------------
  for (const item of placed) {
    if (MAY_TOUCH.has(item.prop)) continue;
    // INTERSECTION with the zone interval, not distance from the origin.
    // The first version measured `max(-min.x, max.x)`, which reports a
    // building spanning -29.8..-6.9 as "reaching 29.8" when it never comes
    // near the lanes — 60 false errors burying three real ones.
    const intrudes = item.box.min.x < GAME_ZONE_HALF && item.box.max.x > -GAME_ZONE_HALF;
    if (intrudes) {
      const depth = Math.min(item.box.max.x, GAME_ZONE_HALF) - Math.max(item.box.min.x, -GAME_ZONE_HALF);
      err(
        'zone',
        `${item.id} (${item.prop}) overlaps the +/-${GAME_ZONE_HALF} zone by ` +
          `${depth.toFixed(2)} (spans x ${item.box.min.x.toFixed(2)}..${item.box.max.x.toFixed(2)}) ` +
          '— decoration has no collider, so the player passes through it',
      );
    }
  }

  // ---- 2. decoration must not interpenetrate ----------------------------
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i] as (typeof placed)[number];
      const b = placed[j] as (typeof placed)[number];
      if (MAY_TOUCH.has(a.prop) || MAY_TOUCH.has(b.prop)) continue;
      // A terrace shares party walls by design.
      if (isWall(a.prop) && isWall(b.prop)) continue;
      const d = overlap(a.box, b.box);
      if (d.x > TOUCHING && d.y > TOUCHING && d.z > TOUCHING) {
        warn(
          'phasing',
          `${a.id} and ${b.id} interpenetrate by ` +
            `${d.x.toFixed(2)} x ${d.y.toFixed(2)} x ${d.z.toFixed(2)}`,
        );
      }
    }
  }

  // ---- 3. wires must land on building faces -----------------------------
  const wires: ResolvedWire[] = [];
  for (const wire of SCENE.wires) {
    const a = resolveAttach(wire.from.on, wire.from.point, SCENE.objects, look);
    const b = resolveAttach(wire.to.on, wire.to.point, SCENE.objects, look);
    if (!a || !b) {
      err('wire', `${wire.id} has an endpoint that does not resolve to a bracket`);
      continue;
    }
    wires.push({ id: wire.id, a, b, sag: wire.sag });

    for (const [end, point] of [['from', a], ['to', b]] as const) {
      const host = end === 'from' ? wire.from.on : wire.to.on;
      const wall = placed.find((p) => p.id === host);
      if (!wall) continue;
      // The bracket must sit ON the wall, not in front of it: within its
      // footprint laterally and inside its height.
      const inside =
        point.x >= wall.box.min.x - TOUCHING &&
        point.x <= wall.box.max.x + TOUCHING &&
        point.y >= wall.box.min.y &&
        point.y <= wall.box.max.y;
      if (!inside) {
        err(
          'wire',
          `${wire.id} ${end} end at (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) ` +
            `is off ${host}, whose face spans x ${wall.box.min.x.toFixed(2)}..` +
            `${wall.box.max.x.toFixed(2)} and rises to ${wall.box.max.y.toFixed(1)}`,
        );
      }
    }
  }

  // ---- 4. anchors must lie on their wire --------------------------------
  for (const anchor of SCENE.anchors) {
    const wire = wires.find((w) => w.id === anchor.wire);
    if (!wire) {
      err('anchor', `${anchor.id} references missing wire ${anchor.wire}`);
      continue;
    }
    const at = resolveAnchor(anchor.lane, wire);
    const onCable = wireHeightAt(wire, at.x);
    if (Math.abs(at.y - onCable) > 1e-6) {
      err('anchor', `${anchor.id} sits ${(at.y - onCable).toFixed(3)} off its cable`);
    }
    // And the cable must actually span the lane the anchor claims.
    const lo = Math.min(wire.a.x, wire.b.x);
    const hi = Math.max(wire.a.x, wire.b.x);
    if (at.x < lo || at.x > hi) {
      err('anchor', `${anchor.id} at x=${at.x} is outside its wire's span ${lo.toFixed(1)}..${hi.toFixed(1)}`);
    }
  }

  // ---- 5. every encounter's art must match its collider -----------------
  for (const e of SKYLINE.entities) {
    const spec = ASSEMBLY[e.assembly];
    if (spec.kind === 'hazard' && spec.band) {
      const [low, high] = spec.band;
      if (Math.abs(e.y - e.halfY - low) > 1e-6 || Math.abs(e.y + e.halfY - high) > 1e-6) {
        err('band', `${e.id} spans ${(e.y - e.halfY).toFixed(2)}..${(e.y + e.halfY).toFixed(2)}, not its band ${low}..${high}`);
      }
    }
    if (Math.abs(e.x) + e.halfX > GAME_ZONE_HALF + 1e-6) {
      err('zone', `${e.id} reaches ${(Math.abs(e.x) + e.halfX).toFixed(2)} beyond the ${GAME_ZONE_HALF} zone`);
    }
    if (e.z < 0 || e.z > ROUTE_LENGTH) {
      err('route', `${e.id} at z=${e.z.toFixed(1)} is outside the route (0..${ROUTE_LENGTH})`);
    }
  }

  // ---- 6. the player must be able to reach only the zone ----------------
  // The runner expands every collider by the player's own half-extents, so
  // the reachable band is wider than the lanes. Decoration is placed on the
  // assumption that it is unreachable; this is where that is checked.
  const reach = COURSE.laneWidth + PLAYER_HALF.x;
  if (reach > GAME_ZONE_HALF) {
    err('zone', `a player in an outer lane reaches ${reach.toFixed(2)}, past the ${GAME_ZONE_HALF} zone`);
  }

  // ---- 7. the carriageway must be continuous ----------------------------
  const surface = placed
    .filter((p) => p.prop === 'road' || p.prop === 'roadCrossing')
    .sort((a, b) => a.box.min.z - b.box.min.z);
  for (let i = 1; i < surface.length; i++) {
    const previous = surface[i - 1] as (typeof surface)[number];
    const here = surface[i] as (typeof surface)[number];
    const gap = here.box.min.z - previous.box.max.z;
    if (gap > TOUCHING) {
      warn('surface', `${gap.toFixed(2)} unit gap in the road between ${previous.id} and ${here.id}`);
    }
  }
  if (surface.length > 0) {
    const first = surface[0] as (typeof surface)[number];
    const last = surface[surface.length - 1] as (typeof surface)[number];
    if (first.box.min.z > 0) {
      err('surface', `the road starts at z=${first.box.min.z.toFixed(0)}, after the start line`);
    }
    if (last.box.max.z < ROUTE_LENGTH) {
      err('surface', `the road ends at z=${last.box.max.z.toFixed(0)}, short of the route at ${ROUTE_LENGTH}`);
    }
  }

  return findings;
}

/** Human-readable report. Returns true when nothing is wrong. */
export function formatAudit(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'scene audit: clean';
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');
  const lines = [`scene audit: ${errors.length} error(s), ${warns.length} warning(s)`, ''];
  for (const f of [...errors, ...warns]) {
    lines.push(`  ${f.severity === 'error' ? 'ERROR' : ' warn'}  [${f.kind}] ${f.detail}`);
  }
  return lines.join('\n');
}
