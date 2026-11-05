import {
  AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry,
} from 'three';
import { concrete, concreteDark, gold, luminous, satin } from './materials';

/**
 * The CN Tower's SkyPod, as the arena floor.
 *
 * Levels 1 and 2 run toward this tower; Level 3 stands on it. The shared
 * `buildCnTower` is a distant-silhouette builder — ten-sided, parameterised by
 * total height, meant to be seen from a kilometre away — and `gallery.ts`
 * depends on its proportions, so close-up geometry lives here instead.
 *
 * Stylised, not measured. A real pod is ~30 m across, which at this world
 * scale would put the player so far inside the ring that no edge is ever in
 * frame — and the visible edge, with air past it, is the whole altitude cue.
 * So the playable deck is a terrace projecting from a compact pod: the lanes
 * get a straight corridor, the sides get a parapet you can see over, and the
 * round pod reads at the far end where the dais sits.
 */

/**
 * Tower axis.
 *
 * Set back far enough that the whole landmark fits the frame. Standing
 * directly under the antenna is the honest geometry and it does not read: at
 * z -10.2 the spire ran off the top of the portrait frame and the upper pod
 * crossed the gala arch. Pushing the core back reads as a terrace cantilevered
 * off the tower, which is the same stylisation that gives the lanes a straight
 * corridor in the first place.
 */
export const TOWER_AXIS_Z = -16;
/** Outer edge of the straight terrace the lanes run along. */
export const TERRACE_HALF_WIDTH = 4.6;
/**
 * Tip of the antenna. Exported because the framing test asserts it stays in
 * frame and clear of the HUD: the whole landmark fitting the portrait frame
 * is the constraint that sets every proportion above the shaft.
 */
export const TOWER_BEACON_Y = 18.3;

function ring(parent: Group, rTop: number, rBottom: number, height: number, y: number, z: number, material: MeshStandardMaterial | MeshBasicMaterial, sides = 28): Mesh {
  const mesh = new Mesh(new CylinderGeometry(rTop, rBottom, height, sides), material);
  mesh.position.set(0, y, z);
  parent.add(mesh);
  return mesh;
}

/** The round pod deck at the far end, with the flared underside that identifies it. */
function makePod(parent: Group): void {
  const podZ = -6.9;
  // Deck slab, squashed in z so the terrace meets a disc rather than a drum.
  ring(parent, 6.25, 6.25, 0.34, -0.17, podZ, concrete, 40).scale.z = 0.72;
  ring(parent, 6.45, 6.45, 0.1, 0.01, podZ, concreteDark, 40).scale.z = 0.72;
  // Flared underside: the pod's signature is that it widens as it rises.
  ring(parent, 6.2, 3.5, 1.5, -1.05, podZ, concreteDark, 40).scale.z = 0.72;
  ring(parent, 3.5, 2.9, 2.2, -2.9, podZ, concrete, 32).scale.z = 0.8;
  // Radial ribs under the lip, the detail that stops it reading as a pancake.
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const rib = new Mesh(new CylinderGeometry(0.1, 0.16, 1.6, 4), concrete);
    rib.position.set(Math.cos(angle) * 4.9, -1.0, podZ + Math.sin(angle) * 3.5);
    rib.rotation.z = Math.cos(angle) * 0.22;
    rib.rotation.x = -Math.sin(angle) * 0.22;
    parent.add(rib);
  }
}

/**
 * Shaft, pod and antenna.
 *
 * Proportioned against the frame rather than against the real tower, because
 * both ends are pinned: the pod has to clear the gala arch at screen y 267,
 * and the beacon has to clear the HUD status row at y 130. That leaves 6.3
 * world units for everything above the shaft, so the pod is a thin flared
 * saucer and the antenna takes the rest — roughly the 4:1 antenna-to-pod
 * ratio the real tower has.
 *
 * Lit like the reference art: pale concrete carrying magenta neon up the
 * shaft and needle and a cyan-lit pod, each wrapped in an additive sleeve so
 * the colour spills onto the stone instead of sitting flat on it.
 */
