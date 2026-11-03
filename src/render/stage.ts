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
  WebGLRenderer,
} from 'three';
import { PALETTE } from './palette';

export const MAX_PIXEL_RATIO = 1.5;

/** Exponential fog density. Exported so spawn distances can be checked. */
export const FOG_DENSITY = 0.013;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  private pixelRatioCap = MAX_PIXEL_RATIO;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(new Color(PALETTE.ink), 1);

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

    this.resize();
  }

  /** Lower this on weak devices rather than changing simulation behaviour. */
  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = Math.max(0.75, cap);
    this.resize();
  }

  observe(): void {
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.canvas.parentElement ?? document.body);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer.dispose();
  }

  readonly resize = (): void => {
    // The parent is the portrait frame, which CSS letterboxes on wide
    // screens, so these dimensions are already the playfield rather than the
    // window. Desktop and phone therefore see an identical field of view —
    // previously desktop saw 75 degrees horizontally against the phone's 32,
    // which is why side content read as floating there and not on mobile.
    const parent = this.canvas.parentElement;
    const w = Math.max(1, Math.round(parent?.clientWidth ?? window.innerWidth));
    const h = Math.max(1, Math.round(parent?.clientHeight ?? window.innerHeight));

    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;
    // Portrait screens are narrow: widen the FOV so the lanes and the next
    // hazard stay visible without moving the camera back.
    this.camera.fov = this.camera.aspect < 0.72 ? 64 : 54;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  get triangles(): number {
    return this.renderer.info.render.triangles;
  }
}
