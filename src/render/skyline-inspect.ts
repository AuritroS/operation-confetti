/**
 * `?inspect` — every asset in this level, in one frame, in its real role.
 *
 * Built because checking orientation by playing the course costs one
 * round-trip per prop: you wait for an encounter, squint at it, guess, fix,
 * reload. Four separate rotation bugs reached review that way. Here each
 * prop sits at the x its role would put it at — towers on the facade line,
 * lamps and dressing on the kerb, blockers in lanes, signs overhead — so a
 * single screenshot answers "is anything pointing the wrong way".
 *
 * Role-correct rather than a neutral grid, deliberately. The question that
 * matters is not "which way is this model authored", which the label prints
 * anyway, but "does it look right where it will actually stand".
 *
 * Review-only. Nothing in this file runs without `?inspect` in the URL, and
 * the course is suppressed when it does.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { STREET_PROPS, type StreetPropId } from './skyline-props';
import type { Placement, SceneDefinition } from '../levels/skyline/scene';
import { SKYLINE } from '../levels/skyline/course';

export const INSPECTING =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('inspect');

/** Facade line, kerb and lane centres, matching the real scene. */
const FACADE = 6.9;
const KERB = 5.6;
const LANE = SKYLINE.laneWidth;
/** Spacing between rows within a column. */
const ROW = 20;
/** Height an overhead prop hangs at, matching the course's overhead band. */
const OVERHEAD = 9;

interface Slot {
  prop: StreetPropId;
  x: number;
  y?: number;
  facing: Placement['facing'];
  side: -1 | 0 | 1;
  place?: 'face';
  /** What this slot is demonstrating, printed on the label. */
  role: string;
}

/**
 * One of every registered prop, at the x its role puts it at.
 *
 * Grouped by column so a column shares an x and steps in z; that keeps the
 * street legible while still fitting everything into one shot.
 */
const SLOTS: Slot[] = [
  // --- left facade ---------------------------------------------------
  { prop: 'towerA', x: -FACADE, facing: { faces: 'street' }, side: -1, place: 'face', role: 'facade' },
  { prop: 'towerC', x: -FACADE, facing: { faces: 'street' }, side: -1, place: 'face', role: 'facade' },
  { prop: 'towerE', x: -FACADE, facing: { faces: 'street' }, side: -1, place: 'face', role: 'facade' },
  { prop: 'towerG', x: -FACADE, facing: { faces: 'street' }, side: -1, place: 'face', role: 'facade' },

  // --- left kerb -------------------------------------------------------
  { prop: 'streetlight', x: -KERB, facing: { faces: 'street' }, side: -1, role: 'kerb, arm over road' },
  { prop: 'streetlightDouble', x: -KERB, facing: { spans: 'across' }, side: -1, role: 'kerb, both arms' },
  { prop: 'trafficLight', x: -KERB, facing: { faces: 'oncoming' }, side: -1, role: 'kerb, faces player' },
  { prop: 'streetSign', x: -KERB, facing: { faces: 'oncoming' }, side: -1, role: 'kerb dressing' },

  // --- lane -1: things that block on the ground -------------------------
  { prop: 'barrier', x: -LANE, facing: { spans: 'across' }, side: 0, role: 'blocks lane' },
  { prop: 'fence', x: -LANE, facing: { spans: 'across' }, side: 0, role: 'blocks lane' },
  { prop: 'dumpster', x: -LANE, facing: { spans: 'across' }, side: 0, role: 'blocks lane' },
  { prop: 'bridgePillar', x: -LANE, facing: { spans: 'along' }, side: 0, role: 'bridge support' },

  // --- lane 0: surface and small items ----------------------------------
  // road and roadCrossing are laid as a STRIP below rather than listed as
  // items: a 17-unit tile shown as a sheet entry is a slab that dwarfs
  // everything beside it, and its orientation is only meaningful in a run.
  { prop: 'lowAnchor', x: 0, facing: { spans: 'along' }, side: 0, role: 'landing marking' },
  { prop: 'cone', x: 0, facing: { spans: 'across' }, side: 0, role: 'ground marker' },

  // --- lane +1: overhead -------------------------------------------------
  { prop: 'signHanging', x: LANE, y: OVERHEAD, facing: { faces: 'oncoming' }, side: 0, role: 'overhead sign' },
  { prop: 'lightHanging', x: LANE, y: OVERHEAD, facing: { faces: 'oncoming' }, side: 0, role: 'overhead signal' },
  { prop: 'signGantry', x: LANE, y: OVERHEAD, facing: { faces: 'oncoming' }, side: 0, role: 'overhead gantry' },
  { prop: 'workLight', x: LANE, facing: { spans: 'across' }, side: 0, role: 'beacon' },

  // --- right kerb: the anchor vocabulary ---------------------------------
  { prop: 'anchorSpan', x: KERB, y: OVERHEAD, facing: { spans: 'across' }, side: 1, role: 'wire bracket' },
  { prop: 'anchorWires', x: KERB, y: OVERHEAD, facing: { spans: 'across' }, side: 1, role: 'cable' },
  { prop: 'anchorPole', x: KERB, facing: { spans: 'across' }, side: 1, role: 'mast' },
  { prop: 'gift', x: KERB, y: 1.6, facing: { spans: 'along' }, side: 1, role: 'collectible' },

  // --- right facade, and the bridge deck ---------------------------------
  { prop: 'bridgeDeck', x: 0, y: OVERHEAD, facing: { spans: 'across' }, side: 0, role: 'bridge deck' },
];

