/**
 * Level 2 street canyon — a PRESET environment the camera moves through.
 *
 * Environment only. Nothing here knows what a gift, a hazard or an anchor is,
 * and nothing here may enter the interactive zone — see `GAME_ZONE_HALF` and
 * `tests/skyline-zone.test.ts`, which fails if it does.
 *
 * ---- why this is built once, not recycled -------------------------------
 *
 * The previous version was a recycling ring: every frame it derived a first
 * index from the player's distance, rewrote a window of instance matrices and
 * set `.count`. That is a sliding window which creates and destroys, and
 * every popping bug this level has had was a boundary bug on it — including
 * the one that shipped, where a sign error culled towers twenty-four units
 * IN FRONT of the player, so buildings evaporated before you reached them.
 *
 * Fixing that sign would have removed one instance of the bug, not the
 * category. So there is no window any more. The whole route's environment is
 * placed once at construction and never touched again; the frame loop moves
 * one parent group. Nothing is created, nothing is destroyed, and therefore
 * nothing can pop — structurally, not by tuning.
 *
 * It costs almost nothing. The route is 383 units; with a 60-unit margin at
 * each end that is 30 towers and 30 road tiles, against the 20 and 22 the
 * recycling window was already drawing every frame.
 *
 * ---- the frame -----------------------------------------------------------
 *
 * The scene draws in a PLAYER-RELATIVE frame: the hero sits at render z=0 and
 * the world appears at `playerZ - worldZ`. So children here are placed at
 * local `-worldZ`, and `update` sets the group's z to `playerZ`. Ahead of the
 * player is negative z; the camera sits behind at positive z.
 *
 * ---- the ground datum ----------------------------------------------------
 *
 * y=0 is the carriageway, and road tiles are base-seated so their LOWEST
 * surface lands on it. This was got wrong twice in opposite directions — a
 * KayKit road was a solid slab whose TOP was the walking surface, a Kenney
 * tile is a thin plate with raised kerbs whose carriageway is at the bottom.
 * The datum cannot be inferred from a bounding box; `tests/skyline-datum.ts`
 * pins it instead.
 *
 * ---- one tile is the whole street ----------------------------------------
 *
 * A Kenney road tile is a complete two-way street WITH ITS OWN KERBS AND
 * PAVEMENT, not one lane. Tiling six across at one-per-lane drew a six-lane
 * expanse for a three-lane game, and adding separate pavement tiles beside it
 * buried the road under slabs of the pavement it already had. One tile,
 * centred, with the facades at its edge.
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
import { GAME_ZONE_HALF } from './skyline-view';

/**
 * Where the canyon's inner FACES stand.
 *
 * Not where the buildings are centred: these towers scale to 15-30 units
 * wide and are asymmetric, so a fixed centre line put one shape's face
 * inside the road while another left a gap.
 */
export const FACADE_X = 6.9;

/** How far dressing sits in from the facade, on the pavement. */
export const DRESSING_INSET = 1.5;

/** How far the environment extends past each end of the route. */
export const MARGIN = 60;

/** A pedestrian crossing every N tiles, to break up the repeat. */
const CROSSING_EVERY = 5;

const TOWERS: StreetPropId[] = ['towerA', 'towerC', 'towerE', 'towerG'];

/**
 * Quarter turn that points a building's facade at the street.
 *
 * Exported with `facadeTurn` below so the test asserts the rotation THIS
 * file applies, rather than a copy of it — a test that restates the value it
 * is checking passes however wrong production is.
 *
 * Measured, not guessed. These models are symmetric in X (centre 0.000) and
 * asymmetric in Z — reaching 0.80 one way against 0.65 the other — and that
 * overhang is the shopfront and awning visible in the pack's own contents
 * sheet. The facade is authored facing +Z.
 *
 * The street runs along Z, so rotating by 0 or PI (as the first version did)
 * points the facade ALONG the street and never AT it: both canyon walls were
 * showing their side elevations. A quarter turn puts +Z onto +/-X instead.
 */
export const FACADE_TURN = Math.PI / 2;

/** The rotation applied to a canyon wall on `side`. The one source of it. */
export const facadeTurn = (side: -1 | 1): number => (side > 0 ? -FACADE_TURN : FACADE_TURN);

/**
 * Deterministic per-tile pseudo-random in [0, 1).
 *
 * An integer hash rather than Math.random: the street must be identical on
 * every replay, or a review screenshot cannot be compared with the one taken
 * before the change it is meant to verify. Now used only at BUILD time — the
 * frame loop no longer makes placement decisions at all.
 */
function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Batch {
  mesh: InstancedMesh;
  written: number;
}

export class SkylineStreet {
  readonly object = new Group();

  private batches = new Map<StreetPropId, Batch>();
  private dummy = new Object3D();
  private ground: Mesh;
  private tile = 17;
  private towerPitch = 34;

