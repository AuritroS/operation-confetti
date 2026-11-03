/**
 * Asset gallery (development tool).
 *
 * Renders every model in the pinned CC0 packs so a selection can be made
 * against real geometry and real cost, then exports the picks as a list.
 *
 * One WebGLRenderer is shared across all 120 tiles and its output is copied
 * into each tile's own 2D canvas. Giving each tile its own WebGL context would
 * exhaust the browser's context limit — typically around 16 — long before the
 * grid finished loading. Models are parsed lazily as tiles scroll into view.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  AnimationMixer,
  type AnimationClip,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAN, type PlannedAsset } from './assets/plan';
import { CHARACTER_HEIGHT, HIDDEN_MESHES, SOURCES } from './assets/manifest';
import { LaserBarrier, Searchlight, Sparkle } from './render/effects';
import {
  buildCake,
  buildCnTower,
  buildCrown,
  buildMaskEmblem,
  buildVaultDoor,
  Confetti,
  GrappleCable,
  MagicOrb,
} from './render/custom';
import './gallery.css';

interface AssetItem {
  id: string;
  name: string;
  packId: string;
  pack: string;
  category: string;
  url: string;
  format: string;
  bytes: number;
  triangles: number;
  meshes: number;
  materials: number;
  joints: number;
  clips: string[];
  attachNodes: string[];
}

interface AssetIndex {
  generated: string;
  license: string;
  packs: { id: string; label: string; pack: string; note: string; count: number }[];
  items: AssetItem[];
}

const PICKS_KEY = 'oc.asset-picks.v1';
const THUMB = 256;

// ---- shared renderer ---------------------------------------------------

const renderer = new WebGLRenderer({
  antialias: true,
  alpha: false,
  // Required: every tile is produced by rendering here and then copying the
  // canvas with drawImage. Without this the drawing buffer is cleared once
  // the compositor runs, and whichever render straddles a flush copies an
  // empty frame — it showed up as exactly one blank thumbnail, the first one.
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(THUMB, THUMB, false);
// Neutral mid-grey, deliberately not a navy. The backdrop was first near-black
// and then #2b3450, and both landed within a point of the recoloured Matthew's
// own luminance, so the asset most in need of review was the one that
// disappeared. A neutral well above every garment colour keeps dark characters
// readable as silhouettes without blowing out the bright props.
renderer.setClearColor(new Color('#5a6378'), 1);

const scene = new Scene();
const camera = new PerspectiveCamera(32, 1, 0.01, 200);
scene.add(new AmbientLight(0xbfd4ff, 1.1));
const key = new DirectionalLight(0xfff3dc, 2.0);
key.position.set(3, 5, 4);
scene.add(key);
const rim = new DirectionalLight(0x6ea8ff, 0.7);
rim.position.set(-4, 2, -3);
scene.add(rim);

const holder = new Group();
scene.add(holder);

const loader = new GLTFLoader();
const modelCache = new Map<string, Object3D>();
const clipCache = new Map<string, AnimationClip[]>();

async function loadModel(url: string): Promise<{ object: Object3D; clips: AnimationClip[] }> {
  const cached = modelCache.get(url);
  if (cached) return { object: cached, clips: clipCache.get(url) ?? [] };
  const gltf = await loader.loadAsync(url);
  applyHiddenMeshes(url, gltf.scene);
  modelCache.set(url, gltf.scene);
  clipCache.set(url, gltf.animations);
  return { object: gltf.scene, clips: gltf.animations };
}

/**
 * Hide the same meshes the game hides, so a review shows what actually ships
 * rather than the raw pack model — the guard's cape in particular.
 */
function applyHiddenMeshes(url: string, scene: Object3D): void {
  const id = url.match(/\/models\/(\w+)\.glb$/)?.[1];
  const hidden = id ? HIDDEN_MESHES[id] : undefined;
  if (!hidden?.length) return;
  const wanted = new Set(hidden);
  scene.traverse((o) => {
    if (wanted.has(o.name)) o.visible = false;
  });
}

/**
 * Frame an object so it fills the view regardless of its authored scale —
 * a building and a dagger differ by orders of magnitude here.
 */