/** Lay the slots out: a column per x, stepping in z. */
function layout(): Placement[] {
  const rowByColumn = new Map<number, number>();
  return SLOTS.map((slot, n) => {
    const row = rowByColumn.get(slot.x) ?? 0;
    rowByColumn.set(slot.x, row + 1);
    const base: Placement = {
      id: `inspect-${n}-${slot.prop}`,
      prop: slot.prop,
      x: slot.x,
      z: 14 + row * ROW,
      facing: slot.facing,
      side: slot.side,
    };
    return slot.y === undefined
      ? slot.place
        ? { ...base, place: slot.place }
        : base
      : slot.place
        ? { ...base, y: slot.y, place: slot.place }
        : { ...base, y: slot.y };
  });
}

const objects = layout();

/**
 * A short run of carriageway under the sheet.
 *
 * Context, not an exhibit. The road's orientation is only legible as a run —
 * whether the lane markings go down the street or across it — so it is laid
 * out properly rather than parked in a column as a single giant tile.
 */
const TILE = 17;
const surface: Placement[] = [];
for (let i = -1; i <= 7; i++) {
  surface.push({
    id: `inspect-road-${i}`,
    prop: i % 4 === 0 ? 'roadCrossing' : 'road',
    x: 0,
    y: -0.190,
    z: i * TILE,
    facing: { spans: 'along' },
    side: 0,
  });
}

/** Role text, keyed by placement id, for the labels. */
export const INSPECT_ROLES = new Map(objects.map((o, n) => [o.id, SLOTS[n]?.role ?? '']));

/**
 * The far end of the sheet, where the single right-hand wall stands.
 *
 * Every terrace is on the LEFT in this mode. One building is kept on the
 * right so the wire has two real brackets to span between, and it sits
 * behind everything else so the oblique camera can see past it — with both
 * terraces present the near wall simply hid the sheet.
 */
const FAR_Z = 14 + ROW * Math.max(
  ...[...new Set(SLOTS.map((v) => v.x))].map((x) => SLOTS.filter((v) => v.x === x).length),
);

/**
 * The inspection scene. One wire at the far end, so the bracket-to-building
 * join can be checked here rather than by playing the course.
 */
