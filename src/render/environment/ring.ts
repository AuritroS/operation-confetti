/**
 * Shared z-recycling for scrolling decoration.
 *
 * A 450-unit route cannot hold an object per metre, so every scrolling layer
 * keeps a small pool and wraps each item forward once it passes behind the
 * player. Centralised so no layer reimplements the wrap and gets the modulo
 * wrong.
 *
 * `spacing * count` is the repeat distance. Make it comfortably larger than
 * the draw distance or the player sees the seam.
 */
import type { Object3D } from 'three';

export class RingPlacer {
  private readonly period: number;

  constructor(
    private readonly items: readonly Object3D[],
    private readonly spacing: number,
    /** Distance ahead of the player at which an item appears. */
    private readonly drawDistance = 60,
    /** Multiplier on travelled distance. Below 1 parallaxes into the distance. */
    private readonly parallax = 1,
  ) {
    this.period = spacing * items.length;
  }

  /**
   * Position every item for the current distance.
   *
   * `place` receives the item and its world z, and positions it. Layers decide
   * x and y themselves, so the ring stays purely about distance.
   */
  update(travelled: number, place: (item: Object3D, z: number, index: number) => void): void {
    const scrolled = travelled * this.parallax;
    for (const [i, item] of this.items.entries()) {
      // Anchor each item to its slot, then wrap the whole period so the pool
      // repeats seamlessly instead of running out.
      const base = i * this.spacing;
      const ahead = ((base - scrolled) % this.period + this.period) % this.period;
      // Keep a little of the pool behind the player so nothing pops at z=0.
      const z = ahead > this.drawDistance ? ahead - this.period : ahead;
      place(item, -z, i);
    }
  }
}
