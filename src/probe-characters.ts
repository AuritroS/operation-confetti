/**
 * Phase 1 asset feasibility harness (design doc §12).
 *
 * Runs outside the gameplay build. Loads the pinned Rogue_Hooded and Mage,
 * transplants clips from the Rig_Medium libraries, attaches the blaster to
 * `handslot.r`, and lets every clip be played at gameplay camera distance so
 * animation, skinning, orientation, attachments and phone-scale silhouette can
 * all be signed off before any presentation work starts.
 */
import { Mesh, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three';
import { FixedLoop } from './core/loop';
import { Stage } from './render/stage';
import { RendererHost } from './render/renderer-host';
import { DebugPanel } from './ui/hud';
import { AssetBundle, type Actor } from './assets/characters';
import { ASSET_VERSION, ATTACH_NODES, CLIPS, SOURCES } from './assets/manifest';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ui = document.getElementById('probe-ui') as HTMLElement;
const debug = new DebugPanel();

const stage = new Stage(new RendererHost(canvas));
stage.observe();
// Gameplay camera distance: this is the silhouette that has to read on a phone.
stage.camera.position.set(0, 1.9, 4.4);
stage.camera.lookAt(0, 0.95, 0);

const ground = new Mesh(
  new PlaneGeometry(14, 14),
  new MeshStandardMaterial({ color: 0x27354f, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
stage.scene.add(ground);

const bundle = new AssetBundle();
let matthew: Actor | null = null;
let aurora: Actor | null = null;
let blaster: Object3D | null = null;
let attachOk = false;
let status = 'loading…';

const loop = new FixedLoop({
  update: (step) => {
    matthew?.update(step);
    aurora?.update(step);
  },
  render: () => {
    stage.render();
    debug.set({
      status,
      version: ASSET_VERSION,
      clips: bundle.clips.size,
      blaster: attachOk ? 'attached' : 'not attached',
      draws: stage.drawCalls,
      tris: stage.triangles,
      fps: loop.stats.fps,
    });
  },
});

async function boot(): Promise<void> {
  const paths = [
    SOURCES.characters.matthew,
    SOURCES.characters.aurora,
    ...SOURCES.animationLibraries,
  ];

  try {
    await bundle.loadAll(paths, (done, total, label) => {
      status = `loading ${done}/${total}`;
      console.info('[probe] loaded', label);
    });
  } catch (e) {
    status = `LOAD FAILED: ${String(e)}`;
    console.error(e);
    loop.start();
    return;
  }

  matthew = bundle.actor(SOURCES.characters.matthew);
  matthew.root.position.x = -0.85;
  stage.scene.add(matthew.root);

  aurora = bundle.actor(SOURCES.characters.aurora);
  aurora.root.position.x = 0.85;
  aurora.root.rotation.y = Math.PI;
  stage.scene.add(aurora.root);

  // The prop is optional: an unstaged blaster must not prevent reviewing
  // either character or any of the already loaded animation clips.
  try {
    await bundle.loadAll([SOURCES.props.blaster]);
    blaster = bundle.get(SOURCES.props.blaster).scene.clone(true);
    attachOk = matthew.attach(ATTACH_NODES.handRight, blaster);
  } catch {
    console.warn('[probe] Optional blaster unavailable; character animations remain available.');
  }

  matthew.play(CLIPS.matthew.idle);
  aurora.play(CLIPS.aurora.idle);

  status = `ok — ${bundle.clips.size} clips`;
  buildControls();
  loop.start();

  // Surface the real metrics the Phase 1 gate asks for.
  console.table(
    bundle.clipNames().map((name) => ({
      clip: name,
      usedBy: roleFor(name).join(', ') || '—',
    })),
  );
}

function roleFor(clip: string): string[] {
  const out: string[] = [];
  for (const [actor, map] of Object.entries(CLIPS)) {
    for (const [role, name] of Object.entries(map)) {
      if (name === clip) out.push(`${actor}.${role}`);
    }
  }
  return out;
}

function buildControls(): void {
  ui.replaceChildren();

  for (const name of bundle.clipNames()) {
    const b = document.createElement('button');
    const roles = roleFor(name);
    b.textContent = roles.length ? `${name} *` : name;
    b.title = roles.join(', ');
    b.addEventListener('click', () => {
      matthew?.play(name);
      aurora?.play(name);
      for (const el of ui.querySelectorAll('button')) el.removeAttribute('data-on');
      b.dataset.on = '1';
    });
    ui.append(b);
  }

  const toggle = document.createElement('button');
  toggle.textContent = blaster ? 'blaster' : 'blaster unavailable';
  toggle.disabled = !blaster;
  toggle.dataset.on = attachOk ? '1' : '0';
  toggle.addEventListener('click', () => {
    if (!blaster || !matthew) return;
    if (blaster.parent) {
      blaster.removeFromParent();
      toggle.dataset.on = '0';
    } else {
      attachOk = matthew.attach(ATTACH_NODES.handRight, blaster);
      toggle.dataset.on = attachOk ? '1' : '0';
    }
  });
  ui.append(toggle);
}

debug.setVisible(true);
void boot();