function frame(object: Object3D, yaw: number, pitch = 0.32): void {
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const radius = Math.max(size.length() / 2, 0.001);

  const fov = (camera.fov * Math.PI) / 180;
  const distance = (radius / Math.sin(fov / 2)) * 1.08;

  camera.position.set(
    centre.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    centre.y + Math.sin(pitch) * distance,
    centre.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  camera.lookAt(centre);
  camera.near = Math.max(distance - radius * 3, 0.01);
  camera.far = distance + radius * 4;
  camera.updateProjectionMatrix();
}

/**
 * Serialises thumbnail rendering.
 *
 * Every tile shares one renderer, one scene and one holder, so concurrent
 * renders interleave: one call clears the holder while another is mid-render
 * and the loser draws an empty frame. The plan view queues every row at once,
 * which made this show up as a blank tile for whichever model lost the race.
 */
let renderQueue: Promise<void> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(job, job);
  // Keep the chain alive even if a job rejects, so one bad model cannot stall
  // every thumbnail behind it.
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Copy the shared renderer's output into a 2D canvas.
 *
 * `preserveDrawingBuffer` on the renderer is what makes this safe: without it
 * the drawing buffer may be cleared once the compositor runs, and drawImage
 * would copy an empty frame.
 *
 * A blank first tile sent me through serialising the renders, adding
 * gl.finish(), and swapping to readPixels, none of which helped — the cause
 * was tools/shoot.mjs acquiring a WebGL context on the page's first canvas,
 * which made getContext('2d') return null for exactly that tile. Worth
 * recording: four plausible fixes to the wrong layer, and the measurement
 * that found it took one step.
 */
function copyToCanvas(target: HTMLCanvasElement, size: number): void {
  const ctx = target.getContext('2d');
  if (!ctx) {
    console.warn('[gallery] no 2d context; is something holding a WebGL context on this canvas?');
    return;
  }
  target.width = size;
  target.height = size;
  ctx.drawImage(renderer.domElement, 0, 0, size, size);
}

/** Render one model into a destination 2D canvas. */
function renderThumb(item: AssetItem, target: HTMLCanvasElement): Promise<void> {
  return enqueue(async () => {
    const { object } = await loadModel(item.url);

    holder.clear();
    holder.add(object);
    renderer.setSize(THUMB, THUMB, false);
    frame(object, 0.7);
    renderer.render(scene, camera);
    holder.clear();

    copyToCanvas(target, THUMB);
  });
}

// ---- picks -------------------------------------------------------------

function readPicks(): Set<string> {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writePicks(picks: Set<string>): void {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify([...picks]));
  } catch {
    /* private browsing; picks are a convenience, not state we depend on */
  }
}

const picks = readPicks();

// ---- state -------------------------------------------------------------

const el = {
  grid: document.getElementById('grid') as HTMLElement,
  count: document.getElementById('count') as HTMLElement,
  note: document.getElementById('note') as HTMLElement,
  search: document.getElementById('search') as HTMLInputElement,
  packs: document.getElementById('packs') as HTMLElement,
  cats: document.getElementById('cats') as HTMLElement,
  detail: document.getElementById('detail') as HTMLElement,
  detailCanvas: document.getElementById('detail-canvas') as HTMLCanvasElement,
  detailName: document.getElementById('detail-name') as HTMLElement,
  detailStats: document.getElementById('detail-stats') as HTMLElement,
  detailClips: document.getElementById('detail-clips') as HTMLElement,
  detailPick: document.getElementById('detail-pick') as HTMLButtonElement,
  detailClose: document.getElementById('detail-close') as HTMLButtonElement,
  foot: document.getElementById('foot') as HTMLElement,
  pickCount: document.getElementById('pick-count') as HTMLElement,
  copyPicks: document.getElementById('copy-picks') as HTMLButtonElement,
  clearPicks: document.getElementById('clear-picks') as HTMLButtonElement,
  sortName: document.getElementById('sort-name') as HTMLButtonElement,
  sortTris: document.getElementById('sort-tris') as HTMLButtonElement,
  sortBytes: document.getElementById('sort-bytes') as HTMLButtonElement,
  showPicks: document.getElementById('show-picks') as HTMLButtonElement,
  tabPlan: document.getElementById('tab-plan') as HTMLButtonElement,
  tabBrowse: document.getElementById('tab-browse') as HTMLButtonElement,
  tabEffects: document.getElementById('tab-effects') as HTMLButtonElement,
  browseControls: document.getElementById('browse-controls') as HTMLElement,
  plan: document.getElementById('plan') as HTMLElement,
  effects: document.getElementById('effects') as HTMLElement,
  fxRow: document.getElementById('fx-row') as HTMLElement,
  recolour: document.getElementById('detail-recolour') as HTMLElement,
  recolourRows: document.getElementById('recolour-rows') as HTMLElement,
  presetMatthew: document.getElementById('recolour-preset-matthew') as HTMLButtonElement,
  presetAurora: document.getElementById('recolour-preset-aurora') as HTMLButtonElement,
  recolourReset: document.getElementById('recolour-reset') as HTMLButtonElement,
  recolourCopy: document.getElementById('recolour-copy') as HTMLButtonElement,
  toggleScale: document.getElementById('toggle-scale') as HTMLButtonElement,
  toggleSparkle: document.getElementById('toggle-sparkle') as HTMLButtonElement,
};

let index: AssetIndex;
const filters = { pack: 'all', category: 'all', query: '', sort: 'name', picksOnly: false };

const kb = (b: number) => `${Math.round(b / 1024)} KB`;

