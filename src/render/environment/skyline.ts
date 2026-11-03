/**
 * Far skyline: building silhouettes and the CN Tower.
 *
 * Parallaxed at 15% of travel. Full-speed distant buildings read as a wall
 * rushing past; near-static ones read as miles away, which is the point.
 *
 * Darkened heavily and placed outside the fog's near plane, so they sit
 * behind the playable world rather than competing with it.
 */
import { Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { PALETTE } from '../palette';
import { buildCnTower } from '../custom';
import type { EnvironmentLayer, LayerContext } from './layer';
import type { PropId } from './props';

const SHAPES: PropId[] = ['buildingC', 'buildingD', 'buildingE', 'buildingF', 'buildingA', 'buildingB'];

/**
 * The skyline sits in a band far AHEAD, not out to the sides.
 *
 * Portrait is the constraint. The horizontal field of view here is about 32
 * degrees, so at 23 units ahead you can see roughly 6.6 units either side of
 * centre — a skyline placed at x = 43 is simply off-screen. Pushed out to 150
 * units the visible half-width grows to about 43, so the same buildings read
 * perfectly well once they are far enough away.
 *
 * Depth also does the parallax for free: at this range the band barely needs
 * to move to feel fixed, which is what makes it read as distance.
 */
export const BAND_NEAR = 70;
export const BAND_FAR = 205;
const COUNT = 16;

/**
 * Total drift across the whole route, so the band never has to wrap.
 *
 * The skyline used to vanish at 70 units — where fog still left it 85%
 * visible — and reappear at 205. Sizing the band for the full journey
 * removes the transition entirely rather than hiding it: 450 units of route
 * at 0.12 parallax is 54 units of drift, so a band extended by that much
 * carries the player to the vault without a single wrap.
 */
export const DRIFT_RATE = 0.12;

export class SkylineLayer implements EnvironmentLayer {
  readonly id = 'skyline' as const;
  readonly object = new Group();

  private readonly items: Object3D[] = [];
  private readonly anchors: { x: number; z: number }[] = [];
  private readonly tower: Group;

  constructor(ctx: LayerContext) {
    for (let i = 0; i < COUNT; i++) {
      const prop = ctx.prop(SHAPES[i % SHAPES.length] as PropId);
      if (!prop) continue;

      // Deterministic scatter across the band, biased so nearer buildings sit
      // further off-centre and the middle stays open for the route.
      const t = (i + 0.5) / COUNT;
      const z = -(BAND_NEAR + t * (BAND_FAR - BAND_NEAR));
      const side = i % 2 === 0 ? -1 : 1;
      const spread = 12 + ((i * 13) % 7) * 5 + t * 26;
      const x = side * spread;

      darken(prop, 0.3 + t * 0.14);
      // Out of fog. Exponential fog dense enough to hide the city spawn
      // would erase the skyline completely, so the backdrop handles its own
      // distance falloff through the darkening above.
      unfog(prop);
      prop.scale.multiplyScalar(0.9 + ((i * 11) % 5) * 0.2);
      prop.position.set(x, -4, z);
      this.items.push(prop);
      this.anchors.push({ x, z });
      this.object.add(prop);
    }

    // The Toronto signifier, kept inside the portrait frustum: at 150 units
    // the visible half-width is about 43, so x = -58 would have been cropped.
    this.tower = buildCnTower(52);
    this.tower.position.set(-26, -4, -165);
    darken(this.tower, 0.5);
    unfog(this.tower);
    this.object.add(this.tower);
  }

  /**
   * Slow drift, and deliberately no wrap.
   *
   * The band is far enough that full-speed scrolling would read as a wall
   * rushing past rather than a distant city, and it is long enough that the
   * route finishes before anything would need recycling.
   */
  update(travelled: number): void {
    const drift = travelled * DRIFT_RATE;
    for (const [i, item] of this.items.entries()) {
      const anchor = this.anchors[i];
      if (!anchor) continue;
      item.position.z = anchor.z + drift;
    }
    this.tower.position.z = -165 + travelled * 0.05;
  }

  dispose(): void {
    disposeTree([...this.items, this.tower]);
    this.items.length = 0;
    this.object.removeFromParent();
  }
}

/** Mix a subtree's materials toward the night sky, so distance reads. */
export function darken(root: Object3D, amount: number): void {
  const sky = new Color(PALETTE.ink);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as MeshStandardMaterial;
    const cloned = source.clone();
    cloned.color.lerp(sky, 1 - amount);
    cloned.roughness = 1;
    mesh.material = cloned;
  });
}

/** Opt a subtree out of scene fog, for anything acting as a backdrop. */
export function unfog(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      (m as MeshStandardMaterial).fog = false;
    }
  });
}

export function disposeTree(roots: readonly Object3D[]): void {
  for (const root of roots) {
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (m as MeshStandardMaterial).dispose();
      }
    });
    root.removeFromParent();
  }
}