  constructor(
    private assets: StreetAssets,
    private routeLength: number,
  ) {
    const road = assets.half('road');
    if (road) this.tile = road.z * 2;
    this.towerPitch = this.tile * 2;

    const span = routeLength + MARGIN * 2;
    const roadTiles = Math.ceil(span / this.tile) + 2;
    const towerRows = Math.ceil(span / this.towerPitch) + 2;

    /**
     * Ground beyond the road.
     *
     * The road tile is 17 units wide; the canyon towers scale to 15-30 and
     * are placed by their inner face, so up to 28 units of each building
     * stands past the tarmac. Without this they end in mid-air — the same
     * problem level 1 solved the same way, with one dark plane.
     *
     * Dropped a clear half unit, not a hair: at 0.05 it z-fought the road
     * across the whole near field and the painted lane markings dissolved
     * into a grey wash.
     */
    this.ground = new Mesh(
      new PlaneGeometry(200, span + 80),
      new MeshStandardMaterial({ color: 0x131d30, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.5, -routeLength / 2);
    this.object.add(this.ground);

    this.allocate('road', roadTiles);
    this.allocate('roadCrossing', Math.ceil(roadTiles / CROSSING_EVERY) + 2);
    for (const id of TOWERS) this.allocate(id, towerRows * 2);
    this.allocate('streetlight', towerRows * 2);
    this.allocate('trafficLight', towerRows);
    this.allocate('streetSign', towerRows);
    this.allocate('dumpster', towerRows);

    this.build();
  }

  private allocate(id: StreetPropId, count: number): void {
    const mesh = this.assets.batch(id, count);
    if (!mesh) return;
    this.batches.set(id, { mesh, written: 0 });
    this.object.add(mesh);
  }

  /** Place one instance at a WORLD position; the group handles the frame. */
  private place(id: StreetPropId, x: number, y: number, worldZ: number, rotY = 0): void {
    const batch = this.batches.get(id);
    if (!batch || batch.written >= batch.mesh.count) return;
    this.dummy.position.set(x, y, -worldZ);
    this.dummy.rotation.set(0, rotY, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.written++, this.dummy.matrix);
  }

  /**
   * Lay out the whole route, once.
   *
   * Everything from -MARGIN to routeLength + MARGIN, so neither end of the
   * street is ever in frame.
   */
  private build(): void {
    const firstRow = Math.floor(-MARGIN / this.tile) - 1;
    const lastRow = Math.ceil((this.routeLength + MARGIN) / this.tile) + 1;
    for (let i = firstRow; i <= lastRow; i++) {
      const crossing = ((i % CROSSING_EVERY) + CROSSING_EVERY) % CROSSING_EVERY === 0;
      this.place(crossing ? 'roadCrossing' : 'road', 0, 0, i * this.tile);
    }

    const firstTower = Math.floor(-MARGIN / this.towerPitch) - 1;
    const lastTower = Math.ceil((this.routeLength + MARGIN) / this.towerPitch) + 1;
    for (let i = firstTower; i <= lastTower; i++) {
      const worldZ = i * this.towerPitch;

      for (const side of [-1, 1] as const) {
        const salt = side > 0 ? 17 : 91;
        const pick = TOWERS[Math.floor(hash(i, salt) * TOWERS.length)] as StreetPropId;
        const jitter = (hash(i, salt + 3) - 0.5) * this.towerPitch * 0.3;

        /**
         * Place by the FACADE, using the real face rather than a half-extent.
         *
         * After the quarter turn the model's +Z reaches along +/-X, so the
         * distance from its origin to the facade is `box.max.z` — not
         * `half.x`, and not `half.z` either, because half-extents average
         * the 0.80/0.65 asymmetry away and would stand the building 0.075
         * units off the kerb.
         */
        const box = this.assets.box(pick);
        const toFacade = box ? box.max.z : 0;
        this.place(
          pick,
          side * (FACADE_X + toFacade),
          0,
          worldZ + jitter,
          facadeTurn(side),
        );

        /**
         * Streetlights alternate sides: a pair at every pitch reads as a
         * corridor of gates, one per side reads as a street.
         *
         * Same quarter turn as the facades, for the same measured reason.
         * `light-curved` is 0.05 wide against 0.225 deep with its mass
         * offset +0.088 on Z — the lamp arm reaches along +Z. On a street
         * that also runs along Z that pointed every arm UP OR DOWN the road
         * instead of out over it.
         */
        if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
          this.place(
            'streetlight',
            side * (FACADE_X - 0.7),
            0,
            worldZ + this.tile * 0.3,
            facadeTurn(side),
          );
        }
      }

      // Pavement dressing, biased close to the kerb where it passes near the
      // camera — distance alone reads flat however good the assets are.
      const r = hash(i, 5);
      const side = r < 0.5 ? -1 : 1;
      const x = side * (FACADE_X - DRESSING_INSET);
      // Mirroring by side is right for a pole, wrong for anything that has
      // to be READ: a signal head is wider in X than deep, so it already
      // faces the oncoming player, and flipping it by PI on one kerb turned
      // it to face away. A dumpster's long axis is Z, which is correct
      // against a kerb that also runs along Z.
      const mirrored = side > 0 ? Math.PI : 0;
      if (r < 0.2) this.place('trafficLight', x, 0, worldZ + this.tile * 0.6, 0);
      else if (r < 0.42) this.place('streetSign', x, 0, worldZ + this.tile * 0.6, mirrored);
      else if (r < 0.58) this.place('dumpster', x, 0, worldZ + this.tile * 0.6, mirrored);
    }

    // Draw exactly what was written. Set ONCE — the frame loop never touches
    // these again, which is the whole point.
    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.written;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * The entire frame cost of this layer.
   *
   * One transform on one group. No instance matrices are rewritten, no
   * counts change, nothing is created or destroyed — which is what makes
   * popping unexpressible rather than merely tuned away.
   */
  update(playerZ: number): void {
    this.object.position.z = playerZ;
  }

  /** How many instances this layer holds, for the no-churn test. */
  get census(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, batch] of this.batches) out[id] = batch.mesh.count;
    return out;
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