function visible(): AssetItem[] {
  const q = filters.query.trim().toLowerCase();
  let items = index.items.filter((i) => {
    if (filters.pack !== 'all' && i.packId !== filters.pack) return false;
    if (filters.category !== 'all' && i.category !== filters.category) return false;
    if (filters.picksOnly && !picks.has(i.id)) return false;
    if (q && !i.name.toLowerCase().includes(q) && !i.category.includes(q)) return false;
    return true;
  });
  items = [...items].sort((a, b) => {
    if (filters.sort === 'tris') return b.triangles - a.triangles;
    if (filters.sort === 'bytes') return b.bytes - a.bytes;
    return a.name.localeCompare(b.name);
  });
  return items;
}

// Thumbnails are parsed on demand; 120 models at once would stall the tab.
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const tile = entry.target as HTMLElement;
      observer.unobserve(tile);
      const item = index.items.find((i) => i.id === tile.dataset['id']);
      const canvas = tile.querySelector('canvas');
      if (item && canvas) {
        void renderThumb(item, canvas).catch((e) => {
          console.error('[gallery]', item.id, e);
          tile.dataset['failed'] = '1';
        });
      }
    }
  },
  { rootMargin: '300px' },
);

function renderGrid(): void {
  observer.disconnect();
  el.grid.replaceChildren();

  const items = visible();
  el.count.textContent = `${items.length} of ${index.items.length} models`;

  for (const item of items) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset['id'] = item.id;
    if (picks.has(item.id)) tile.dataset['picked'] = '1';

    const canvas = document.createElement('canvas');
    canvas.width = THUMB;
    canvas.height = THUMB;

    const meta = document.createElement('span');
    meta.className = 'tile__meta';
    meta.innerHTML =
      `<span class="tile__name"></span>` +
      `<span class="tile__sub">${item.triangles.toLocaleString()} tris · ${kb(item.bytes)}</span>`;
    // Names come from the index, so set them as text rather than markup.
    (meta.querySelector('.tile__name') as HTMLElement).textContent = item.name;

    tile.append(canvas, meta);

    if (item.clips.length) {
      const badge = document.createElement('span');
      badge.className = 'tile__badge';
      badge.textContent = `${item.clips.length} clips`;
      tile.append(badge);
    }

    tile.addEventListener('click', () => openDetail(item));
    el.grid.append(tile);
    observer.observe(tile);
  }
}

// ---- detail view -------------------------------------------------------

let detailRaf = 0;
let detailMixer: AnimationMixer | null = null;
let detailObject: Object3D | null = null;
let detailLast = 0;
let scaleRef: Object3D | null = null;
let showScale = false;
let detailSparkle: Sparkle | null = null;
let showSparkle = false;
/** Set while a procedural asset is open, so its update runs and it disposes. */
let detailCustom: { update: (d: number) => void; dispose: () => void } | null = null;

function stopDetail(): void {
  cancelAnimationFrame(detailRaf);
  detailRaf = 0;
  detailMixer?.stopAllAction();
  detailMixer = null;
  detailObject = null;
  // The sparkle owns GPU buffers, so release it rather than leaking one per
  // asset opened.
  detailSparkle?.dispose();
  detailSparkle = null;
  // A procedural asset is built fresh per open, so it must be released.
  detailCustom?.dispose();
  detailCustom = null;
  scaleRef?.removeFromParent();
}

async function openDetail(item: AssetItem): Promise<void> {
  stopDetail();
  el.detail.hidden = false;
  el.detailName.textContent = item.name;

  el.detailStats.replaceChildren();
  const rows: [string, string][] = [
    ['pack', item.pack],
    ['category', item.category],
    ['triangles', item.triangles.toLocaleString()],
    ['transfer', kb(item.bytes)],
    ['meshes', String(item.meshes)],
    ['materials', String(item.materials)],
  ];
  if (item.joints) rows.push(['joints', String(item.joints)]);
  if (item.attachNodes.length) rows.push(['attach', item.attachNodes.join(', ')]);
  rows.push(['file', item.url.replace('/asset-src/', '')]);
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    el.detailStats.append(dt, dd);
  }

  syncPickButton(item);
  el.detailPick.onclick = () => togglePick(item);

  const { object, clips } = await enqueue(() => loadModel(item.url));
  detailObject = object;

  // Per-part tint rows, for rigged characters and anything else with meshes.
  buildRecolour(object);

  // Characters carry no clips of their own, so offer the shared libraries.
  const library = await libraryClips();
  const offered = clips.length ? clips : item.joints ? library : [];

  el.detailClips.replaceChildren();
  if (offered.length) {
    detailMixer = new AnimationMixer(object);
    for (const clip of offered) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = clip.name;
      b.onclick = () => {
        for (const other of el.detailClips.querySelectorAll('button')) {
          other.removeAttribute('data-on');
        }
        b.dataset['on'] = '1';
        detailMixer?.stopAllAction();
        detailMixer?.clipAction(clip).reset().play();
      };
      el.detailClips.append(b);
    }
  }

  detailLast = performance.now();
  const spin = (now: number): void => {
    if (!detailObject) return;
    const dt = Math.min((now - detailLast) / 1000, 0.1);
    detailLast = now;
    detailMixer?.update(dt);

    holder.clear();
    holder.add(detailObject);

    // Optional comparisons, parented to the holder so framing includes them.
    if (showScale && scaleRef) {
      const box = new Box3().setFromObject(detailObject);
      const size = box.getSize(new Vector3());
      // Stand Matthew just clear of the asset's own footprint.
      scaleRef.position.x = box.max.x + Math.max(size.x * 0.2, 0.4) + 0.4;
      holder.add(scaleRef);
    }
    if (showSparkle) {
      detailSparkle ??= new Sparkle({ count: 16, radius: 0.5, rise: 0.7 });
      const box = new Box3().setFromObject(detailObject);
      detailSparkle.points.position.copy(box.getCenter(new Vector3()));
      detailSparkle.update(dt);
      holder.add(detailSparkle.points);
    }

    const size = Math.min(el.detailCanvas.clientWidth || 420, 560);
    renderer.setSize(size, size, false);
    frame(detailObject, (now / 4000) % (Math.PI * 2));
    renderer.render(scene, camera);
    holder.clear();

    copyToCanvas(el.detailCanvas, size);
    detailRaf = requestAnimationFrame(spin);
  };
  detailRaf = requestAnimationFrame(spin);
}