function makeShaft(parent: Group): void {
  const z = TOWER_AXIS_Z;
  const neon = luminous(0xcc29c3, 0.95);
  const cyan = luminous(0x53a6f9, 0.9);
  // One shared additive material, so every glow sleeve in the tower batches
  // into a single extra draw call.
  const bloom = new MeshBasicMaterial({
    color: 0xff5ae8, transparent: true, opacity: 0.17,
    depthWrite: false, blending: AdditiveBlending,
  });
  const cyanBloom = new MeshBasicMaterial({
    color: 0x6cc0ff, transparent: true, opacity: 0.3,
    depthWrite: false, blending: AdditiveBlending,
  });

  // Runs below the deck plane as well as above it; the pod we stand on hides
  // the lower end, so the shaft never shows a cut base.
  ring(parent, 1.1, 1.75, 15, 4.5, z, concrete, 12);
  for (const offset of [-1, 1]) {
    const rib = new Mesh(new CylinderGeometry(0.2, 0.32, 15, 5), concreteDark);
    rib.position.set(offset * 1.3, 4.5, z - 0.45);
    parent.add(rib);
  }
  // Neon risers on the camera-facing faces: the detail that makes it this
  // tower at night rather than a grey column.
  // No neon striping on the shaft: distinct strips turned the landmark into a
  // barber's pole. The shaft stays white concrete inside one soft magenta
  // sleeve, so the colour reads as light falling on it.
  ring(parent, 1.42, 2.12, 14.6, 4.6, z, bloom, 12);

  // Flared saucer: underside cone, lit window band, shallow cap.
  ring(parent, 2.0, 1.1, 0.6, 12.3, z, concreteDark, 20);
  ring(parent, 2.0, 2.0, 0.35, 12.78, z, cyan, 20);
  ring(parent, 2.22, 2.22, 0.78, 12.78, z, cyanBloom, 20);
  ring(parent, 1.7, 2.0, 0.25, 13.08, z, concrete, 20);
  const collar = new Mesh(new TorusGeometry(2.06, 0.075, 6, 22), luminous(0x53a6f9, 0.85));
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 12.98, z);
  parent.add(collar);

  // Antenna: a short equipment mast, then a long needle.
  ring(parent, 0.3, 0.45, 2.2, 14.3, z, concreteDark, 8);
  ring(parent, 0.04, 0.22, 2.75, 16.78, z, neon, 6);
  ring(parent, 0.26, 0.52, 2.75, 16.78, z, bloom, 6);
  ring(parent, 0.46, 0.62, 2.3, 14.3, z, bloom, 6);
  const beacon = new Mesh(new SphereGeometry(0.24, 8, 6), luminous(0xff7bf0));
  beacon.position.set(0, TOWER_BEACON_Y, z);
  parent.add(beacon);
  const beaconGlow = new Mesh(new SphereGeometry(0.62, 10, 8), bloom);
  beaconGlow.position.set(0, TOWER_BEACON_Y, z);
  parent.add(beaconGlow);
}

/**
 * Terrace parapet.
 *
 * This is the altitude: a rail you can see over with nothing solid past it.
 * Glass panels sit only in the shoulders, outside the lane corridor, so no
 * attack marking is ever read against a transparent floor.
 */
function makeParapet(parent: Group, nearZ: number, farZ: number): void {
  const glass = new MeshBasicMaterial({
    color: 0x7fd3ff, transparent: true, opacity: 0.17,
    depthWrite: false, side: DoubleSide,
  });
  const length = nearZ - farZ;
  const centreZ = (nearZ + farZ) / 2;
  for (const side of [-1, 1]) {
    const x = side * (TERRACE_HALF_WIDTH + 0.28);
    const kerb = new Mesh(new CylinderGeometry(0.22, 0.26, length, 6), concreteDark);
    kerb.rotation.x = Math.PI / 2;
    kerb.position.set(x, 0.1, centreZ);
    parent.add(kerb);
    // Posts and a gold top rail; the gaps are what you see the night through.
    for (let i = 0; i <= 9; i++) {
      const z = farZ + (length * i) / 9;
      const post = new Mesh(new CylinderGeometry(0.05, 0.06, 1.05, 6), concreteDark);
      post.position.set(x, 0.63, z);
      parent.add(post);
    }
    const rail = new Mesh(new CylinderGeometry(0.075, 0.075, length, 6), gold);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 1.16, centreZ);
    parent.add(rail);
    const panel = new Mesh(new PlaneGeometry(length, 0.92), glass);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(x, 0.66, centreZ);
    parent.add(panel);
  }

  // Glass floor insets, the pod's party trick, kept out of the lane corridor.
  const floorGlass = new MeshBasicMaterial({
    color: 0x3d6f9b, transparent: true, opacity: 0.34, depthWrite: false,
  });
  for (const side of [-1, 1]) {
    for (const z of [-1.4, 1.9, 5.2]) {
      const pane = new Mesh(new PlaneGeometry(1.25, 2.3), floorGlass);
      pane.rotation.x = -Math.PI / 2;
      pane.position.set(side * 3.92, 0.047, z);
      parent.add(pane);
      const frame = new Mesh(new CylinderGeometry(0.035, 0.035, 2.4, 4), gold);
      frame.rotation.x = Math.PI / 2;
      for (const dx of [-0.66, 0.66]) {
        const bar = frame.clone();
        bar.position.set(side * 3.92 + dx, 0.05, z);
        parent.add(bar);
      }
    }
  }
}

/** Antenna masts and vent stacks: small silhouettes that give the pod scale. */
function makeRoofClutter(parent: Group): void {
  for (const [x, z, height] of [[-5.9, -9.4, 1.7], [6.1, -9.9, 2.2], [-6.4, -4.6, 1.2]] as const) {
    const mast = new Mesh(new CylinderGeometry(0.035, 0.07, height, 5), concreteDark);
    mast.position.set(x, height / 2, z);
    parent.add(mast);
    const lamp = new Mesh(new SphereGeometry(0.08, 6, 5), luminous(0xcc29c3, 0.8));
    lamp.position.set(x, height + 0.1, z);
    parent.add(lamp);
  }
  // A low skirt around the terrace sides hides the deck slab's cut edge.
  for (const side of [-1, 1]) {
    const skirt = new Mesh(new CylinderGeometry(0.3, 0.42, 21.0, 4), satin(0x2b3350));
    skirt.rotation.x = Math.PI / 2;
    skirt.position.set(side * (TERRACE_HALF_WIDTH + 0.2), -0.35, 1.6);
    parent.add(skirt);
  }
}

export function makeTower(parent: Group, nearZ: number, farZ: number): void {
  makePod(parent);
  makeShaft(parent);
  makeParapet(parent, nearZ, farZ);
  makeRoofClutter(parent);
}
