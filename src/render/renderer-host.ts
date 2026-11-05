/**
 * The one WebGL renderer the campaign owns.
 *
 * Every level used to build its own `WebGLRenderer`: level 1 and 2 through
 * `Stage`, level 3 through its own boss scene. That was fine while each level
 * was its own page, but the campaign plays all three without a reload, and a
 * browser only keeps a small number of live WebGL contexts — eight to sixteen,
 * depending. Creating one per level leaks contexts across transitions and
 * fails as a hard crash several replays in, on a real phone, which is exactly
 * where we cannot test.
 *
 * So the shell owns the renderer and the canvas, and a level contributes only
 * a scene and a camera. That also makes a crossfade between two levels
 * possible at all, since both can be drawn by the same renderer in one frame.
 *
 * What stays per-level: scene, camera, lights, fog, background and tone
 * mapping. Those genuinely differ — level 3 is a lit night interior with
 * filmic tone mapping, levels 1 and 2 are fogged exteriors — so they are
 * applied on mount rather than shared.
 */
import { ACESFilmicToneMapping, WebGLRenderer, type Camera, type Scene } from 'three';

export const MAX_PIXEL_RATIO = 1.5;

export type ResizeListener = (width: number, height: number) => void;

export class RendererHost {
  readonly renderer: WebGLRenderer;
  private cap = MAX_PIXEL_RATIO;
  private listeners = new Set<ResizeListener>();
  private resizeObserver: ResizeObserver | null = null;
  private width = 1;
  private height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    // One tone response for every level; only exposure varies. See `look.ts`.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.resize();
  }

  /** Per-level exposure. The curve itself never changes between levels. */
  setExposure(value: number): void {
    this.renderer.toneMappingExposure = value;
  }

  /**
   * Subscribe to viewport changes, and receive the current size immediately.
   *
   * Returns an unsubscribe function: a level that forgets to call it on
   * dispose would keep resizing a camera belonging to a scene that is no
   * longer drawn, which is the quiet kind of leak a transition introduces.
   */
  onResize(listener: ResizeListener): () => void {
    this.listeners.add(listener);
    listener(this.width, this.height);
    return () => { this.listeners.delete(listener); };
  }

  /** Lower this on weak devices rather than changing simulation behaviour. */
  setPixelRatioCap(cap: number): void {
    this.cap = Math.max(0.75, cap);
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

  readonly resize = (): void => {
    // The parent is the portrait frame, which CSS letterboxes on wide
    // screens, so these dimensions are already the playfield rather than the
    // window. Desktop and phone therefore see an identical field of view.
    const parent = this.canvas.parentElement;
    this.width = Math.max(1, Math.round(parent?.clientWidth ?? window.innerWidth));
    this.height = Math.max(1, Math.round(parent?.clientHeight ?? window.innerHeight));

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.cap));
    this.renderer.setSize(this.width, this.height, false);
    for (const listener of this.listeners) listener(this.width, this.height);
  };

  render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  get viewport(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get drawCalls(): number { return this.renderer.info.render.calls; }
  get triangles(): number { return this.renderer.info.render.triangles; }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.listeners.clear();
    this.renderer.dispose();
  }
}
