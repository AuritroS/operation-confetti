import type { PerspectiveCamera } from 'three';
import type { Snapshot } from '../levels/skyline/types';
import { INSPECTING } from './skyline-inspect';
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

/**
 * `?inspect` framing: high, back, and looking down the contact sheet.
 *
 * A gameplay camera eighteen units back sees three props at a time, which
 * is exactly the round-trip the inspection frame exists to remove.
 */
const INSPECT_DEFAULT = { x: 0, y: 15, z: 24, lookX: 0, lookY: 17, lookZ: -20 };

/**
 * Overridable from the URL: `?inspect&cam=x,y,z,lookY,lookZ` or `x,y,z,lookX,lookY,lookZ`.
 *
 * Framing a contact sheet is a judgement, and round-tripping through a code
 * change for every nudge is the cost this tool exists to remove.
 */
const INSPECT_VIEW = (() => {
  if (typeof location === 'undefined') return INSPECT_DEFAULT;
  const raw = new URLSearchParams(location.search).get('cam');
  if (!raw) return INSPECT_DEFAULT;
  const n = raw.split(',').map(Number);
  if (n.length < 3 || n.some((v) => !Number.isFinite(v))) return INSPECT_DEFAULT;
  if (n.length >= 6) {
    return {
      x: n[0] as number,
      y: n[1] as number,
      z: n[2] as number,
      lookX: n[3] as number,
      lookY: n[4] as number,
      lookZ: n[5] as number,
    };
  }
  return {
    x: n[0] as number,
    y: n[1] as number,
    z: n[2] as number,
    lookX: 0,
    lookY: n[3] ?? INSPECT_DEFAULT.lookY,
    lookZ: n[4] ?? INSPECT_DEFAULT.lookZ,
  };
})();

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
    if (INSPECTING) {
      // Oblique rather than straight down the street: a camera at roof
      // height looks onto the roofs, and a camera at street level hides the
      // far half behind the near half.
      this.camera.position.set(INSPECT_VIEW.x, INSPECT_VIEW.y, INSPECT_VIEW.z);
      this.camera.lookAt(INSPECT_VIEW.lookX, INSPECT_VIEW.lookY, INSPECT_VIEW.lookZ);
      return;
    }
    const blend = this.initialized ? 1 - Math.exp(-dt * FOCUS_SETTLE) : 1;
    this.initialized = true;
    const follow = reduced ? FOCUS_FOLLOW_REDUCED : FOCUS_FOLLOW;
    this.focusY += (FOCUS_BASE + s.p.y * follow - this.focusY) * blend;

    // Portrait crops horizontally, so a narrow frame needs more stand-off to
    // keep the outer lanes on screen. Dynamic speed surge breathes subtly:
    // pulls back on high-speed trough surge, tucks in on apex float.
    const crop = Math.max(0, CAMERA_ASPECT_REFERENCE / this.camera.aspect - 1);
    const full = CAMERA_DISTANCE + crop * CAMERA_ASPECT_PULLBACK;
    const speedSurge = reduced ? 0 : Math.max(-0.35, Math.min(0.55, (s.v.z - 8.5) * 0.12));
    const distance = this.closeup ? full * CLOSEUP : full + speedSurge;

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
    if (!reduced && !this.closeup) {
      // Subtle dynamic camera bank framing matching lateral carve
      const bankRoll = Math.max(-0.022, Math.min(0.022, -s.v.x / (s.v.z || 1) * 0.03));
      this.camera.rotation.z = bankRoll;
    }
  }

  reset(): void {
    this.focusY = FOCUS_START;
    this.initialized = false;
  }
}