let libraryPromise: Promise<AnimationClip[]> | null = null;
function libraryClips(): Promise<AnimationClip[]> {
  libraryPromise ??= (async () => {
    const libs = index.items.filter((i) => i.packId === 'animations');
    const all: AnimationClip[] = [];
    for (const lib of libs) {
      const { clips } = await loadModel(lib.url);
      all.push(...clips);
    }
    return all.filter((c) => c.name !== 'T-Pose');
  })();
  return libraryPromise;
}

el.detailClose.onclick = () => {
  stopDetail();
  el.detail.hidden = true;
};

// ---- picks UI ----------------------------------------------------------

function syncPickButton(item: AssetItem): void {
  const on = picks.has(item.id);
  el.detailPick.textContent = on ? 'Picked — remove' : 'Pick this';
  if (on) el.detailPick.dataset['on'] = '1';
  else el.detailPick.removeAttribute('data-on');
}

function togglePick(item: AssetItem): void {
  if (picks.has(item.id)) picks.delete(item.id);
  else picks.add(item.id);
  writePicks(picks);
  syncPickButton(item);
  syncFooter();

  const tile = el.grid.querySelector(`[data-id="${CSS.escape(item.id)}"]`) as HTMLElement | null;
  if (tile) {
    if (picks.has(item.id)) tile.dataset['picked'] = '1';
    else tile.removeAttribute('data-picked');
  }
  if (filters.picksOnly) renderGrid();
}

function syncFooter(): void {
  el.foot.hidden = picks.size === 0;
  el.pickCount.textContent = `${picks.size} picked`;
}

el.copyPicks.onclick = async () => {
  const lines = index.items
    .filter((i) => picks.has(i.id))
    .map((i) => `${i.packId.padEnd(11)} ${i.name.padEnd(28)} ${String(i.triangles).padStart(6)} tris  ${i.url.replace('/asset-src/', '')}`);
  const text = `Picked assets (${picks.size}):\n\n${lines.join('\n')}\n`;
  try {
    await navigator.clipboard.writeText(text);
    el.copyPicks.textContent = 'Copied';
    setTimeout(() => (el.copyPicks.textContent = 'Copy pick list'), 1400);
  } catch {
    // Clipboard needs a secure context; print it so the list is never lost.
    console.log(text);
    el.copyPicks.textContent = 'See console';
    setTimeout(() => (el.copyPicks.textContent = 'Copy pick list'), 1800);
  }
};

el.clearPicks.onclick = () => {
  picks.clear();
  writePicks(picks);
  syncFooter();
  renderGrid();
};

// ---- filters -----------------------------------------------------------

function chip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = label;
  if (active) b.dataset['on'] = '1';
  b.onclick = onClick;
  return b;
}

function renderFilters(): void {
  el.packs.replaceChildren(
    chip('all packs', filters.pack === 'all', () => {
      filters.pack = 'all';
      filters.category = 'all';
      renderFilters();
      renderGrid();
    }),
    ...index.packs.map((p) =>
      chip(`${p.label} (${p.count})`, filters.pack === p.id, () => {
        filters.pack = p.id;
        filters.category = 'all';
        renderFilters();
        renderGrid();
      }),
    ),
  );

  const pool =
    filters.pack === 'all' ? index.items : index.items.filter((i) => i.packId === filters.pack);
  const cats = [...new Set(pool.map((i) => i.category))].sort();

  el.cats.replaceChildren(
    ...(cats.length > 1
      ? [
          chip('all kinds', filters.category === 'all', () => {
            filters.category = 'all';
            renderFilters();
            renderGrid();
          }),
          ...cats.map((c) =>
            chip(c, filters.category === c, () => {
              filters.category = c;
              renderFilters();
              renderGrid();
            }),
          ),
        ]
      : []),
  );
}