export const INSPECT: SceneDefinition = Object.freeze({
  objects: Object.freeze([
    ...surface,
    ...objects,
    {
      id: 'inspect-wire-L',
      prop: 'towerC',
      x: -FACADE,
      z: FAR_Z,
      facing: { faces: 'street' },
      side: -1,
      place: 'face',
    } satisfies Placement,
    {
      id: 'inspect-wire-R',
      prop: 'towerA',
      x: FACADE,
      z: FAR_Z,
      facing: { faces: 'street' },
      side: 1,
      place: 'face',
    } satisfies Placement,
  ]),
  wires: Object.freeze([
    {
      id: 'inspect-wire',
      from: { on: 'inspect-wire-L', point: 'bracket' },
      to: { on: 'inspect-wire-R', point: 'bracket' },
      sag: 0.06,
    },
  ]),
  anchors: Object.freeze(
    ([-1, 0, 1] as const).map((lane) => ({
      id: `inspect-anchor-${lane}`,
      wire: 'inspect-wire',
      lane,
    })),
  ),
  landings: Object.freeze([]),
  encounters: Object.freeze([]),
});

/** Furthest z the layout reaches, so the camera can frame all of it. */
export const INSPECT_DEPTH = 14 + ROW * Math.max(
  ...[...new Set(SLOTS.map((s) => s.x))].map((x) => SLOTS.filter((s) => s.x === x).length),
);

/**
 * Ground chevrons pointing the way the player travels.
 *
 * Without a reference, "blocking" and "facing" are indistinguishable in a
 * still: a barrier across the path and a barrier along it look the same if
 * you cannot tell which way is forward.
 */
export function travelArrows(): LineSegments {
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const z = -(20 + i * ROW * 0.5);
    for (const x of [-LANE, 0, LANE]) {
      // A chevron opening backwards, so the point leads down the route.
      points.push(x - 0.8, 0.08, z + 1.2, x, 0.08, z);
      points.push(x + 0.8, 0.08, z + 1.2, x, 0.08, z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const lines = new LineSegments(
    geometry,
    new LineBasicMaterial({ color: 0x7bff9e, transparent: true, opacity: 0.6, fog: false }),
  );
  lines.frustumCulled = false;
  return lines;
}

/**
 * HTML labels projected onto each item.
 *
 * DOM rather than in-scene text: three.js has no font loaded and adding one
 * for a review tool is a poor trade. Positions are projected each frame so
 * they track whatever the camera does.
 */
export class InspectLabels {
  private readonly root = document.createElement('div');
  private readonly nodes: { el: HTMLElement; at: Vector3 }[] = [];

  constructor(parent: HTMLElement) {
    this.root.className = 'inspect-labels';
    parent.append(this.root);

    for (const placement of objects) {
      const spec = STREET_PROPS[placement.prop as StreetPropId];
      const el = document.createElement('span');
      const axis = spec?.front ? `front ${spec.front}` : spec?.long ? `long ${spec.long}` : 'no axis';
      el.innerHTML =
        `<b>${placement.prop}</b><i>${INSPECT_ROLES.get(placement.id) ?? ''}</i><u>${axis}</u>`;
      this.root.append(el);
      // Staggered in height by index: role-correct layout clusters items at
      // similar screen positions, and unstaggered labels landed in an
      // unreadable pile.
      const lift = 2.4 + (this.nodes.length % 4) * 4.2;
      this.nodes.push({
        el,
        at: new Vector3(placement.x, (placement.y ?? 0) + lift, -placement.z),
      });
    }
  }

  /** `offsetZ` is the group translation the scene applies to the world. */
  update(camera: PerspectiveCamera, width: number, height: number, offsetZ: number): void {
    const probe = new Vector3();
    /**
     * Greedy de-clutter: a label that would land on top of one already
     * placed this frame hides instead.
     *
     * Role-correct layout clusters items by design, so without this the
     * middle of the sheet is an unreadable stack and the tool fails at the
     * one thing it is for. Nudge the camera and the hidden ones reappear.
     */
    const taken: { x: number; y: number }[] = [];
    for (const { el, at } of this.nodes) {
      probe.set(at.x, at.y, at.z + offsetZ).project(camera);
      const onScreen = probe.z < 1 && Math.abs(probe.x) < 1.4 && Math.abs(probe.y) < 1.4;
      const x = ((probe.x + 1) / 2) * width;
      const y = ((1 - probe.y) / 2) * height;
      const clear =
        onScreen && !taken.some((t) => Math.abs(t.x - x) < 120 && Math.abs(t.y - y) < 46);
      el.style.display = clear ? 'block' : 'none';
      if (!clear) continue;
      taken.push({ x, y });
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
