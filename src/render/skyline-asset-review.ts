/** Inventory of assets used by the real layout and obstacle builders. */
import { Group, type Object3D } from 'three';
import { SCENE } from '../levels/skyline/scene';
import { SKYLINE } from '../levels/skyline/course';
import { SOURCES } from '../assets/manifest';
import type { StreetAssets } from './skyline-assets';
import type { SkylineHero } from './skyline-hero';
import { ANCHOR_PROPS, STREET_PROPS, STREET_PROP_IDS, type StreetPropId } from './skyline-props';
import { ObstacleKit } from './skyline-obstacles';
import { SkylineStreet } from './skyline-street';
import { buildSkylineLandmark } from './skyline-scene';
import { resolveFacing } from './skyline-resolve';

export interface AssetReviewItem {
  id: string;
  name: string;
  role: string;
  source: string;
  model: Object3D | null;
  contexts: { name: string; model: Object3D }[];
}

const names: Record<string, string> = {
  towerA: 'Building A', towerC: 'Building C', towerE: 'Building E', towerG: 'Building G',
  road: 'Straight road', roadCrossing: 'Pedestrian crossing', lowAnchor: 'Landing marking',
  anchorSpan: 'Overhead wire support', bridgeDeck: 'Bridge deck', bridgePillar: 'Bridge pillar',
  signHanging: 'Hanging sign', barrier: 'Construction barrier', cone: 'Traffic cone',
  workLight: 'Construction beacon', dumpster: 'Dumpster', streetlight: 'Curved streetlight',
  trafficLight: 'Traffic light', streetSign: 'Street sign', gift: 'Yellow gift',
  // Candidate assets
  signGantry: 'Highway Gantry (Wide)',
  signHighway: 'Highway Gantry (Standard)',
  signHighwayDetailed: 'Highway Gantry (Detailed)',
  lightHanging: 'Hanging Traffic Light',
  trafficLightHoriz: 'Horizontal Traffic Light Head',
  trafficLightVert: 'Vertical Traffic Light Head',
  signWarningDiamond: 'Warning Diamond Face',
  signStopOctagon: 'STOP Sign Face',
  signWarningPost: 'Warning Sign Post',
  signStopPost: 'STOP Sign Post',
  fence: 'Construction Wire Fence',
};

const candidateRoles: Partial<Record<StreetPropId, string>> = {
  signGantry: 'Candidate · Overhead full-width gantry (wide)',
  signHighway: 'Candidate · Overhead full-width gantry (standard)',
  signHighwayDetailed: 'Candidate · Overhead full-width gantry (detailed with catwalk)',
  lightHanging: 'Candidate · Overhead single-lane hanging signal',
  trafficLightHoriz: 'Candidate · Overhead single-lane flat horizontal light head',
  trafficLightVert: 'Candidate · Overhead single-lane flat vertical light head',
  signWarningDiamond: 'Candidate · Overhead single-lane flat warning diamond face',
  signStopOctagon: 'Candidate · Overhead single-lane flat STOP octagon face',
  signWarningPost: 'Candidate · Overhead single-lane warning sign on post',
  signStopPost: 'Candidate · Overhead single-lane STOP sign on post',
  fence: 'Candidate · Ground construction wire fence',
};

const candidateIds: readonly StreetPropId[] = [
  'signGantry',
  'signHighway',
  'signHighwayDetailed',
  'lightHanging',
  'trafficLightHoriz',
  'trafficLightVert',
  'signWarningDiamond',
  'signStopOctagon',
  'signWarningPost',
  'signStopPost',
  'fence',
];
const assemblyNames = { laneBlock: 'Lane blocker', barricade: 'Full-width barricade',
  bridge: 'Bridge', hangingSign: 'Overhead sign', gift: 'Gift' } as const;

export function buildAssetReview(assets: StreetAssets, hero: SkylineHero | null) {
  const usage = new Map<StreetPropId, Set<string>>();
  const contexts = new Map<StreetPropId, AssetReviewItem['contexts']>();
  const assemblies: Object3D[] = [];
  const record = (id: StreetPropId, role: string) => {
    const list = usage.get(id) ?? new Set<string>(); list.add(role); usage.set(id, list);
  };
  for (const p of SCENE.objects) record(p.prop as StreetPropId, 'Street');
  record(ANCHOR_PROPS.upper, 'Swing anchors');
  record(ANCHOR_PROPS.lower, 'Landing anchors');

  // Record calls made by the production builder, rather than maintaining a
  // second list of parts for every assembly. Include only assemblies in use.
  const seen = new Set<string>();
  for (const e of SKYLINE.entities) {
    if (seen.has(e.assembly)) continue;
    seen.add(e.assembly);
    const parts = new Set<StreetPropId>();
    const traced: StreetAssets = { ...assets, prop(id) {
      record(id, assemblyNames[e.assembly]); parts.add(id); return assets.prop(id);
    } };
    const kit = new ObstacleKit(traced);
    const model = e.kind === 'gift' ? kit.gift(e) : kit.hazard(e);
    if (!model) continue;
    assemblies.push(model);
    for (const id of parts) {
      const list = contexts.get(id) ?? [];
      list.push({ name: assemblyNames[e.assembly], model }); contexts.set(id, list);
    }
  }

  const items: AssetReviewItem[] = [{ id: 'matthew', name: 'Matthew', role: 'Player character',
    source: SOURCES.characters.matthew, model: hero?.object ?? null, contexts: [] }];
  for (const id of STREET_PROP_IDS.filter(id => usage.has(id))) {
    const spec = STREET_PROPS[id];
    const model = assets.prop(id);
    if (model) {
      const front = 'front' in spec;
      model.rotation.y = resolveFacing(spec, front ? { faces: 'oncoming' } : { spans: 'across' }, 0);
    }
    items.push({ id, name: names[id] ?? id, role: [...usage.get(id)!].join(' · '),
      source: spec.url, model, contexts: contexts.get(id) ?? [] });
  }

  // Candidate assets for review
  for (const id of candidateIds) {
    if (usage.has(id)) continue;
    const spec = STREET_PROPS[id];
    const model = assets.prop(id);
    if (model) {
      const front = 'front' in spec;
      model.rotation.y = resolveFacing(spec, front ? { faces: 'oncoming' } : { spans: 'across' }, 0);
    }
    items.push({
      id,
      name: names[id] ?? id,
      role: candidateRoles[id] ?? 'Candidate',
      source: spec.url,
      model,
      contexts: contexts.get(id) ?? [],
    });
  }

  // Review the actual procedural cable builder, using one real span.
  const wire = SCENE.wires[0];
  let street: SkylineStreet | null = null;
  if (wire) {
    street = new SkylineStreet(assets, { objects: SCENE.objects.filter(p =>
      p.id === wire.from.on || p.id === wire.to.on), wires: [wire], anchors: [], landings: [], encounters: [] });
    const cable = new Group();
    for (const child of street.object.children) if (child.type === 'LineSegments') cable.add(child.clone());
    items.push({ id: 'streetWires', name: 'Streetcar cables', role: 'Cables between the buildings',
      source: 'Built in the scene', model: cable.children.length ? cable : null, contexts: [] });
  }
  const landmark = buildSkylineLandmark();
  items.push({ id: 'cnTower', name: 'CN Tower', role: 'Background landmark', source: 'Built in the scene',
    model: landmark, contexts: [] });
  return { items, assemblies, dispose: () => street?.dispose() };
}
