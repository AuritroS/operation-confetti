import './probe-assets.css';
import { Box3, Color, DirectionalLight, GridHelper, Group, HemisphereLight, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Stage } from './render/stage';
import { RendererHost } from './render/renderer-host';
import { loadStreetAssets } from './render/skyline-assets';
import { loadSkylineHero } from './render/skyline-hero';
import { buildAssetReview, type AssetReviewItem } from './render/skyline-asset-review';
import { SkylineRunner } from './levels/skyline/runner';
import { SKYLINE } from './levels/skyline/course';

document.title = 'Level 2 Assets — Operation Confetti';
document.body.innerHTML = `
  <main class="review">
    <aside class="sidebar">
      <header><div class="eyebrow">Operation Confetti / Level 02</div><h1>Asset review</h1><p class="summary" id="summary">Loading current assets…</p></header>
      <nav class="asset-list" id="asset-list" aria-label="Level 2 assets"></nav>
      <footer><p class="summary">Review the assets first.<br>Course placement comes next.</p><a href="/">Back to game</a><a href="/probe.html?characters">Character animation probe</a></footer>
    </aside>
    <section class="workspace" aria-label="Asset preview">
      <div class="toolbar"><div class="nav"><button id="previous" aria-label="Previous asset" disabled>←</button><span class="counter" id="counter">—</span><button id="next" aria-label="Next asset" disabled>→</button><button id="reset-view">Reset view</button></div><button id="copy-choices">Copy choices</button></div>
      <div class="viewport" id="viewport"><canvas id="stage" aria-label="Rotatable asset preview"></canvas><div class="message" id="message" role="status">Loading the Level 2 assets…</div><div class="view-note">Drag to rotate · Scroll or pinch to zoom</div></div>
      <section class="details"><div class="details-top"><div><h2 id="asset-name">Loading…</h2><p class="role" id="asset-role"></p><p class="source" id="asset-source"></p></div><label class="context" id="context-label" hidden>Preview<select id="context"></select></label></div>
        <div class="decisions" aria-label="Asset decision"><button data-choice="approve" aria-pressed="false" disabled>✓ Approve</button><button data-choice="remove" aria-pressed="false" disabled>× Remove</button><button data-choice="pending" aria-pressed="true" disabled>Undecided</button></div>
        <p class="notice" id="notice" role="status">Choices are saved here. Copy them when finished so we can apply the removals.</p>
      </section>
    </section>
  </main>
  <dialog id="choices-dialog"><h2>Your asset choices</h2><p id="copy-status">Copy this list into our conversation to apply your choices to the level.</p><textarea id="choices-text" readonly aria-label="Asset choices"></textarea><button id="close-dialog">Done</button></dialog>`;

const get = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-choice]')];
const previous = get<HTMLButtonElement>('previous'), next = get<HTMLButtonElement>('next');
const select = get<HTMLSelectElement>('context');
const message = get('message'), notice = get('notice');
type Decision = 'approve' | 'remove' | 'pending';
const STORAGE_KEY = 'operation-confetti:level2-asset-review:v1';
let decisions: Record<string, Decision> = {};
let canSave = true;
try {
  const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    decisions = Object.fromEntries(Object.entries(saved).filter(([, value]) => ['approve', 'remove', 'pending'].includes(value)));
  }
} catch { canSave = false; }

const stage = new Stage(new RendererHost(get<HTMLCanvasElement>('stage')));
stage.scene.fog = null;
stage.scene.background = new Color('#eef1f5');
// Neutral light makes dark, game-toned materials readable without replacing them.
for (const child of [...stage.scene.children]) if ('isLight' in child) stage.scene.remove(child);
stage.scene.add(new HemisphereLight(0xffffff, 0x74849a, 2));
const key = new DirectionalLight(0xffffff, 3); key.position.set(10, 20, 15); stage.scene.add(key);
const rim = new DirectionalLight(0xdde9ff, 2); rim.position.set(-10, 8, -12); stage.scene.add(rim);
stage.observe();
const controls = new OrbitControls(stage.camera, stage.renderer.domElement);
controls.enableDamping = true;
const holder = new Group(); stage.scene.add(holder);
const grid = new GridHelper(1, 10, 0xb4becb, 0xd7dee7); grid.position.y = -0.025; stage.scene.add(grid);
let items: AssetReviewItem[] = [], index = 0;
let radius = 1, centre = new Vector3();

function fit(): void {
  stage.resize();
  const vertical = stage.camera.fov * Math.PI / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * stage.camera.aspect);
  const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.15;
  stage.camera.near = Math.max(0.01, radius / 200);
  stage.camera.far = Math.max(200, distance * 20);
  stage.camera.position.copy(centre).add(new Vector3(0.9, 0.6, 1.5).normalize().multiplyScalar(distance));
  stage.camera.updateProjectionMatrix();
  controls.target.copy(centre);
  controls.minDistance = radius * 0.2; controls.maxDistance = distance * 8;
  controls.update();
}

function showModel(): void {
  const item = items[index]; if (!item) return;
  holder.clear(); holder.position.set(0, 0, 0);
  const contextIndex = Number(select.value);
  const model = contextIndex < 0 ? item.model : item.contexts[contextIndex]?.model;
  message.hidden = !!model;
  if (!model) { message.textContent = 'This asset could not be loaded. Reload to try again.'; return; }
  holder.add(model);
  const bounds = new Box3().setFromObject(holder);
  const size = bounds.getSize(new Vector3()), middle = bounds.getCenter(new Vector3());
  holder.position.set(-middle.x, -bounds.min.y, -middle.z);
  centre = new Vector3(0, size.y / 2, 0);
  radius = Math.max(size.length() / 2, 0.5);
  grid.scale.setScalar(Math.max(size.x, size.z, size.y * 0.5, 2) * 1.5);
  fit();
}