el.search.addEventListener('input', () => {
  filters.query = el.search.value;
  renderGrid();
});

function setSort(which: string): void {
  filters.sort = which;
  for (const [key, btn] of [
    ['name', el.sortName],
    ['tris', el.sortTris],
    ['bytes', el.sortBytes],
  ] as const) {
    if (key === which) btn.dataset['on'] = '1';
    else btn.removeAttribute('data-on');
  }
  renderGrid();
}

el.sortName.onclick = () => setSort('name');
el.sortTris.onclick = () => setSort('tris');
el.sortBytes.onclick = () => setSort('bytes');

el.showPicks.onclick = () => {
  filters.picksOnly = !filters.picksOnly;
  if (filters.picksOnly) el.showPicks.dataset['on'] = '1';
  else el.showPicks.removeAttribute('data-on');
  renderGrid();
};

// ---- recolour ----------------------------------------------------------

/**
 * Per-mesh tint. The characters are already split into Body, Cape, Head, Mask,
 * Arms and Legs, so tinting per mesh gives per-part control without touching
 * the atlas or editing UVs — and leaves the skin alone by simply not tinting
 * the head and arms.
 */
interface TintRow {
  mesh: Mesh;
  name: string;
  original: number;
}

let tintRows: TintRow[] = [];

const PRESETS: Record<string, Record<string, string>> = {
  matthew: { Body: '#2f6fd0', Cape: '#1f4f9c', Legs: '#24467e', Mask: '#1a1f2b' },
  aurora: { Body: '#7a46c8', Cape: '#5a2f9e', Hat: '#5a2f9e', Legs: '#43307a' },
};

function buildRecolour(object: Object3D): void {
  tintRows = [];
  el.recolourRows.replaceChildren();

  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshStandardMaterial;
    if (!material?.color) return;
    // Clone per mesh so a tint on one part never leaks into another that
    // happens to share the source material.
    if (!mesh.userData['tintCloned']) {
      mesh.material = material.clone();
      mesh.userData['tintCloned'] = true;
    }
    const cloned = mesh.material as MeshStandardMaterial;
    tintRows.push({ mesh, name: shortPart(mesh.name), original: cloned.color.getHex() });
  });

  el.recolour.hidden = tintRows.length === 0;

  for (const row of tintRows) {
    const wrap = document.createElement('label');
    wrap.className = 'swatch-row';

    const label = document.createElement('span');
    label.textContent = row.name;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = `#${row.original.toString(16).padStart(6, '0')}`;
    input.oninput = () => {
      (row.mesh.material as MeshStandardMaterial).color.set(input.value);
    };

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'reset';
    reset.onclick = (e) => {
      e.preventDefault();
      (row.mesh.material as MeshStandardMaterial).color.setHex(row.original);
      input.value = `#${row.original.toString(16).padStart(6, '0')}`;
    };

    wrap.append(label, input, reset);
    el.recolourRows.append(wrap);
  }
}

/** `RogueHooded_ArmLeft` -> `ArmLeft`, so rows read as body parts. */
function shortPart(name: string): string {
  const i = name.indexOf('_');
  return i === -1 ? name : name.slice(i + 1);
}

function applyPreset(which: string): void {
  const preset = PRESETS[which];
  if (!preset) return;
  for (const row of tintRows) {
    const hex = preset[row.name];
    const material = row.mesh.material as MeshStandardMaterial;
    if (hex) material.color.set(hex);
    else material.color.setHex(row.original);
  }
  // Re-render the inputs so their swatches match what is on screen.
  const inputs = el.recolourRows.querySelectorAll('input[type="color"]');
  tintRows.forEach((row, i) => {
    const input = inputs[i] as HTMLInputElement | undefined;
    if (input) input.value = `#${(row.mesh.material as MeshStandardMaterial).color.getHexString()}`;
  });
}

el.presetMatthew.onclick = () => applyPreset('matthew');
el.presetAurora.onclick = () => applyPreset('aurora');
el.recolourReset.onclick = () => {
  for (const row of tintRows) {
    (row.mesh.material as MeshStandardMaterial).color.setHex(row.original);
  }
  const inputs = el.recolourRows.querySelectorAll('input[type="color"]');
  tintRows.forEach((row, i) => {
    const input = inputs[i] as HTMLInputElement | undefined;
    if (input) input.value = `#${row.original.toString(16).padStart(6, '0')}`;
  });
};
el.recolourCopy.onclick = async () => {
  const lines = tintRows.map(
    (r) => `  ${r.name.padEnd(12)} #${(r.mesh.material as MeshStandardMaterial).color.getHexString()}`,
  );
  const text = `Palette:\n${lines.join('\n')}\n`;
  try {
    await navigator.clipboard.writeText(text);
    el.recolourCopy.textContent = 'Copied';
  } catch {
    console.log(text);
    el.recolourCopy.textContent = 'See console';
  }
  setTimeout(() => (el.recolourCopy.textContent = 'Copy palette'), 1400);
};

// ---- scale comparison --------------------------------------------------

