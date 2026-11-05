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
import { Box3, MathUtils, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetBundle, type Actor } from '../assets/characters';
import { ATTACH_NODES, ATTACH_OFFSETS, CLIPS, HIDDEN_MESHES, SOURCES } from '../assets/manifest';
import type { Snapshot } from '../levels/skyline/types';
import { LAND_TIME } from '../levels/skyline/config';

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

/**
 * Height of the BODY — everything but the head — at gameplay scale.
 *
 * Fitting on the whole bounding box was correct while the head was a hood,
 * and wrong the moment it became hair: the curl shell reaches y 2.347 in
 * bind space where the hood stopped at 2.17, so the same `HERO_HEIGHT`
 * target produced a scale of 1.015 instead of 1.094 and quietly shrank
 * Matthew by 7%. Hair is not height the street cares about. Measuring the
 * body instead means any future change to hair, or a hat, moves nothing.
 *
 * The number is the body at the scale it had before the shell landed:
 * 1.2545 bind units x (2.385 / 2.180).
 */
const HERO_BODY_HEIGHT = 1.3724;

/** Excluded from the fit measurement: this is the mesh carrying the hair. */
const HEAD_MESH = 'Rogue_Head';

/** The Rogue faces +Z in source; the route runs toward -Z, so turn it round. */
const FACING_Y = Math.PI;

/**
 * Where the line leaves the blaster, in the blaster's own local space.
 *
 * The barrel runs along +Z and ends at z 0.78, so this is the centre of the
 * muzzle face. Having the rope start here rather than at the hands is what
 * gives the near end of it something solid to come out of — and the near
 * end is the one actually on camera, since the anchor sits 7 to 27 units
 * down the street.
 */
const MUZZLE_LOCAL = new Vector3(0, 0.059, 0.438);

/** How fast the arms settle toward the pose, as an exponential time constant. */
const ARM_SETTLE = 0.055;

/**
 * How far above the player an anchor must be before the arms reach for it.
 *
 * A descent transfer targets a `lowerAnchor` sitting at y 0.6, on the road.
 * The arm pose had no notion of direction, so for the whole 0.73s of a
 * descent both arms aimed at a point up to 4.4 units BELOW him while the
 * body played a hang — he fell to the street reaching at it. You can only
 * hang from something above you, so that is now the test.
 */
const ANCHOR_MIN_RISE = 0.5;
const DEG = Math.PI / 180;

/**
 * How far outboard the grappling arm swings, away from the anchor direction.
 *
 * Not a style choice — a clearance. His shoulder sits at x -0.212 with a
 * total reach of 0.576, while the curl shell is 0.697 wide. The arm is
 * shorter than his head, so pointing it at an anchor that is now 88 degrees
 * overhead drives the hand straight into the hair. Clearing it needs 0.485
 * of lateral travel on a 0.576 reach, which is this angle.
 *
 * This is allowed to be a pose rather than a solve because the line is drawn
 * from the blaster muzzle to the anchor, and the muzzle rides in his hand —
 * so the rope connects wherever the hand ends up. The arm only has to look
 * like it is holding on.
 */
const OUTWARD_TILT = 18 * DEG;

/**
 * Direction the blaster barrel points in wrist.r local space in the bind pose.
 * Derived from the bone chain (wrist.r -> hand.r -> handslot.r -> blaster).
 */
const BARREL_LOCAL_IN_WRIST = new Vector3(-1, 0, 0);

/**
 * How much of the aim the forearm takes.
 *
 * Both bones used to aim at the same target, which makes the arm a dead
 * straight rod from shoulder to hand. Letting the forearm only partly follow
 * leaves some of the clip's bend in the elbow, and the bend is most of what
 * reads as an arm rather than a pose.
 */
const FOREARM_FOLLOW = 0.6;

/** The free arm: down, outboard and trailing, as a counterweight. */
const COUNTER_DOWN = 0.62;
const COUNTER_OUT = 0.55;
const COUNTER_BACK = 0.56;
/** Blend weight, so the clip still reads through it. */
const COUNTER_WEIGHT = 0.35;
/** Radians of extra sway per unit of lateral speed; |v.x| peaks near 9. */
const COUNTER_SWAY = 0.03;

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
  /**
   * World position of the blaster muzzle, for the grapple line to start at.
   *
   * Falls back to `gripPoint` and reports which it used, so "where does the
   * rope actually begin" is answerable from the debug panel instead of
   * guessable from a screenshot.
   */
  ropeOrigin(out: Vector3): 'muzzle' | 'hands' | 'none';
  dispose(): void;
}

