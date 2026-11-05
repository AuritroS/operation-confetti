/**
 * `?boxes` — the review instrument.
 *
 * Every bug on the current list is some version of "the art does not match
 * the collider": barriers two units deeper than the box that stops you,
 * pillars missing the deck they hold up, anchors floating six units below
 * their wire, a player who can walk outside the zone decoration assumes is
 * unreachable. None of that is visible in a normal screenshot, and all of it
 * is obvious the moment the two are drawn on top of each other.
 *
 * Everything here is one `LineSegments` per colour, so the whole overlay is
 * four draw calls however much it is showing. Review-only: nothing in this
 * file runs unless `?boxes` is in the URL.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three';
import { SCENE } from '../levels/skyline/scene';
import { SKYLINE, GAME_ZONE_HALF } from '../levels/skyline/course';
import { resolvePlacement } from './skyline-resolve';
import type { StreetAssets } from './skyline-assets';
import type { StreetPropId } from './skyline-props';
import type { Entity } from '../levels/skyline/types';

export const SHOW_BOXES =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('boxes');

/** Half-extents the runner adds to every entity. Mirrored knowingly: this is
 * a debug view, and importing the runner here would couple review to sim. */
const PLAYER_HALF = { x: 0.35, y: 0.9, z: 0.35 };

type Colour = 'art' | 'collider' | 'point' | 'zone';

const COLOURS: Record<Colour, number> = {
  art: 0x4fd1ff, // what is drawn
  collider: 0xff5f9e, // what actually stops you
  point: 0xffd166, // attachment points and anchor targets
  zone: 0x7bff9e, // the interactive zone and lane centres
};

class Pen {
  readonly buffers: Record<Colour, number[]> = { art: [], collider: [], point: [], zone: [] };

  /** Wireframe box from centre and half-extents, in the render frame. */
  box(c: Colour, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
    const xs = [cx - hx, cx + hx];
    const ys = [cy - hy, cy + hy];
    const zs = [cz - hz, cz + hz];
    const out = this.buffers[c];
    const corner = (i: number, j: number, k: number) =>
      [xs[i] as number, ys[j] as number, zs[k] as number];
    const edge = (a: number[], b: number[]) => out.push(...a, ...b);
    for (const j of [0, 1]) for (const k of [0, 1]) edge(corner(0, j, k), corner(1, j, k));
    for (const i of [0, 1]) for (const k of [0, 1]) edge(corner(i, 0, k), corner(i, 1, k));
    for (const i of [0, 1]) for (const j of [0, 1]) edge(corner(i, j, 0), corner(i, j, 1));
  }

  /** A small cross, for a point that has no volume. */
  cross(c: Colour, p: Vector3, r = 0.6): void {
    const out = this.buffers[c];
    out.push(p.x - r, p.y, p.z, p.x + r, p.y, p.z);
    out.push(p.x, p.y - r, p.z, p.x, p.y + r, p.z);
    out.push(p.x, p.y, p.z - r, p.x, p.y, p.z + r);
  }

  line(c: Colour, a: Vector3, b: Vector3): void {
    this.buffers[c].push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

export class SkylineBoxes {
  readonly object = new Group();
  private owned: (BufferGeometry | LineBasicMaterial)[] = [];

  /**
   * `anchors` comes from the street so the overlay reads the SAME resolved
   * wire geometry the renderer does — an overlay that recomputed positions
   * could agree with itself while disagreeing with what is drawn.
   */
  constructor(
    assets: StreetAssets,
    anchors: ReadonlyMap<string, Vector3>,
    entities: readonly Entity[],
  ) {
    const pen = new Pen();

    // ---- what is drawn -------------------------------------------------
    for (const placement of SCENE.objects) {
      const resolved = resolvePlacement(placement, assets);
      const box = assets.box(placement.prop as StreetPropId);
      if (!resolved || !box) continue;
      // After a turn the authored X and Z extents swap; a quarter turn is
      // the only rotation used, so this stays exact.
      // These models are NOT centred on their origin — a building carries
      // its shopfront 0.80 one way and 0.65 the other — so the box has to be
      // drawn about the geometry's own centre, rotated into place, or the
      // overlay lies in exactly the way it exists to catch.
      const turned = Math.abs(Math.sin(resolved.rotationY)) > 0.5;
      const cxLocal = (box.min.x + box.max.x) / 2;
      const czLocal = (box.min.z + box.max.z) / 2;
      const c = Math.cos(resolved.rotationY), sn = Math.sin(resolved.rotationY);
      const offX = cxLocal * c + czLocal * sn;
      const offZ = -cxLocal * sn + czLocal * c;
      const hx = (turned ? box.max.z - box.min.z : box.max.x - box.min.x) / 2;
      const hz = (turned ? box.max.x - box.min.x : box.max.z - box.min.z) / 2;
      pen.box(
        'art',
        resolved.position.x + offX,
        (box.min.y + box.max.y) / 2,
        -(resolved.position.z + offZ),
        hx,
        (box.max.y - box.min.y) / 2,
        hz,
      );
    }

    // ---- what actually stops you ---------------------------------------
    for (const e of entities) {
      pen.box(
        'collider',
        e.x,
        e.y,
        -e.z,
        e.halfX + PLAYER_HALF.x,
        e.halfY + PLAYER_HALF.y,
        e.halfZ + PLAYER_HALF.z,
      );
    }

    // ---- attachment points and anchor targets ---------------------------
    for (const [, position] of anchors) {
      pen.cross('point', new Vector3(position.x, position.y, -position.z));
    }

    // ---- the contract ----------------------------------------------------
    // The interactive zone and the three lane centres, run the length of the
    // route so a prop drifting into them is immediately visible.
    const route = SKYLINE.duration * SKYLINE.speed;
    for (const x of [-GAME_ZONE_HALF, GAME_ZONE_HALF]) {
      pen.line('zone', new Vector3(x, 0.05, 40), new Vector3(x, 0.05, -route));
    }
    for (const lane of [-1, 0, 1]) {
      const x = lane * SKYLINE.laneWidth;
      pen.line('zone', new Vector3(x, 0.02, 40), new Vector3(x, 0.02, -route));
    }

    for (const colour of Object.keys(pen.buffers) as Colour[]) {
      const points = pen.buffers[colour];
      if (points.length === 0) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
      const material = new LineBasicMaterial({
        color: COLOURS[colour],
        transparent: true,
        opacity: colour === 'art' ? 0.35 : 0.8,
        depthTest: false,
        fog: false,
      });
      const lines = new LineSegments(geometry, material);
      lines.frustumCulled = false;
      lines.renderOrder = 999;
      this.owned.push(geometry, material);
      this.object.add(lines);
    }
  }

  /** Follows the player exactly as the street does. */
  update(playerZ: number): void {
    this.object.position.z = playerZ;
  }

  dispose(): void {
    for (const item of this.owned) item.dispose();
    this.owned.length = 0;
    this.object.removeFromParent();
  }
}