/**
 * A correctly scaled Matthew standing beside the asset. "Is the water tower
 * the right size" is unanswerable from a thumbnail, and getting it wrong is
 * the bug the headless check caught in the game itself.
 */
async function scaleReference(): Promise<Object3D> {
  if (scaleRef) return scaleRef;
  const { object } = await loadModel(SOURCES.characters.matthew);
  const ref = object.clone(true);
  const box = new Box3().setFromObject(ref);
  const height = box.getSize(new Vector3()).y;
  if (height > 0) ref.scale.setScalar(CHARACTER_HEIGHT / height);
  const scaled = new Box3().setFromObject(ref);
  ref.position.y -= scaled.min.y;
  scaleRef = ref;
  return ref;
}

el.toggleScale.onclick = async () => {
  showScale = !showScale;
  if (showScale) el.toggleScale.dataset['on'] = '1';
  else el.toggleScale.removeAttribute('data-on');
  if (showScale) await scaleReference();
};

el.toggleSparkle.onclick = () => {
  showSparkle = !showSparkle;
  if (showSparkle) el.toggleSparkle.dataset['on'] = '1';
  else el.toggleSparkle.removeAttribute('data-on');
};

// ---- plan view ---------------------------------------------------------

const LEVEL_LABEL: Record<string, string> = {
  all: 'Characters and shared',
  '1': 'Level 1 — The Gift Vault',
  '2': 'Level 2 — Skyline Chase',
  '3': 'Level 3 — The Cake Thief',
};

function renderPlan(): void {
  el.plan.replaceChildren();
  el.count.textContent = `${PLAN.length} roles · ${PLAN.filter((p) => !p.assetId).length} procedural`;

  for (const level of ['all', '1', '2', '3'] as const) {
    const rows = PLAN.filter((p) => String(p.level) === level);
    if (!rows.length) continue;

    const group = document.createElement('section');
    group.className = 'plan-group';
    const h = document.createElement('h2');
    h.textContent = LEVEL_LABEL[level] ?? level;
    const list = document.createElement('div');
    list.className = 'plan-rows';

    for (const planned of rows) list.append(planRow(planned));
    group.append(h, list);
    el.plan.append(group);
  }
}

function planRow(planned: PlannedAsset): HTMLElement {
  const row = document.createElement('article');
  row.className = 'plan-row';

  const item = planned.assetId ? index.items.find((i) => i.id === planned.assetId) : undefined;

  if (item) {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB;
    canvas.height = THUMB;
    canvas.title = 'Open for detail, recolour and scale comparison';
    canvas.onclick = () => void openDetail(item);
    row.append(canvas);
    void renderThumb(item, canvas).catch((e) => console.error('[plan]', planned.role, e));
  } else {
    const box = document.createElement('div');
    box.className = 'plan-row__proc';
    box.textContent = planned.assetId ? 'missing from index' : 'built in code';
    row.append(box);
  }

  const body = document.createElement('div');

  const role = document.createElement('div');
  role.className = 'plan-row__role';
  role.textContent = planned.role;

  const asset = document.createElement('div');
  asset.className = 'plan-row__asset';
  asset.textContent = planned.assetId ?? 'procedural';

  const note = document.createElement('p');
  note.className = 'plan-row__note';
  note.textContent = planned.note;

  const tags = document.createElement('div');
  tags.className = 'plan-row__tags';
  const status = document.createElement('span');
  status.className = `tag${planned.status === 'procedural' ? ' tag--procedural' : ''}`;
  status.textContent = planned.status;
  tags.append(status);
  if (item) {
    const cost = document.createElement('span');
    cost.className = 'tag';
    cost.textContent = `${item.triangles.toLocaleString()} tris · ${kb(item.bytes)}`;
    tags.append(cost);
  }
  for (const clip of planned.clips ?? []) {
    const c = document.createElement('span');
    c.className = 'tag tag--clip';
    c.textContent = clip;
    tags.append(c);
  }

  body.append(role, asset, note, tags);
  row.append(body);
  return row;
}

// ---- effects view ------------------------------------------------------

interface FxPreview {
  name: string;
  note: string;
  build: () => { object: Object3D; update: (step: number) => void; dispose: () => void };
}

