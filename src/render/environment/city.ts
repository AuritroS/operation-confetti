/**
 * Mid city: the buildings immediately flanking the route.
 *
 * The warm window glow is the single biggest contributor to the reference
 * look — it is what makes the scene Toronto at night rather than a corridor.
 * It comes entirely from the atlas: the city texture already has windows
 * printed into it, so using it as an emissiveMap lights every window for no
 * extra geometry and no extra draw call.
 *
 * A pool of instanced "hero window" quads was tried on top and removed. It
 * scrolled on its own wrap while the buildings scrolled on the ring, so the
 * two could never stay aligned and the quads floated beside the facades.
 * Two scroll clocks for one visual is a bug waiting to happen, and the atlas
 * was already doing the job.
 */
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
  Box3,
  MeshBasicMaterial,
  DoubleSide,
} from 'three';
import { PALETTE } from '../palette';
import type { EnvironmentLayer, LayerContext } from './layer';
import { RingPlacer } from './ring';
import { disposeTree, unfog } from './skyline';
import type { PropId } from './props';

const SHAPES: PropId[] = ['buildingE', 'buildingA', 'buildingF', 'buildingB'];
const PER_SIDE = 6;
const SPACING = 26;

/**
 * Signage: a slip of self-lit colour on every other near façade, facing the
 * route. The cheapest neon there is — one plane, one of three shared
 * materials — and what turns a row of dark blocks into a street at night.
 */
const SIGN_COLOURS = [0xcc29c3, 0xeaac5b];
const SIGN_MATERIALS = SIGN_COLOURS.map((c) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, side: DoubleSide }));

/**
 * The mid band: a second row of buildings behind the street, moving at
 * 40% of travel.
 *
 * The near city moved at 100% and the far skyline at 12% with nothing in
 * between, so the scene read as a wall sliding past a backdrop. A band at
 * an intermediate rate is what makes the depth continuous: three rates,
 * three distances, and the eye fills in the rest.
 */
const MID_SHAPES: PropId[] = ['buildingC', 'buildingD', 'buildingE', 'buildingF', 'buildingA'];
const MID_PER_SIDE = 5;
const MID_SPACING = 30;
const MID_PARALLAX = 0.4;
const MID_SPAWN = 180;

/**
 * How far each band slides against a lane change, as a fraction of the
 * player's sideways position, and how quickly it follows. A step in a lane
 * moves the whole city a little the other way, nearer bands more than far,
 * which is the parallax a real street gives a walker who crosses it.
 */
const DRIFT_NEAR = 0.35;
const DRIFT_MID = 0.18;
const DRIFT_FOLLOW = 2.2;

/**
 * Where a building first appears, in units ahead.
 *
 * Must sit past the fog horizon. The previous value was 70, where fog left
 * buildings 85% visible, so they snapped into view at near-full opacity.
 * At the current exponential density, 130 units is about 95% fogged — a
 * building arriving there is invisible and fades in.
 *
 * Capped by the pool's period (PER_SIDE * SPACING = 136), which is why no
 * extra geometry was needed to fix the popping.
 */
export const SPAWN_DISTANCE = 130;

/** Street level, well below the roof. */
const STREET_Y = -12;

/**
 * The one ground everything below the roof stands on.
 *
 * Exported because the skyline backdrop has to use it too: it used to base
 * its buildings at y -4 while the street sat at -12, so the whole backdrop
 * floated eight units above the ground it was meant to be standing on.
 */
export const GROUND_Y = STREET_Y - 0.5;

export class CityLayer implements EnvironmentLayer {
  readonly id = 'city' as const;
  readonly object = new Group();

  private readonly rings: { ring: RingPlacer; items: Object3D[] }[] = [];
  private readonly owned: Object3D[] = [];
  private readonly street: Mesh;
  private readonly near = new Group();
  private readonly mid = new Group();
  /** Blade signs, by the building they hang from; they ride with it. */
  private readonly signs = new Map<Object3D, Mesh>();
  private driftX = 0;

