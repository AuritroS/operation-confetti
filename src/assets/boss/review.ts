import {
  AmbientLight, Box3, Color, DirectionalLight, GridHelper, Group,
  PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildCake, buildCrown } from '../../render/custom';
import { BOSS_ACTORS, BOSS_PROPS } from './catalog';

const canvas = document.querySelector<HTMLCanvasElement>('#asset-canvas')!;
const select = document.querySelector<HTMLSelectElement>('#asset-select')!;
const title = document.querySelector<HTMLElement>('#asset-title')!;
const role = document.querySelector<HTMLElement>('#asset-role')!;
const height = document.querySelector<HTMLElement>('#asset-height')!;
const exportPath = document.querySelector<HTMLElement>('#asset-export')!;
const status = document.querySelector<HTMLElement>('#asset-status')!;

const entries = [
  { id: 'matthew', url: BOSS_ACTORS.matthew.url, targetHeight: BOSS_ACTORS.matthew.targetHeight, role: 'Unhooded Rogue with the Level 2 curl shell; cape hidden', hidden: [...BOSS_ACTORS.matthew.hideMeshes] },
  { id: 'aurora', url: BOSS_ACTORS.aurora.url, targetHeight: BOSS_ACTORS.aurora.targetHeight, role: 'Boss actor: purple and gold Mage; hat hidden for crown', hidden: [...BOSS_ACTORS.aurora.hideMeshes] },
  { id: 'cake', url: '', targetHeight: 0.84, role: 'Existing red velvet birthday cake with candles, built from geometry', hidden: [] as string[] },
  { id: 'crown', url: '', targetHeight: 0.23, role: 'Existing gold crown, attached to Aurora’s head', hidden: [] as string[] },
  ...BOSS_PROPS.map((prop) => ({ id: prop.id, url: prop.url, targetHeight: prop.targetHeight, role: prop.role, hidden: [] as string[] })),
];

for (const entry of entries) {
  const option = document.createElement('option');
  option.value = entry.id;
  option.textContent = entry.id.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
  select.append(option);
}

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(new Color('#263955'));
const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 2.1));
const key = new DirectionalLight(0xffdfb5, 2.4);
key.position.set(4, 7, 5);
scene.add(key);
const grid = new GridHelper(8, 8, 0x7797ad, 0x4f6e86);
scene.add(grid);
const camera = new PerspectiveCamera(48, 1, 0.1, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const loader = new GLTFLoader();
let displayed: Group | null = null;
let selectionToken = 0;

async function show(): Promise<void> {
  const token = ++selectionToken;
  const entry = entries.find((item) => item.id === select.value);
  if (!entry) return;
  title.textContent = select.selectedOptions[0]?.textContent ?? entry.id;
  role.textContent = entry.role;
  height.textContent = `${entry.targetHeight.toFixed(2)} world units (proposed)`;
  exportPath.textContent = entry.url || 'Procedural: src/render/custom.ts';
  status.textContent = 'Loading…';
  try {
    const model = entry.id === 'cake' ? buildCake() : entry.id === 'crown' ? buildCrown(0.2) : (await loader.loadAsync(entry.url)).scene;
    if (token !== selectionToken) return;
    displayed?.removeFromParent();
    model.traverse((node) => { if (entry.hidden.includes(node.name)) node.visible = false; });
    const sourceBox = new Box3().setFromObject(model);
    const sourceHeight = sourceBox.getSize(new Vector3()).y;
    if (sourceHeight <= 0) throw new Error('Asset has no measurable height');
    model.scale.setScalar(entry.targetHeight / sourceHeight);
    const box = new Box3().setFromObject(model);
    const center = box.getCenter(new Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    scene.add(model);
    displayed = model;
    const distance = Math.max(3.3, entry.targetHeight * 2.4);
    camera.position.set(distance * 0.48, entry.targetHeight * 0.8 + 0.7, distance);
    controls.target.set(0, entry.targetHeight * 0.48, 0);
    controls.update();
    status.textContent = 'Loaded';
  } catch (error) {
    status.textContent = `Could not load: ${String(error)}`;
  }
}

select.addEventListener('change', () => { void show(); });
select.value = 'aurora';
void show();

function frame(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