const FX: FxPreview[] = [
  {
    name: 'Thief sparkle',
    note: 'Marks anything interactable. Blue is Matthew\u2019s and means take it. Particles orbit on independent phases so the cloud never reads as a rigid ring.',
    build: () => {
      const s = new Sparkle({ count: 16, radius: 0.5, rise: 0.7 });
      return { object: s.points, update: (d) => s.update(d), dispose: () => s.dispose() };
    },
  },
  {
    name: 'Laser barrier',
    note: 'The primary hazard. Magenta is Aurora\u2019s colour, so a laser reads as her trap rather than generic danger. Two crossed quads keep it solid from the shallow gameplay camera angle, where a single flat quad would vanish edge-on.',
    build: () => {
      const l = new LaserBarrier({ width: 1.5 });
      return { object: l.group, update: (d) => l.update(d), dispose: () => l.dispose() };
    },
  },
  {
    name: 'Searchlight — sweeping',
    note: 'Guard telegraph before it commits. Drifts across the full lane span so the threat is legible early.',
    build: () => {
      const s = new Searchlight();
      s.sweep();
      return { object: s.group, update: (d) => s.update(d), dispose: () => s.dispose() };
    },
  },
  {
    name: 'Searchlight — locked',
    note: 'Committed to a lane and pulsing. The lock happens first and visibly, so the strike never targets a lane based on last-moment input.',
    build: () => {
      const s = new Searchlight();
      s.lockTo(2);
      return { object: s.group, update: (d) => s.update(d), dispose: () => s.dispose() };
    },
  },
  {
    name: 'Magic orb',
    note: 'The level 2 moving hazard. Aurora throws these during the chase, so it is her magenta and shares the sparkle system. Replaces the lantern, which read as set dressing.',
    build: () => {
      const o = new MagicOrb();
      return { object: o.group, update: (d) => o.update(d), dispose: () => o.dispose() };
    },
  },
  {
    name: 'The cake',
    note: 'Red velvet, white frosting, six lit candles — straight from Aurora\u2019s reference. The entire plot object, and nothing in any pack resembled one.',
    build: () => {
      const cake = buildCake();
      return { object: cake, update: () => {}, dispose: () => cake.removeFromParent() };
    },
  },
  {
    name: 'Aurora\u2019s crown',
    note: 'Gold spiked crown from the reference, replacing the Mage hat. Alternating tall and short points are what read as a crown rather than a cog at distance.',
    build: () => {
      const crown = buildCrown(0.26);
      return { object: crown, update: () => {}, dispose: () => crown.removeFromParent() };
    },
  },
  {
    name: 'CN Tower',
    note: 'In both reference images, and what makes the skyline Toronto rather than a generic city. The observation pod is the identifying detail.',
    build: () => {
      const tower = buildCnTower(14);
      return { object: tower, update: () => {}, dispose: () => tower.removeFromParent() };
    },
  },
  {
    name: 'Mask emblem',
    note: 'Matthew\u2019s gold bandit-mask logo — his title treatment, and a banner in Aurora\u2019s image. Goes on the vault door, and is available for the HUD.',
    build: () => {
      const emblem = buildMaskEmblem(1);
      return { object: emblem, update: () => {}, dispose: () => emblem.removeFromParent() };
    },
  },
  {
    name: 'Vault door',
    note: 'The level 1 route endpoint. The emblem is sized against the door and the dial stands proud of the wall \u2014 the first version buried the dial and used a postage-stamp emblem on a blank slab.',
    build: () => {
      // buildVaultDoor places its own emblem, sized to the door.
      const vault = buildVaultDoor(2.4, 1.7);
      return { object: vault, update: () => {}, dispose: () => vault.removeFromParent() };
    },
  },
  {
    name: 'Grapple cable',
    note: 'Gold cable from a wrist gadget, as in the reference, with the candy-cane crook at the anchor end. A chain of tapered segments bowed along a parabola, so it reads as one curved cable; scratch vectors mean a swing allocates nothing.',
    build: () => {
      const group = new Group();
      const gadget = new Object3D();
      const anchor = new Object3D();
      anchor.position.set(1.1, 1.3, 0);
      group.add(gadget, anchor);
      const cable = new GrappleCable();
      group.add(cable.group);
      let t = 0;
      return {
        object: group,
        update: (d) => {
          t += d;
          // Swing the anchor so the restretch is visible.
          anchor.position.set(Math.cos(t) * 1.1, 1.1 + Math.sin(t * 0.7) * 0.4, 0);
          group.updateMatrixWorld(true);
          cable.setSpan(gadget, anchor);
        },
        dispose: () => cable.dispose(),
      };
    },
  },
  {
    name: 'Confetti',
    note: 'Gold flecks from both references. Capped and pooled, and decorative only — the doc is explicit that confetti is never a physical damage object.',
    build: () => {
      const c = new Confetti(40);
      let t = 99;
      return {
        object: c.group,
        update: (d) => {
          t += d;
          // Re-burst on a loop so the preview always shows something.
          if (t > 3) {
            t = 0;
            c.burst(new Vector3(0, 0.2, 0));
          }
          c.update(d);
        },
        dispose: () => c.dispose(),
      };
    },
  },
];

let fxRaf = 0;
const fxLive: { update: (d: number) => void; dispose: () => void }[] = [];

function stopEffects(): void {
  cancelAnimationFrame(fxRaf);
  fxRaf = 0;
  for (const fx of fxLive) fx.dispose();
  fxLive.length = 0;
}

