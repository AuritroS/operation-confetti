/**
 * Level 2 street canyon: road, towers and pavement dressing.
 *
 * Environment only. Nothing here knows what a gift, a hazard or an anchor is,
 * and nothing here may enter the interactive zone — see `GAME_ZONE_HALF` in
 * `skyline-view.ts` and `tests/skyline-zone.test.ts`, which fails if it does.
 *
 * ---- the frame -----------------------------------------------------------
 *
 * Drawn in a PLAYER-RELATIVE frame: the hero sits at z=0 forever and the
 * world is placed at `playerZ - worldZ`, so ahead of the player is NEGATIVE
 * z. The camera sits at positive z, BEHIND the hero, which is why nothing
 * tall may be drawn between the two.
 *
 * ---- the ground datum ----------------------------------------------------
 *
 * y=0 is the carriageway, and road tiles are base-seated so their LOWEST
 * surface lands on it.
 *
 * This was got wrong twice in opposite directions, so it is worth stating
 * why. A KayKit road was a solid slab whose TOP was the walking surface, so
 * placing things at y=0 buried them and the fix was to sink the tile by its
 * own height. A Kenney tile is not a slab — it is a thin plate with RAISED
 * KERBS, so its bounding-box top is the pavement and its carriageway is at
 * the bottom. Carrying the sink across to it lifted the road out from under
 * everything and left Matthew, the obstacles and the dressing floating 0.34
 * units in the air.
 *
 * The lesson is not "don't sink" — it is that the datum cannot be inferred
 * from a bounding box, because where the walkable surface sits inside that
 * box depends on how the prop is modelled. `tests/skyline-datum.test.ts`
 * pins it instead: the carriageway, y=0, and the character's soles must
 * agree.
 *
 * ---- one tile is the whole street ----------------------------------------
 *
 * A Kenney road tile is a complete two-way street WITH ITS OWN KERBS AND
 * PAVEMENT, not one lane. Two consequences, both learned the hard way:
 * tiling six across at one-per-lane drew a six-lane expanse for a three-lane
 * game, and adding separate pavement tiles beside it buried the road under
 * thirteen-unit slabs of the very pavement the tile already had. One tile,
 * centred, and the facades sit at its edge.
 */
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  type InstancedMesh,
} from 'three';
import type { StreetAssets } from './skyline-assets';
import type { StreetPropId } from './skyline-props';
import { FOG_HORIZON, GAME_ZONE_HALF } from './skyline-view';

/**
 * Furthest the street is drawn, and the margin before a tower may appear.
 *
 * Exported so `tests/skyline-draw.test.ts` can check them against the fog
 * horizon and the frustum rather than anyone re-deriving the arithmetic.
 */
export const STREET_AHEAD = FOG_HORIZON;
export const TOWER_SPAWN_MARGIN = 6;

/**
 * Where the canyon's inner FACES stand.
 *
 * Not where the buildings are centred: these towers scale to 15-30 units
 * wide, so a fixed centre line put the widest one's face inside the road
 * while a narrow neighbour left a gap. Placing by face keeps the street a
 * constant width whichever shape the hash picks.
 */
export const FACADE_X = 6.9;

/**
 * How far dressing sits in from the facade, on the pavement.
 *
 * Must leave the interactive zone clear — `clearsGameZone` below is the
 * assertion, and `tests/skyline-zone.test.ts` fails if this closes up.
 */
export const DRESSING_INSET = 1.5;

/**
 * How far ahead the street is drawn.
 *
 * Past the fog horizon, so the far row arrives at about 5% opacity and fades
 * up rather than appearing at the clip plane. At 150 it was arriving 17%
 * visible and being sliced off by a frustum that ended before the fog did.
 */
const AHEAD = STREET_AHEAD;
/** How far behind the player the ROAD runs. Only the surface may do this. */
const BEHIND = 30;