  constructor(ctx: LayerContext) {
    for (const sign of [-1, 1] as const) {
      const items: Object3D[] = [];
      for (let i = 0; i < PER_SIDE; i++) {
        const prop = ctx.prop(SHAPES[(i + (sign > 0 ? 2 : 0)) % SHAPES.length] as PropId);
        if (!prop) continue;
        litWindows(prop);
        // Set well back and based below street level, so only upper floors
        // clear the parapet and the facades meet the ground instead of
        // ending in mid-air. Close buildings read as a street, not a roof.
        prop.position.set(sign * (ctx.corridor.edge + 11 + (i % 2) * 4), GROUND_Y, 0);
        items.push(prop);
        this.near.add(prop);
        this.owned.push(prop);
        if (i % 2 === 0) {
          // A blade sign: hung out from the face that looks onto the route,
          // standing perpendicular to it so it faces the player coming up
          // the roof. On the façade itself it would only ever be seen
          // edge-on from a camera near the centre line. A sibling of the
          // building, not a child: the prop carries its registry scale, and
          // a child would inherit it sevenfold.
          const box = new Box3().setFromObject(prop);
          const blade = new Mesh(
            new PlaneGeometry(2.2 + (i % 3) * 0.5, 0.8),
            SIGN_MATERIALS[(i / 2 + (sign > 0 ? 1 : 0)) % SIGN_MATERIALS.length]!,
          );
          // Near the top: the roof is at y 0 and these façades are based
          // twelve units below it, so anything lower than ~90% of a
          // building's height is under the parapet from where he runs.
          const inner = sign > 0 ? box.min.x : box.max.x;
          blade.position.set(inner - sign * 1.3, GROUND_Y + (box.max.y - GROUND_Y) * 0.92, 0);
          blade.userData.dz = (i % 3) * 1.5 - 1.5;
          this.signs.set(prop, blade);
          this.near.add(blade);
          this.owned.push(blade);
        }
      }
      this.rings.push({ ring: new RingPlacer(items, SPACING, SPAWN_DISTANCE, 1), items });

      // The mid band, further out and taller, darkened toward the sky so it
      // reads as a block behind rather than beside.
      const midItems: Object3D[] = [];
      for (let i = 0; i < MID_PER_SIDE; i++) {
        const prop = ctx.prop(MID_SHAPES[(i + (sign > 0 ? 3 : 0)) % MID_SHAPES.length] as PropId);
        if (!prop) continue;
        litWindows(prop, 'mid');
        // Out of fog, like the far band: in the portrait frustum this row is
        // only ever seen a hundred-odd units ahead, where fog would erase it.
        // Its darkening is what carries distance instead.
        unfog(prop);
        prop.scale.y *= 1.35 + (i % 3) * 0.2;
        prop.position.set(sign * (ctx.corridor.edge + 28 + (i % 3) * 6), GROUND_Y - 2, 0);
        midItems.push(prop);
        this.mid.add(prop);
        this.owned.push(prop);
      }
      this.rings.push({ ring: new RingPlacer(midItems, MID_SPACING, MID_SPAWN, MID_PARALLAX), items: midItems });
    }
    this.object.add(this.near, this.mid);

    /**
     * The street.
     *
     * Everything below the roof was standing in void: building bases ended
     * in mid-air, and the parked car and lamp posts floated. One dark plane
     * grounds all of it, for one draw call and two triangles.
     */
    this.street = new Mesh(
      new PlaneGeometry(190, 420),
      new MeshStandardMaterial({ color: PALETTE.ink, roughness: 1 }),
    );
    this.street.rotation.x = -Math.PI / 2;
    this.street.position.set(0, STREET_Y, -120);
    this.object.add(this.street);
  }

  update(travelled: number, step: number, laneX = 0): void {
    for (const { ring } of this.rings) {
      ring.update(travelled, (item, z) => {
        item.position.z = z;
        const blade = this.signs.get(item);
        if (blade) blade.position.z = z + (blade.userData.dz as number);
      });
    }
    // Slide the bands against the lane, slowly, so a change is felt by
    // the whole street and not just the figure.
    this.driftX += (laneX - this.driftX) * (1 - Math.exp(-step * DRIFT_FOLLOW));
    this.near.position.x = -this.driftX * DRIFT_NEAR;
    this.mid.position.x = -this.driftX * DRIFT_MID;
  }

  dispose(): void {
    disposeTree(this.owned);
    this.street.geometry.dispose();
    (this.street.material as MeshStandardMaterial).dispose();
    this.street.removeFromParent();
    this.object.removeFromParent();
  }
}

/**
 * Make the windows already printed in the atlas glow, by reusing the diffuse
 * texture as an emissive map. Free detail: no geometry, no second texture.
 */
/**
 * One lit material per source material and band, shared by every building
 * that uses it. Cloning per mesh put a material on every façade; with the
 * mid band that was 67 against a budget of 60, and none of them differed.
 */
const LIT = new Map<string, MeshStandardMaterial>();

function litWindows(root: Object3D, band: 'near' | 'mid' = 'near'): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as MeshStandardMaterial;
    const key = `${source.uuid}:${band}`;
    let cloned = LIT.get(key);
    if (!cloned) {
      cloned = source.clone();
      if (cloned.map) {
        // Low intensity on purpose. The emissive map is the whole diffuse
        // texture, so a high value lights the brickwork as brightly as the
        // glass and the building reads as a glowing block rather than a dark
        // facade with lit windows.
        cloned.emissiveMap = cloned.map;
        cloned.emissive = new Color(PALETTE.orangeWarm);
        cloned.emissiveIntensity = band === 'mid' ? 0.22 : 0.38;
      }
      // The mid band sits further into the night.
      cloned.color.lerp(new Color(PALETTE.ink), band === 'mid' ? 0.8 : 0.7);
      LIT.set(key, cloned);
    }
    mesh.material = cloned;
  });
}