function renderEffects(): void {
  stopEffects();
  el.fxRow.replaceChildren();
  el.count.textContent = `${FX.length} procedural effects`;

  const cards: { canvas: HTMLCanvasElement; object: Object3D }[] = [];

  for (const fx of FX) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fx-card';
    card.title = 'Open larger, with the scale comparison';
    card.addEventListener('click', () => void openCustomDetail(fx));
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const meta = document.createElement('div');
    meta.className = 'fx-card__meta';
    const name = document.createElement('div');
    name.className = 'fx-card__name';
    name.textContent = fx.name;
    const note = document.createElement('p');
    note.className = 'fx-card__note';
    note.textContent = fx.note;
    meta.append(name, note);
    card.append(canvas, meta);
    el.fxRow.append(card);

    const built = fx.build();
    fxLive.push(built);
    cards.push({ canvas, object: built.object });
  }

  let last = performance.now();
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const fx of fxLive) fx.update(dt);

    for (const [i, card] of cards.entries()) {
      holder.clear();
      holder.add(card.object);
      renderer.setSize(300, 300, false);
      // Low, close camera: the gameplay viewing angle, where a flat effect
      // would betray itself.
      const yaw = 0.5 + Math.sin(now / 5000 + i) * 0.35;
      frame(card.object, yaw, 0.2);
      renderer.render(scene, camera);
      holder.clear();

      copyToCanvas(card.canvas, 300);
    }
    fxRaf = requestAnimationFrame(tick);
  };
  fxRaf = requestAnimationFrame(tick);
}

/**
 * Open a procedural asset in the detail panel.
 *
 * Custom assets were previously only viewable as small static cards you had
 * to scroll past, which is not enough to judge one. This gives them the same
 * treatment as a pack asset: a large auto-rotating view, the scale comparison
 * against Matthew, and the sparkle toggle.
 */
async function openCustomDetail(fx: FxPreview): Promise<void> {
  stopDetail();
  el.detail.hidden = false;
  el.detailName.textContent = fx.name;
  el.detailClips.replaceChildren();
  el.recolour.hidden = true;

  const built = fx.build();
  detailObject = built.object;
  detailCustom = built;

  el.detailStats.replaceChildren();
  for (const [k, v] of [
    ['kind', 'procedural'],
    ['source', 'src/render/custom.ts or effects.ts'],
    ['note', fx.note],
  ] as [string, string][]) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    el.detailStats.append(dt, dd);
  }

  el.detailPick.textContent = 'Built in code';
  el.detailPick.onclick = null;

  if (showScale) await scaleReference();

  detailLast = performance.now();
  const spin = (now: number): void => {
    if (!detailObject) return;
    const dt = Math.min((now - detailLast) / 1000, 0.1);
    detailLast = now;
    detailCustom?.update(dt);

    holder.clear();
    holder.add(detailObject);
    if (showScale && scaleRef) {
      const box = new Box3().setFromObject(detailObject);
      const size = box.getSize(new Vector3());
      scaleRef.position.x = box.max.x + Math.max(size.x * 0.2, 0.4) + 0.4;
      holder.add(scaleRef);
    }

    const px = Math.min(el.detailCanvas.clientWidth || 420, 560);
    renderer.setSize(px, px, false);
    frame(detailObject, (now / 4000) % (Math.PI * 2), 0.22);
    renderer.render(scene, camera);
    holder.clear();

    copyToCanvas(el.detailCanvas, px);
    detailRaf = requestAnimationFrame(spin);
  };
  detailRaf = requestAnimationFrame(spin);
}

// ---- view switching ----------------------------------------------------

type View = 'plan' | 'browse' | 'effects';

function setView(next: View): void {
  stopDetail();
  stopEffects();
  el.detail.hidden = true;

  for (const [key, btn] of [
    ['plan', el.tabPlan],
    ['browse', el.tabBrowse],
    ['effects', el.tabEffects],
  ] as const) {
    if (key === next) btn.dataset['on'] = '1';
    else btn.removeAttribute('data-on');
  }

  el.plan.hidden = next !== 'plan';
  el.grid.hidden = next !== 'browse';
  el.effects.hidden = next !== 'effects';
  el.browseControls.hidden = next !== 'browse';

  if (next === 'plan') renderPlan();
  if (next === 'browse') renderGrid();
  if (next === 'effects') renderEffects();
}

el.tabPlan.onclick = () => setView('plan');
el.tabBrowse.onclick = () => setView('browse');
el.tabEffects.onclick = () => setView('effects');

// ---- boot --------------------------------------------------------------

async function boot(): Promise<void> {
  const res = await fetch('/asset-index.json');
  if (!res.ok) {
    el.count.textContent = 'asset-index.json missing — run: npm run assets:index';
    return;
  }
  index = (await res.json()) as AssetIndex;

  const totalTris = index.items.reduce((a, i) => a + i.triangles, 0);
  el.note.textContent =
    `${index.packs.length} packs, ${index.items.length} models, ` +
    `${totalTris.toLocaleString()} triangles indexed. Rigged models all share the ` +
    `Rig_Medium skeleton, so clips and props are interchangeable. ${index.license}`;

  renderFilters();
  syncFooter();
  // The plan is the thing to review; browsing all 178 models is the fallback.
  setView('plan');
}

void boot();