/**
 * Margin added to the camera's own position before anything tall is drawn.
 *
 * Derived at runtime rather than hard-coded: the lens sits behind the hero,
 * so the span between them is in front of it and a 30-unit tower placed
 * "just behind the player" is drawn into the camera's face. Asking the camera
 * where it is keeps this correct if the camera moves — including if it
 * becomes oblique.
 */
const TOWER_CLEARANCE = TOWER_SPAWN_MARGIN;

/** A pedestrian crossing every N tiles, to break up the repeat. */
const CROSSING_EVERY = 5;

const TOWERS: StreetPropId[] = ['towerA', 'towerC', 'towerE', 'towerG'];

/**
 * Deterministic per-tile pseudo-random in [0, 1).
 *
 * An integer hash rather than Math.random: the street must be identical on
 * every replay, or a review screenshot cannot be compared with the one taken
 * before the change it is meant to verify.
 */
function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Batch {
  mesh: InstancedMesh;
  /** Written this frame. */
  count: number;
  /**
   * Pool capacity.
   *
   * Tracked separately because `mesh.count` is what three.js DRAWS and the
   * frame loop rewrites it. Using it as the capacity check made the pool
   * ratchet downward: a prop placed rarely set `count` to 0 on a frame with
   * none, and from then on the guard refused every write.
   */
  capacity: number;
}

export class SkylineStreet {
  readonly object = new Group();

  private batches = new Map<StreetPropId, Batch>();
  private dummy = new Object3D();
  private ground: Mesh;

  /** Tile pitch, measured from the asset rather than assumed. */
  private tile = 13;
  private rows = 0;
  private towerPitch = 26;
  private towerRows = 0;

