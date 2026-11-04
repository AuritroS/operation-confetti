import type { PerspectiveCamera } from 'three';
import type { Snapshot } from '../levels/skyline/types';
import {
  CAMERA_ASPECT_PULLBACK,
  CAMERA_ASPECT_REFERENCE,
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  CAMERA_LOOK_AHEAD,
  CAMERA_LOOK_HEIGHT,
  CAMERA_SIDE,
  CAMERA_YAW,
  FOCUS_BASE,
  FOCUS_FOLLOW,
  FOCUS_FOLLOW_REDUCED,
  FOCUS_SETTLE,
  FOCUS_START,
} from './skyline-view';

/**
 * How much of the normal stand-off `?closeup` keeps.
 *
 * A review affordance in the same family as `?clean` and `?debug`. The
 * gameplay camera is framed to read the route; this is for checking whether a
 * hand is on the cable or a foot is through the road. Review-only.
 */
const CLOSEUP = 0.45;

/** Keep the three routes horizontally stable while gently tracking altitude. */
export class SkylineCamera {
  private focusY = FOCUS_START;
  private initialized = false;
  private readonly closeup: boolean;

  constructor(private camera: PerspectiveCamera) {
    this.closeup =
      typeof location !== 'undefined' && new URLSearchParams(location.search).has('closeup');
  }

  /**
   * Where the lens is, in the scene's player-relative frame.
   *
   * Exposed so other layers can ASK rather than assume. The street layer uses
   * it to avoid drawing a 30-unit tower into the space between the lens and
   * the hero, which it previously did by way of a hand-tuned constant that
   * only held for one particular stand-off.
   */
  get position(): { x: number; y: number; z: number } {
    return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
  }

  update(s: Snapshot, dt: number, reduced: boolean): void {
    const blend = this.initialized ? 1 - Math.exp(-dt * FOCUS_SETTLE) : 1;
    this.initialized = true;
    const follow = reduced ? FOCUS_FOLLOW_REDUCED : FOCUS_FOLLOW;
    this.focusY += (FOCUS_BASE + s.p.y * follow - this.focusY) * blend;

    // Portrait crops horizontally, so a narrow frame needs more stand-off to
    // keep the outer lanes on screen.
    const crop = Math.max(0, CAMERA_ASPECT_REFERENCE / this.camera.aspect - 1);
    const full = CAMERA_DISTANCE + crop * CAMERA_ASPECT_PULLBACK;
    const distance = this.closeup ? full * CLOSEUP : full;

    this.camera.position.set(
      CAMERA_SIDE,
      this.focusY + (this.closeup ? CAMERA_HEIGHT * 0.5 : CAMERA_HEIGHT),
      distance,
    );
    this.camera.lookAt(
      CAMERA_SIDE + Math.sin(CAMERA_YAW) * CAMERA_LOOK_AHEAD,
      this.focusY + (this.closeup ? CAMERA_LOOK_HEIGHT * 0.4 : CAMERA_LOOK_HEIGHT),
      this.closeup ? CAMERA_LOOK_AHEAD * 0.4 : CAMERA_LOOK_AHEAD,
    );
  }

  reset(): void {
    this.focusY = FOCUS_START;
    this.initialized = false;
  }
}
