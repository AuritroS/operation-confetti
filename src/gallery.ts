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
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  AnimationMixer,
  type AnimationClip,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

const renderer = new WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(THUMB, THUMB, false);
renderer.setClearColor(new Color('#121a28'), 1);

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
  modelCache.set(url, gltf.scene);
  clipCache.set(url, gltf.animations);
  return { object: gltf.scene, clips: gltf.animations };
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

/** Render one model into a destination 2D canvas. */
async function renderThumb(item: AssetItem, target: HTMLCanvasElement): Promise<void> {
  const { object } = await loadModel(item.url);

  holder.clear();
  holder.add(object);
  renderer.setSize(THUMB, THUMB, false);
  frame(object, 0.7);
  renderer.render(scene, camera);
  holder.clear();

  const ctx = target.getContext('2d');
  if (!ctx) return;
  target.width = THUMB;
  target.height = THUMB;
  ctx.drawImage(renderer.domElement, 0, 0, THUMB, THUMB);
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

function stopDetail(): void {
  cancelAnimationFrame(detailRaf);
  detailRaf = 0;
  detailMixer?.stopAllAction();
  detailMixer = null;
  detailObject = null;
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

  const { object, clips } = await loadModel(item.url);
  detailObject = object;

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
    const size = Math.min(el.detailCanvas.clientWidth || 420, 560);
    renderer.setSize(size, size, false);
    frame(detailObject, (now / 4000) % (Math.PI * 2));
    renderer.render(scene, camera);
    holder.clear();

    const ctx = el.detailCanvas.getContext('2d');
    if (ctx) {
      el.detailCanvas.width = size;
      el.detailCanvas.height = size;
      ctx.drawImage(renderer.domElement, 0, 0, size, size);
    }
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
    `${index.license} All models share the Rig_Medium skeleton where rigged, ` +
    `so clips and props are interchangeable. ${totalTris.toLocaleString()} triangles indexed in total.`;

  renderFilters();
  renderGrid();
  syncFooter();
}

void boot();