  constructor(private assets: StreetAssets) {
    const road = assets.half('road');
    if (road) this.tile = road.z * 2;
    this.rows = Math.ceil((AHEAD + BEHIND) / this.tile) + 1;
    this.towerPitch = this.tile * 2;
    // No +slack: an extra row lands past the far plane, where it is clipped
    // rather than drawn. Fog hides that now, but drawing geometry purely to
    // have it discarded is waste. `tests/skyline-draw.test.ts` pins it.
    this.towerRows = Math.ceil(AHEAD / this.towerPitch);

    /**
     * Ground beyond the road.
     *
     * The road tile is 17 units wide; the canyon towers scale to 15-30 and
     * are placed by their inner face, so up to 28 units of each building
     * stands past the tarmac. Without this they end in mid-air.
     *
     * Level 1 solved the identical problem the identical way — one dark
     * plane under everything, for one draw call and two triangles.
     *
     * Dropped a clear HALF UNIT below the carriageway, not a hair. At 0.05
     * it z-fought the road across the whole near field and the painted lane
     * markings dissolved into a flat grey wash — the deeper far plane made
     * depth precision tighter, so the margin that would once have been fine
     * no longer was. Nothing can see under the road from this camera, so the
     * gap costs nothing.
     */
    this.ground = new Mesh(
      new PlaneGeometry(160, AHEAD + BEHIND + 40),
      new MeshStandardMaterial({ color: 0x131d30, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.5;
    this.object.add(this.ground);

    // Surface next, so everything else sorts over it.
    this.add('road', this.rows);
    this.add('roadCrossing', Math.ceil(this.rows / CROSSING_EVERY) + 2);
    for (const id of TOWERS) this.add(id, this.towerRows * 2);
    this.add('streetlight', this.towerRows * 2);
    this.add('trafficLight', this.towerRows);
    this.add('streetSign', this.towerRows);
    this.add('dumpster', this.towerRows);
  }

  private add(id: StreetPropId, count: number): void {
    const mesh = this.assets.batch(id, count);
    if (!mesh) return;
    this.batches.set(id, { mesh, count: 0, capacity: count });
    this.object.add(mesh);
  }

  private place(id: StreetPropId, x: number, y: number, z: number, rotY = 0): void {
    const batch = this.batches.get(id);
    if (!batch || batch.count >= batch.capacity) return;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, rotY, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.count++, this.dummy.matrix);
  }

  /**
   * `playerZ` is the player's world distance; `cameraZ` is where the lens
   * sits in the player-relative frame, so the layer can refuse to draw
   * anything tall between the two without being told the stand-off.
   */
  update(playerZ: number, cameraZ: number): void {
    for (const batch of this.batches.values()) batch.count = 0;

    // The ground follows the player so its far edge never enters frame.
    this.ground.position.z = -(AHEAD - BEHIND) / 2;

    // ---- surface ---------------------------------------------------------
    // Snapped to the tile pitch so the road slides under the player rather
    // than crawling, which is what makes the texture gradient read as depth.
    const firstRow = Math.floor((playerZ - BEHIND) / this.tile);
    for (let row = 0; row < this.rows; row++) {
      const index = firstRow + row;
      const z = playerZ - index * this.tile;
      const crossing = ((index % CROSSING_EVERY) + CROSSING_EVERY) % CROSSING_EVERY === 0;
      // Base-seated: the carriageway is the tile's lowest surface, so y=0.
      this.place(crossing ? 'roadCrossing' : 'road', 0, 0, z);
    }

    // ---- canyon and dressing ---------------------------------------------
    const firstTower = Math.ceil((playerZ + cameraZ + TOWER_CLEARANCE) / this.towerPitch);
    for (let row = 0; row < this.towerRows; row++) {
      const index = firstTower + row;
      const z = playerZ - index * this.towerPitch;

      for (const side of [-1, 1] as const) {
        const salt = side > 0 ? 17 : 91;
        const pick = TOWERS[Math.floor(hash(index, salt) * TOWERS.length)] as StreetPropId;
        const jitter = (hash(index, salt + 3) - 0.5) * this.towerPitch * 0.3;
        const halfX = this.assets.half(pick)?.x ?? 0;
        this.place(pick, side * (FACADE_X + halfX), 0, z + jitter, side > 0 ? Math.PI : 0);

        // Streetlights alternate sides: a pair at every pitch reads as a
        // corridor of gates, one per side reads as a street.
        if ((index + (side > 0 ? 1 : 0)) % 2 === 0) {
          this.place(
            'streetlight',
            side * (FACADE_X - 0.7),
            0,
            z + this.tile * 0.3,
            side > 0 ? Math.PI : 0,
          );
        }
      }

      // Pavement dressing, biased close to the kerb where it passes near the
      // camera — distance alone reads flat however good the assets are.
      const r = hash(index, 5);
      const side = r < 0.5 ? -1 : 1;
      const x = side * (FACADE_X - DRESSING_INSET);
      const facing = side > 0 ? Math.PI : 0;
      if (r < 0.2) this.place('trafficLight', x, 0, z + this.tile * 0.6, facing);
      else if (r < 0.42) this.place('streetSign', x, 0, z + this.tile * 0.6, facing);
      else if (r < 0.58) this.place('dumpster', x, 0, z + this.tile * 0.6, facing);
    }

    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Lateral reach of the nearest thing this layer places to the route.
   *
   * The dressing, not the facade — it is the dressing that would reach the
   * lanes first if anyone widened the street furniture.
   */
  static readonly nearestDressingX = FACADE_X - DRESSING_INSET;

  /** Whether the layer keeps clear of the interactive zone. */
  static readonly clearsGameZone = FACADE_X - DRESSING_INSET > GAME_ZONE_HALF;

  get loaded(): number {
    return this.batches.size;
  }

  dispose(): void {
    this.ground.geometry.dispose();
    (this.ground.material as MeshStandardMaterial).dispose();
    this.ground.removeFromParent();
    for (const { mesh } of this.batches.values()) mesh.dispose();
    this.batches.clear();
    this.object.removeFromParent();
  }
}