function updateDecisions(): void {
  let approved = 0, removed = 0;
  for (const item of items) {
    const decision = decisions[item.id] ?? 'pending';
    if (decision === 'approve') approved++;
    if (decision === 'remove') removed++;
    const button = get<HTMLButtonElement>(`asset-${item.id}`);
    button.dataset.decision = decision;
    button.setAttribute('aria-label', `${item.name}: ${decision === 'pending' ? 'undecided' : decision === 'approve' ? 'approved' : 'marked for removal'}`);
  }
  get('summary').textContent = `${items.length} assets · ${approved} approved · ${removed} to remove · ${items.length - approved - removed} undecided`;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.choice === (decisions[items[index]?.id ?? ''] ?? 'pending')));
}

function choose(at: number): void {
  index = Math.max(0, Math.min(items.length - 1, at));
  const item = items[index]; if (!item) return;
  get('asset-name').textContent = item.name;
  get('asset-role').textContent = item.role;
  get('asset-source').textContent = `${item.id} · ${item.source.split('/').at(-1)}`;
  get('counter').textContent = `${index + 1} / ${items.length}`;
  previous.disabled = index === 0; next.disabled = index === items.length - 1;
  for (const b of buttons) b.disabled = !item.model && b.dataset.choice === 'approve';
  select.replaceChildren(new Option('Asset', '-1'), ...item.contexts.map((c, i) => new Option(c.name, String(i))));
  get('context-label').hidden = !item.contexts.length;
  for (const entry of items) get(`asset-${entry.id}`).setAttribute('aria-current', String(entry === item));
  const url = new URL(location.href); url.searchParams.set('asset', item.id); history.replaceState(null, '', url);
  updateDecisions(); showModel();
}

for (const button of buttons) button.addEventListener('click', () => {
  const item = items[index]; if (!item) return;
  const choice = button.dataset.choice as Decision;
  decisions[item.id] = choice;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions)); canSave = true; } catch { canSave = false; }
  updateDecisions();
  notice.textContent = canSave ? 'Choice saved. Copy choices when finished; removals will be applied to the scene afterward.'
    : 'This browser could not save your choice. Use Copy choices before leaving this page.';
});
previous.addEventListener('click', () => choose(index - 1));
next.addEventListener('click', () => choose(index + 1));
select.addEventListener('change', showModel);
get('reset-view').addEventListener('click', fit);
const resize = new ResizeObserver(() => { if (items.length) fit(); }); resize.observe(get('viewport'));

get('copy-choices').addEventListener('click', async () => {
  if (!items.length) return;
  const lines = ['Level 2 asset review'];
  for (const [decision, label] of [['approve', 'APPROVE'], ['remove', 'REMOVE'], ['pending', 'UNDECIDED']] as const) {
    lines.push('', `${label}:`);
    const matching = items.filter(item => (decisions[item.id] ?? 'pending') === decision);
    lines.push(...(matching.length ? matching.map(item => `- ${item.name} [${item.id}] — ${item.source}`) : ['- None']));
  }
  const text = lines.join('\n');
  const textarea = get<HTMLTextAreaElement>('choices-text'); textarea.value = text;
  get<HTMLDialogElement>('choices-dialog').showModal();
  get('copy-status').textContent = 'Copy this list into our conversation to apply your choices to the level.';
  try {
    await navigator.clipboard.writeText(text);
    get('copy-status').textContent = 'Copied. Paste this into our conversation to apply your choices to the level.';
  } catch { textarea.focus(); textarea.select(); }
});
get('close-dialog').addEventListener('click', () => get<HTMLDialogElement>('choices-dialog').close());

let stopped = false, frame = 0;
const resources = await Promise.all([loadStreetAssets(), loadSkylineHero()]);
const [assets, hero] = resources;
const inventory = buildAssetReview(assets, hero);
items = inventory.items;
for (const [i, item] of items.entries()) {
  const button = document.createElement('button'); button.id = `asset-${item.id}`;
  const dot = document.createElement('span'); dot.className = 'status-dot'; dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = item.name;
  button.append(dot, label); button.addEventListener('click', () => choose(i)); get('asset-list').append(button);
}
const requested = new URLSearchParams(location.search).get('asset');
choose(Math.max(0, items.findIndex(item => item.id === requested)));
if (!canSave) notice.textContent = 'Local saving is unavailable. Copy choices before leaving this page.';
const runner = new SkylineRunner({ ...SKYLINE, entities: [], duration: 1e9 });
runner.swipe('down'); for (let i = 0; i < 120; i++) runner.update(1 / 60);
let last = performance.now();
function render(now: number): void {
  if (stopped) return;
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  if (items[index]?.id === 'matthew') { runner.update(dt); hero?.update(runner.snapshot, dt, false); }
  controls.update(); stage.render(); frame = requestAnimationFrame(render);
}
frame = requestAnimationFrame(render);

if (import.meta.hot) import.meta.hot.dispose(() => {
  stopped = true; cancelAnimationFrame(frame); resize.disconnect(); controls.dispose();
  hero?.dispose(); inventory.dispose(); assets.dispose();
  const geometries = new Set(), materials = new Set();
  for (const model of [...items.map(item => item.model), ...inventory.assemblies]) model?.traverse(node => {
    const mesh = node as import('three').Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const geometry of geometries) (geometry as import('three').BufferGeometry).dispose();
  for (const material of materials) (material as import('three').Material).dispose();
  grid.geometry.dispose();
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
  stage.dispose();
});
