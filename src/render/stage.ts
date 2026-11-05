/**
 * Renderer, camera and resize handling (design doc §11).
 *
 * Portrait-first sizing, pixel ratio capped at 1.5, hemisphere + directional
 * light only, no postprocessing.
 */
import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
} from 'three';
import { PALETTE } from './palette';
import { MAX_PIXEL_RATIO, type RendererHost } from './renderer-host';

export { MAX_PIXEL_RATIO };

/** Exponential fog density. Exported so spawn distances can be checked. */
export const FOG_DENSITY = 0.013;

/**
 * The outdoor look levels 1 and 2 share: fogged night, three lights, no
 * postprocessing. It no longer owns a renderer — `RendererHost` does — so two
 * levels can hand the same renderer different scenes without leaking a GL
 * context on every transition.
 */
export class Stage {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  private unobserve: (() => void) | null = null;

  constructor(private readonly host: RendererHost) {
    this.host.renderer.setClearColor(new Color(PALETTE.ink), 1);

    this.scene = new Scene();
    this.scene.background = new Color(PALETTE.ink);
    /**
     * Exponential rather than linear.
     *
     * Linear fog has a hard onset: nothing is fogged at 44 units and fog
     * begins abruptly at 45, and that discontinuity is visible as a band
     * where the world suddenly starts to fade. Exp2 falls off smoothly from
     * the camera with no onset at all, for identical shader cost.
     *
     * At this density: ~35% fogged at 50 units, ~85% at 100, ~99% at 160 —
     * so anything spawning past 130 is invisible when it appears and fades
     * in rather than popping. The skyline opts out of fog entirely, because
     * a backdrop this dense would erase it.
     */
    this.scene.fog = new FogExp2(PALETTE.ink, FOG_DENSITY);

    this.camera = new PerspectiveCamera(58, 1, 0.1, 160);

    const hemi = new HemisphereLight(PALETTE.cyan, PALETTE.navyDeep, 0.85);
    this.scene.add(hemi);

    // Warm key, standing in for the city's window light.
    const key = new DirectionalLight(PALETTE.orangeWarm, 1.15);
    key.position.set(4, 9, 5);
    this.scene.add(key);

    // Rim light from behind. Matthew is dark navy on a dark navy world once
    // recoloured, so without an edge highlight his silhouette disappears into
    // the ground. The reference art solves this the same way, by backlighting
    // him against the city.
    const rim = new DirectionalLight(PALETTE.blueLight, 2.2);
    rim.position.set(-5, 5, -9);
    this.scene.add(rim);

    this.unobserve = this.host.onResize(this.fit);
  }

  /** Lower this on weak devices rather than changing simulation behaviour. */
  setPixelRatioCap(cap: number): void {
    this.host.setPixelRatioCap(cap);
  }

  observe(): void {
    this.host.observe();
  }

  /** Force a re-measure. The host recomputes and notifies every subscriber. */
  resize(): void {
    this.host.resize();
  }

  /** Drop the resize subscription. The renderer belongs to the shell. */
  dispose(): void {
    this.unobserve?.();
    this.unobserve = null;
  }

  private readonly fit = (width: number, height: number): void => {
    this.camera.aspect = width / height;
    // Portrait screens are narrow: widen the FOV so the lanes and the next
    // hazard stay visible without moving the camera back.
    this.camera.fov = this.camera.aspect < 0.72 ? 64 : 54;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.host.render(this.scene, this.camera);
  }

  get renderer(): RendererHost['renderer'] { return this.host.renderer; }
  get drawCalls(): number { return this.host.drawCalls; }
  get triangles(): number { return this.host.triangles; }
}
