/**
 * Level 2 hero: the real Matthew, driven by the swing state machine.
 *
 * Separate from `rogue.ts` rather than shared with it. The two levels want
 * different things from the same model — level 1 needs a runner at 1.45
 * units with a lane lean, level 2 needs a swinger at 2.385 with an arm pose
 * aimed at a moving anchor — and merging them would mean a class that is
 * mostly branches on which level it is in.
 *
 * ---- the animation gap ---------------------------------------------------
 *
 * There is no swing clip. The two Rig_Medium libraries hold 26 clips between
 * them and not one is a hang, a reach, or a swing:
 *
 *   Death_A/B(+Pose), Hit_A/B, Idle_A/B, Interact, PickUp, Spawn_Air,
 *   Spawn_Ground, Throw, Use_Item, Jump_Full_Long/Short, Jump_Idle,
 *   Jump_Land, Jump_Start, Running_A/B, Walking_A/B/C
 *
 * `Jump_Idle` is the nearest substitute and would be on screen for most of
 * the 36-second route, which is exactly the wrong place to accept a
 * substitute. So the swing pose is PROCEDURAL: the clip supplies the body
 * and the arms are posed afterwards, aimed at the anchor the player is
 * actually attached to. Three bones, written after the mixer each frame.
 *
 * That ordering matters. `AnimationMixer` writes absolute bone rotations, so
 * anything applied before `update()` is discarded. The override has to come
 * after, every frame.
 */
import { Box3, MathUtils, Object3D, Quaternion, Vector3 } from 'three';
import { AssetBundle, type Actor } from '../assets/characters';
import { CLIPS, HIDDEN_MESHES, SOURCES } from '../assets/manifest';
import type { Snapshot } from '../levels/skyline/types';

/**
 * Gameplay height for level 2, in world units.
 *
 * Matches the box stand-in it replaces, which spans y -1.24 to 1.145. Taking
 * that as a 1.75 m adult is what sets the street scale in `skyline-props.ts`,
 * so this number and every prop scale move together.
 */
export const HERO_HEIGHT = 2.385;

/**
 * How far the feet sit below the hero origin.
 *
 * The runner places the hero by its origin, not its soles, and `groundY` of
 * 1.25 only lands the feet on the road because the stand-in happened to be
 * built with 1.24 units below its own origin. Reproducing that exactly keeps
 * ground contact identical, so swapping the art cannot shift where the
 * character appears to stand.
 */
const FOOT_DROP = 1.24;

/** The Rogue faces +Z in source; the route runs toward -Z, so turn it round. */
const FACING_Y = Math.PI;

/** How fast the arms settle toward the pose, as an exponential time constant. */
const ARM_SETTLE = 0.1;
/** How far the hands sit apart on the cable, as a fraction of the reach. */
const GRIP_SPREAD = 0.22;
/** Lateral axis the two hands are offset along, so they don't overlap. */
const SIDEWAYS = new Vector3(1, 0, 0);

export interface SkylineHero {
  readonly object: Object3D;
  update(s: Snapshot, dt: number, reduced: boolean): void;
  /**
   * World position midway between the hands, for the cable to start at.
   *
   * Returns false when the hand bones are unavailable, so the caller keeps
   * its own fallback rather than drawing a cable from the origin.
   */
  gripPoint(out: Vector3): boolean;
  dispose(): void;
}

export async function loadSkylineHero(): Promise<SkylineHero | null> {
  try {
    const bundle = new AssetBundle();
    await bundle.loadAll([SOURCES.characters.matthew, ...SOURCES.animationLibraries]);

    const actor = bundle.actor(SOURCES.characters.matthew);
    actor.root.rotation.y = FACING_Y;
    actor.hideMeshes(HIDDEN_MESHES['matthew'] ?? []);
    fitToHeight(actor.root, HERO_HEIGHT);
    // Re-seat so the ORIGIN sits where the stand-in's origin sat, rather than
    // at the soles, which is what `fitToHeight` leaves behind.
    actor.root.position.y -= FOOT_DROP;

    actor.play(CLIPS.matthew.run);
    return new RiggedHero(bundle, actor);
  } catch (e) {
    console.warn('[skyline] Matthew failed to load; keeping the stand-in', e);
    return null;
  }
}

class RiggedHero implements SkylineHero {
  readonly object: Object3D;

  /**
   * Both arm bones per side, not just the shoulder.
   *
   * Aiming only `upperarm` left the elbow wherever the clip had it, so with
   * `Jump_Idle`'s bent arms the hands finished at mid-torso while the
   * shoulder pointed correctly at the anchor. The cable then started from a
   * grip that was nowhere near the cable. The forearm has to follow.
   */
  private arms: { bone: Object3D; rest: Vector3 }[] = [];
  private readonly reach = new Vector3();
  private readonly scratch = new Vector3();
  /** `aim` must not write to `scratch`: callers pass it in as the target. */
  private readonly aimed = new Vector3();
  private readonly turn = new Quaternion();
  private readonly posed = new Quaternion();
  /** 0 = arms at rest under the clip, 1 = fully aimed at the anchor. */
  private grip = 0;
  private chest: Object3D | null;
  private hands: Object3D[] = [];
  private lastPhase = '';

