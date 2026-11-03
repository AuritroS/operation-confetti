/**
 * Atmosphere: gold flecks drifting through the scene.
 *
 * Both reference images have confetti in the air, and a little drift stops
 * the world feeling like a static diorama between hazards.
 *
 * Strictly decorative, capped, and gated on `prefers-reduced-motion` — the
 * design doc asks for reduced-motion behaviour on shake, zoom and confetti
 * (§12 Phase 5), and drifting particles are the same class of thing.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
} from 'three';
import { PALETTE } from '../palette';
import type { EnvironmentLayer } from './layer';

const COUNT = 60;
const FIELD_Z = 70;
const FIELD_X = 16;
const FIELD_Y = 14;

export class AtmosphereLayer implements EnvironmentLayer {
  readonly id = 'atmosphere' as const;
  readonly object = new Group();

  private readonly points: Points;
  private readonly drift: number[] = [];
  private readonly reduced: boolean;
  private time = 0;

  constructor() {
    // Guarded: matchMedia is absent in some embedding contexts, and a missing
    // accessibility query should degrade to "animate normally", never throw
    // and take the whole environment down with it.
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * FIELD_X;
      positions[i * 3 + 1] = Math.random() * FIELD_Y;
      positions[i * 3 + 2] = -Math.random() * FIELD_Z;
      this.drift.push(0.35 + Math.random() * 0.8);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: new Color(PALETTE.gold),
        size: 0.09,
        transparent: true,
        opacity: this.reduced ? 0.25 : 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.object.add(this.points);
  }

  update(travelled: number, step: number): void {
    // Reduced motion keeps the flecks but stops them moving, so the scene
    // still reads as inhabited without anything drifting in the periphery.
    if (this.reduced) return;

    this.time += step;
    const attr = this.points.geometry.getAttribute('position') as Float32BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let y = attr.getY(i) - (this.drift[i] ?? 0.5) * step;
      if (y < -1) y += FIELD_Y + 1;
      attr.setY(i, y);
      attr.setX(i, attr.getX(i) + Math.sin(this.time * 0.6 + i) * step * 0.12);
    }
    attr.needsUpdate = true;

    // Ride with the player so the field never runs out behind.
    this.points.position.z = travelled % FIELD_Z;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    this.points.removeFromParent();
    this.object.removeFromParent();
  }
}
