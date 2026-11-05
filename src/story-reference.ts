/**
 * Clean asset plates for the comic artist.
 *
 * The panels have to show the same characters and props the player meets, and
 * the only reliable description of those is the build itself: Matthew is the
 * unhooded Rogue with grafted curls, Aurora wears the crown rather than the
 * mage hat, the gates carry a gift emblem. A written brief drifts from that;
 * a render of the actual asset cannot.
 *
 * So this is a single-asset viewer, driven by the query string, on a flat
 * neutral ground with even light and no fog or tone mapping. Nothing here is
 * shipped to a player — it exists so `tools/story-reference.mjs` can
 * photograph every asset at a consistent angle in one pass.
 *
 *   /story-reference.html?asset=matthew&view=front&hold=blaster
 */
import {
  AmbientLight, Color, DirectionalLight, Group, Object3D, PerspectiveCamera,
  Scene, WebGLRenderer, Box3, Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetBundle } from './assets/characters';
import { ATTACH_NODES, ATTACH_OFFSETS, SOURCES } from './assets/manifest';
import { BOSS_ACTORS, BOSS_CANNON_MOUNT, BOSS_PROPS } from './assets/boss/catalog';
import { buildCake, buildCnTower, buildCrown, buildGiftEmblem, buildMoon, buildVaultDoor } from './render/custom';

const params = new URLSearchParams(location.search);
const asset = params.get('asset') ?? 'matthew';
const view = params.get('view') ?? 'front';
const hold = params.get('hold');

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new Scene();
// A flat, slightly cool ground: dark enough for gold to read, light enough
// that a navy character does not disappear into it.
scene.background = new Color(0x2a3350);
scene.add(new AmbientLight(0xffffff, 1.5));
for (const [x, y, z, i] of [[4, 6, 6, 2.1], [-5, 3, 4, 1.1], [0, 4, -6, 1.4]] as const) {
  const light = new DirectionalLight(0xffffff, i);
  light.position.set(x, y, z);
  scene.add(light);
}
const camera = new PerspectiveCamera(32, 1, 0.1, 400);
const subject = new Group();
scene.add(subject);

const status = document.getElementById('status') as HTMLElement;
const bundle = new AssetBundle();

/** Attach a prop to a character's hand exactly as the game does. */
async function attach(actorRoot: Object3D, attachTo: (node: string, o: Object3D) => boolean): Promise<void> {
  if (hold === 'blaster') {
    await bundle.loadAll([SOURCES.props.blaster]);
    const prop = bundle.get(SOURCES.props.blaster).scene.clone(true);
    const o = ATTACH_OFFSETS.blaster;
    prop.position.set(...o.position);
    prop.rotation.set(...o.rotationEuler);
    prop.scale.setScalar(o.scale);
    attachTo(ATTACH_NODES.handRight, prop);
  } else if (hold === 'cannon') {
    const entry = BOSS_PROPS.find((p) => p.id === 'cannon');
    if (!entry) return;
    const gltf = await new GLTFLoader().loadAsync(entry.url);
    const prop = gltf.scene;
    const m = BOSS_CANNON_MOUNT;
    prop.position.set(...m.position);
    prop.rotation.set(...m.rotationEuler);
    prop.scale.setScalar(m.scale);
    attachTo(m.handNode, prop);
  }
  void actorRoot;
}

async function build(): Promise<Object3D> {
  switch (asset) {
    case 'matthew': {
      await bundle.loadAll([SOURCES.characters.matthew, ...SOURCES.animationLibraries]);
      const actor = bundle.actor(SOURCES.characters.matthew);
      await attach(actor.root, (n, o) => actor.attach(n, o));
      return actor.root;
    }
    case 'aurora': {
      await bundle.loadAll([BOSS_ACTORS.aurora.url]);
      const actor = bundle.actor(BOSS_ACTORS.aurora.url);
      // The crown, and the hidden mage hat: what the player actually sees.
      for (const name of BOSS_ACTORS.aurora.hideMeshes) {
        actor.root.traverse((o) => { if (o.name === name) o.visible = false; });
      }
      const head = actor.root.getObjectByName('head') ?? actor.root;
      const crown = buildCrown(0.22);
      head.add(crown);
      return actor.root;
    }
    case 'cake': return buildCake();
    case 'giftEmblem': return buildGiftEmblem(2);
    case 'vaultDoor': return buildVaultDoor(12, 9);
    case 'cnTower': return buildCnTower(14);
    case 'moon': return buildMoon(6);
    case 'present':
    case 'blaster':
    case 'cannon': {
      const url = asset === 'present'
        ? SOURCES.props.gift
        : asset === 'blaster'
          ? SOURCES.props.blaster
          : BOSS_PROPS.find((p) => p.id === 'cannon')?.url;
      if (!url) throw new Error(`no source for ${asset}`);
      return (await new GLTFLoader().loadAsync(url)).scene;
    }
    default: throw new Error(`unknown asset "${asset}"`);
  }
}

/** Frame the subject so every plate fills the same share of the image. */
function frame(object: Object3D): void {
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  object.position.sub(centre);

  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.35;
  const angles: Record<string, number> = { front: 0, three: Math.PI * 0.22, back: Math.PI, side: Math.PI * 0.5 };
  const yaw = angles[view] ?? 0;
  camera.position.set(Math.sin(yaw) * distance, size.y * 0.1, Math.cos(yaw) * distance);
  camera.lookAt(0, 0, 0);
}

function resize(): void {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

void build().then((object) => {
  subject.add(object);
  resize();
  frame(object);
  status.textContent = '';
  // Signals the capture tool that this plate is ready to photograph.
  (window as unknown as Record<string, unknown>).storyReady = true;
  renderer.setAnimationLoop(() => {
    resize();
    renderer.render(scene, camera);
  });
}).catch((error: unknown) => {
  status.textContent = `failed: ${String(error)}`;
});