  constructor(
    private bundle: AssetBundle,
    private actor: Actor,
  ) {
    // A wrapper, so the runner can position the hero without fighting the
    // scale and foot offset baked into the model's own transform.
    this.object = new Object3D();
    this.object.add(actor.root);

    /**
     * Derive each arm's rest direction from the rig instead of assuming one.
     *
     * The first attempt rotated `upperarm.*` about local X by a hand-picked
     * angle and did nothing visible, because this rig does not hang its arms
     * down that axis — the model simply stayed in its bind pose. Rather than
     * guess again, take the direction from the skeleton: the child joint's
     * position in the parent's local space IS the direction the bone points
     * at rest, whatever convention the pack used. Aiming is then a single
     * `setFromUnitVectors` and the code is correct for any rig.
     */
    for (const [joint, child] of [
      ['upperarm.l', 'lowerarm.l'],
      ['lowerarm.l', 'wrist.l'],
      ['upperarm.r', 'lowerarm.r'],
      ['lowerarm.r', 'wrist.r'],
    ]) {
      const bone = actor.node(joint as string);
      const next = actor.node(child as string);
      if (!bone || !next) continue;
      this.arms.push({ bone, rest: next.position.clone().normalize() });
    }
    this.chest = actor.node('chest');
    for (const name of ['hand.l', 'hand.r']) {
      const hand = actor.node(name);
      if (hand) this.hands.push(hand);
    }
    if (this.arms.length < 4) {
      console.warn(`[skyline] only ${this.arms.length}/4 arm bones found; swing pose degraded`);
    }
  }

  update(s: Snapshot, dt: number, reduced: boolean): void {
    this.actor.update(dt);
    this.playFor(s);

    // ---- procedural arms, applied AFTER the mixer ------------------------
    // Blended rather than switched, so letting go of a cable releases the
    // arms into the clip instead of snapping them.
    this.grip += ((s.anchor ? 1 : 0) - this.grip) * (1 - Math.exp(-dt / ARM_SETTLE));
    if (s.anchor && this.grip > 0.01) {
      // The anchor in the same player-relative frame the scene draws in.
      this.reach.set(s.anchor.x - s.p.x, s.anchor.y - s.p.y, -(s.anchor.z - s.p.z));
      const spread = GRIP_SPREAD * this.reach.length();
      for (let i = 0; i < this.arms.length; i++) {
        const arm = this.arms[i];
        if (!arm) continue;
        // Entries are [upper.l, lower.l, upper.r, lower.r], so the two left
        // bones share a side and the two right bones share the other.
        const side = i < 2 ? -1 : 1;
        this.aim(
          arm.bone,
          arm.rest,
          this.scratch.copy(this.reach).addScaledVector(SIDEWAYS, side * spread),
          this.grip,
        );
      }
    }

    // Lean the chest into the arc. Small, because the clip is already
    // animating the spine and a large override reads as a broken rig.
    if (this.chest && !reduced) {
      const lean = MathUtils.clamp(-s.v.y * 0.012, -0.22, 0.22);
      this.chest.rotation.x += lean;
    }
  }

  gripPoint(out: Vector3): boolean {
    if (this.hands.length === 0) return false;
    out.set(0, 0, 0);
    for (const hand of this.hands) {
      hand.updateWorldMatrix(true, false);
      out.add(this.scratch.setFromMatrixPosition(hand.matrixWorld));
    }
    out.multiplyScalar(1 / this.hands.length);
    return true;
  }

  /**
   * Point a bone along `worldish` — a direction in the hero's own frame.
   *
   * `rest` is where the bone points with no rotation applied, so the
   * rotation that aims it is just the one carrying rest onto the target.
   * The target is brought into the bone's parent space first, because a
   * bone's rotation is expressed relative to its parent, not the world.
   */
  private aim(bone: Object3D, rest: Vector3, direction: Vector3, weight: number): void {
    const parent = bone.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    const local = this.aimed.copy(direction).applyQuaternion(
      parent.getWorldQuaternion(this.turn).invert(),
    );
    if (local.lengthSq() < 1e-8) return;
    local.normalize();
    this.posed.setFromUnitVectors(rest, local);
    // Blend from whatever the clip wrote toward the aimed pose, so letting
    // go releases the arms into the animation rather than snapping them.
    bone.quaternion.slerp(this.posed, Math.min(1, weight));
  }

  /**
   * Pick the base clip from the phase.
   *
   * `Jump_Start` and `Jump_Land` are one-shots and must not be re-triggered
   * every frame, so the phase is compared against the last one applied.
   */
  private playFor(s: Snapshot): void {
    const phase = s.phase;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;

    if (phase === 'run') this.actor.play(CLIPS.matthew.run);
    else if (phase === 'land') {
      this.actor.play('Jump_Land', { loop: false, clampWhenFinished: true, fade: 0.08 });
    } else if (phase === 'launch') {
      this.actor.play('Jump_Start', { loop: false, clampWhenFinished: true, fade: 0.08 });
    } else {
      // Everything airborne — swing, flight, descend, transfer — shares the
      // hang. The arms are what distinguish them, and they are procedural.
      this.actor.play(CLIPS.matthew.hang);
    }
  }

  dispose(): void {
    this.actor.dispose();
    this.bundle.dispose(SOURCES.characters.matthew);
    this.object.removeFromParent();
  }
}

/**
 * Scale a model so its bind-pose height matches the gameplay height, and sit
 * its feet at the origin. Measured rather than assumed: the packs author
 * characters at inconsistent heights, and a hard-coded factor silently
 * breaks the moment an asset is re-exported.
 */
function fitToHeight(root: Object3D, target: number): number {
  const box = new Box3().setFromObject(root);
  const height = box.getSize(new Vector3()).y;
  if (height <= 0) return 1;
  root.scale.setScalar(target / height);
  const scaled = new Box3().setFromObject(root);
  root.position.y -= scaled.min.y;
  return target / height;
}