export async function loadSkylineHero(): Promise<SkylineHero | null> {
  try {
    const bundle = new AssetBundle();
    await bundle.loadAll([SOURCES.characters.matthew, ...SOURCES.animationLibraries]);

    const actor = bundle.actor(SOURCES.characters.matthew);
    actor.root.rotation.y = FACING_Y;
    actor.hideMeshes(HIDDEN_MESHES['matthew'] ?? []);
    fitToBody(actor.root, HERO_BODY_HEIGHT);
    // Re-seat so the ORIGIN sits where the stand-in's origin sat, rather than
    // at the soles, which is what `fitToHeight` leaves behind.
    actor.root.position.y -= FOOT_DROP;

    actor.play(CLIPS.matthew.run);

    // The blaster is the grapple launcher here, not a weapon: both hands go
    // on the cable during a swing, so a gun held alongside the rope would
    // read as a mistake. Treating it as the thing the line comes out of is
    // what the reference shows, and it costs one draw and one asset we
    // already ship. A failed load leaves the rope starting at the hands.
    try {
      const gltf = await new GLTFLoader().loadAsync(SOURCES.props.blaster);
      const blaster = gltf.scene;
      const o = ATTACH_OFFSETS.blaster;
      blaster.position.set(...o.position);
      blaster.rotation.set(...o.rotationEuler);
      blaster.scale.setScalar(o.scale);
      if (!actor.attach(ATTACH_NODES.handRight, blaster)) {
        console.warn('[skyline] no handslot.r; blaster not attached');
      }
      return new RiggedHero(bundle, actor, blaster);
    } catch (e) {
      console.warn('[skyline] blaster failed to load; rope starts at the hands', e);
    }
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
  private rightArm: { bone: Object3D; rest: Vector3 }[] = [];
  private leftArm: { bone: Object3D; rest: Vector3 }[] = [];
  private rightWrist: Object3D | null = null;
  private readonly reach = new Vector3();
  private readonly scratch = new Vector3();
  private readonly shoulder = new Vector3();
  private readonly counter = new Vector3();
  private readonly perp = new Vector3();
  private readonly muzzleWorld = new Vector3();
  private readonly anchorWorld = new Vector3();
  private readonly toAnchor = new Vector3();
  private readonly targetInLowerarm = new Vector3();
  private readonly wristDiff = new Quaternion();
  private readonly parentQuat = new Quaternion();
  /** The character's own right, up and facing axes, in world space. */
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly axisZ = new Vector3();
  /** `aim`'s own scratch: it must not write to the vector it was handed. */
  private readonly aimed = new Vector3();
  private readonly turn = new Quaternion();
  private readonly posed = new Quaternion();
  /** 0 = arms at rest under the clip, 1 = fully posed on the line. */
  private grip = 0;
  private chest: Object3D | null;
  private hands: Object3D[] = [];
  private lastPhase = '';
  /** Seconds since this hero started updating; the clock the hand-off uses. */
  private clock = 0;
  /**
   * A one-shot clip has a natural end, and the phase that triggered it
   * usually outlives it. `Jump_Start` runs 0.60s inside a launch that lasts
   * about 1.3s, so with `clampWhenFinished` it used to hold a frozen pose
   * for the remaining 0.7s. These record what to fall into, and when.
   */
  private settleTo: string | null = null;
  private settleAt = 0;

  constructor(
    private bundle: AssetBundle,
    private actor: Actor,
    private blaster: Object3D | null = null,
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
    for (const [side, joint, child] of [
      ['r', 'upperarm.r', 'lowerarm.r'],
      ['r', 'lowerarm.r', 'wrist.r'],
      ['l', 'upperarm.l', 'lowerarm.l'],
      ['l', 'lowerarm.l', 'wrist.l'],
    ] as const) {
      const bone = actor.node(joint);
      const next = actor.node(child);
      if (!bone || !next) continue;
      const entry = { bone, rest: next.position.clone().normalize() };
      (side === 'r' ? this.rightArm : this.leftArm).push(entry);
    }
    this.chest = actor.node('chest');
    this.rightWrist = actor.node('wrist.r');
    for (const name of ['hand.l', 'hand.r']) {
      const hand = actor.node(name);
      if (hand) this.hands.push(hand);
    }
    const found = this.rightArm.length + this.leftArm.length;
    if (found < 4) {
      console.warn(`[skyline] only ${found}/4 arm bones found; swing pose degraded`);
    }
  }

  update(s: Snapshot, dt: number, reduced: boolean): void {
    this.actor.update(dt);
    this.clock += dt;
    this.playFor(s);

    // Hand a finished one-shot over to the clip that should follow it,
    // rather than letting `clampWhenFinished` freeze the last frame.
    if (this.settleTo && this.clock >= this.settleAt) {
      this.actor.play(this.settleTo, { fade: 0.16 });
      this.settleTo = null;
    }

    // ---- procedural arms, applied AFTER the mixer ------------------------
    // Blended rather than switched, so letting go of a cable releases the
    // arms into the clip instead of snapping them.
    const holding = !!s.anchor && (s.anchor.kind === 'lower' || s.anchor.y > s.p.y + ANCHOR_MIN_RISE);
    this.grip += ((holding ? 1 : 0) - this.grip) * (1 - Math.exp(-dt / ARM_SETTLE));

    if (this.grip > 0.01) {
      this.readBasis();

      // ---- the grappling arm, right only ---------------------------------
      // Only the right arm is on the line: the blaster lives in handslot.r
      // and the rope leaves its muzzle. Mirroring the pose onto the left read
      // as a mistake, which it was.
      const upper = this.rightArm[0], lower = this.rightArm[1];
      if (holding && s.anchor && upper && lower) {
        // From the SHOULDER, not the player origin. Worth about two degrees
        // on a twelve-unit rope, but it is the honest vector.
        upper.bone.getWorldPosition(this.shoulder);
        this.reach
          .set(s.anchor.x, s.anchor.y, s.p.z - s.anchor.z)
          .sub(this.shoulder);
        if (this.reach.lengthSq() > 1e-6) {
          this.reach.normalize();
          // Chest clearance envelope: ensure the right arm never cuts inward across Matthew's chest/face
          const lateral = this.reach.dot(this.axisX);
          if (lateral < 0.18) {
            this.reach.addScaledVector(this.axisX, 0.18 - lateral).normalize();
          }
          // Prevent arm from being dragged backward behind the shoulder coronal plane
          const forward = this.reach.dot(this.axisZ);
          if (forward < 0.08) {
            this.reach.addScaledVector(this.axisZ, 0.08 - forward).normalize();
          }
          this.tiltToward(this.reach, this.axisX, OUTWARD_TILT);
          this.aim(upper.bone, upper.rest, this.reach, this.grip);
          this.aim(lower.bone, lower.rest, this.reach, this.grip * FOREARM_FOLLOW);

          // Align the wrist so the blaster barrel points directly along the line to the anchor.
          // Directly slerp to the computed target orientation so rotation never accumulates or spins.
          if (this.rightWrist) {
            this.rightWrist.getWorldPosition(this.muzzleWorld);
            this.anchorWorld.set(s.anchor.x, s.anchor.y, s.p.z - s.anchor.z);
            this.toAnchor.copy(this.anchorWorld).sub(this.muzzleWorld);
            if (this.toAnchor.lengthSq() > 1e-6) {
              this.toAnchor.normalize();
              this.targetInLowerarm.copy(this.toAnchor)
                .applyQuaternion(lower.bone.getWorldQuaternion(this.parentQuat).invert())
                .normalize();
              this.wristDiff.setFromUnitVectors(BARREL_LOCAL_IN_WRIST, this.targetInLowerarm);
              this.rightWrist.quaternion.slerp(this.wristDiff, this.grip);
            }
          }
        }
      }

      // ---- the free arm ---------------------------------------------------
      // Down, outboard and trailing, swaying against the direction of travel
      // so a lane change reads as a counterweight rather than a dead limb.
      // During descent, sweeps back and up in an aerodynamic superhero dive.
      const freeUpper = this.leftArm[0], freeLower = this.leftArm[1];
      if (freeUpper && freeLower) {
        const isDescend = s.phase === 'descend';
        const downWeight = isDescend ? 0.35 : -COUNTER_DOWN;
        const backWeight = isDescend ? -0.85 : -COUNTER_BACK;
        const outWeight = isDescend ? -COUNTER_OUT * 1.3 : -COUNTER_OUT;
        this.counter
          .copy(this.axisY).multiplyScalar(downWeight)
          .addScaledVector(this.axisX, outWeight)
          .addScaledVector(this.axisZ, backWeight)
          .normalize();
        this.tiltToward(
          this.counter,
          this.axisX,
          MathUtils.clamp(-s.v.x * COUNTER_SWAY, -0.5, 0.5),
        );
        const weight = this.grip * (isDescend ? 0.85 : COUNTER_WEIGHT);
        this.aim(freeUpper.bone, freeUpper.rest, this.counter, weight);
        this.aim(freeLower.bone, freeLower.rest, this.counter, weight * FOREARM_FOLLOW);
      }
    }

    // Athletic flight soar pose: trailing left arm for balance, forward-held right blaster
    if (!holding && (s.phase === 'flight' || s.phase === 'descend')) {
      this.readBasis();
      const upperR = this.rightArm[0], lowerR = this.rightArm[1];
      const upperL = this.leftArm[0], lowerL = this.leftArm[1];

      // Right arm (holding blaster): held forward and slightly outward, scanning ahead
      if (upperR && lowerR) {
        this.counter
          .copy(this.axisZ).multiplyScalar(0.70)
          .addScaledVector(this.axisX, 0.35)
          .addScaledVector(this.axisY, -0.15)
          .normalize();
        this.aim(upperR.bone, upperR.rest, this.counter, 0.85);
        this.aim(lowerR.bone, lowerR.rest, this.counter, 0.85 * FOREARM_FOLLOW);
        if (this.rightWrist) {
          this.targetInLowerarm.copy(this.axisZ)
            .applyQuaternion(lowerR.bone.getWorldQuaternion(this.parentQuat).invert())
            .normalize();
          this.wristDiff.setFromUnitVectors(BARREL_LOCAL_IN_WRIST, this.targetInLowerarm);
          this.rightWrist.quaternion.slerp(this.wristDiff, 0.85);
        }
      }

      // Left arm (free arm): sweeps back and out for aerodynamic balance
      if (upperL && lowerL) {
        this.counter
          .copy(this.axisY).multiplyScalar(-0.35)
          .addScaledVector(this.axisZ, -0.65)
          .addScaledVector(this.axisX, -0.45)
          .normalize();
        this.aim(upperL.bone, upperL.rest, this.counter, 0.75);
        this.aim(lowerL.bone, lowerL.rest, this.counter, 0.75 * FOREARM_FOLLOW);
      }
    }

    // Lean the chest into the arc. Small, because the clip is already
    // animating the spine and a large override reads as a broken rig.
    if (this.chest && !reduced) {
      const lean = MathUtils.clamp(s.v.y * 0.015, -0.22, 0.22);
      this.chest.rotation.x += lean;
    }
  }

  ropeOrigin(out: Vector3): 'muzzle' | 'hands' | 'none' {
    if (this.blaster) {
      this.blaster.updateWorldMatrix(true, false);
      out.copy(MUZZLE_LOCAL).applyMatrix4(this.blaster.matrixWorld);
      return 'muzzle';
    }
    return this.gripPoint(out) ? 'hands' : 'none';
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
   * The character's right, up and facing axes in world space.
   *
   * Read from the rig rather than assumed, because the body banks up to 24
   * degrees into a lane change and the arm has to clear the head it is
   * actually attached to, not a head standing upright. Model -X is his
   * right: `handslot.r` sits at x -0.883.
   */
  private readBasis(): void {
    this.actor.root.updateWorldMatrix(true, false);
    const e = this.actor.root.matrixWorld.elements;
    this.axisX.set(-(e[0] as number), -(e[1] as number), -(e[2] as number)).normalize();
    this.axisY.set(e[4] as number, e[5] as number, e[6] as number).normalize();
    this.axisZ.set(e[8] as number, e[9] as number, e[10] as number).normalize();
  }

  /** Rotate a unit `dir` by `angle` radians toward a unit `target`. */
  private tiltToward(dir: Vector3, target: Vector3, angle: number): void {
    if (angle === 0) return;
    this.perp.copy(target).addScaledVector(dir, -target.dot(dir));
    if (this.perp.lengthSq() < 1e-8) return;
    this.perp.normalize();
    dir.multiplyScalar(Math.cos(angle)).addScaledVector(this.perp, Math.sin(angle)).normalize();
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
    this.settleTo = null;

    if (phase === 'run') this.actor.play(CLIPS.matthew.run);
    else if (phase === 'land') {
      // Fit the clip to the window instead of being cut off by it. At the
      // old 0.28s you saw 42% of a 0.67s landing before the run took over.
      const clip = this.actor.duration('Jump_Land');
      this.actor.play('Jump_Land', {
        loop: false, clampWhenFinished: true, fade: 0.08,
        timeScale: clip > 0 ? clip / LAND_TIME : 1,
      });
    } else if (phase === 'launch') {
      this.actor.play('Jump_Start', { loop: false, clampWhenFinished: true, fade: 0.08 });
      // Then into the hang, because a launch outlasts the push-off.
      this.settleTo = CLIPS.matthew.hang;
      this.settleAt = this.clock + this.actor.duration('Jump_Start');
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
 * Scale a model so its BODY matches the gameplay height, and sit its feet at
 * the origin.
 *
 * Still measured rather than assumed — the packs author characters at
 * inconsistent heights and a hard-coded factor breaks silently on a
 * re-export — but measured over everything except the head. Hair is the
 * part of a character that changes, and with the whole box as the ruler
 * every change to it rescales the body underneath. The feet still come from
 * the full bounds, because that is what has to touch the road.
 */
function fitToBody(root: Object3D, target: number): number {
  const body = new Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (o.name === HEAD_MESH || !(o as Mesh).isMesh) return;
    body.expandByObject(o);
  });
  const height = body.isEmpty() ? 0 : body.getSize(new Vector3()).y;
  if (height <= 0) return 1;
  const scale = target / height;
  root.scale.setScalar(scale);
  const scaled = new Box3().setFromObject(root);
  root.position.y -= scaled.min.y;
  return scale;
}
