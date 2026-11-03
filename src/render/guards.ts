/**
 * Guard encounters (design doc §5).
 *
 * Four encounters along the route, presented by a pool of two animated
 * guards. Only one or two are ever in view, so pooling keeps the draw cost
 * of an eight-mesh skinned character from multiplying — and the doc rules out
 * InstancedMesh here, because each skeleton animates independently.
 *
 * The important property is that a guard decides nothing. Its lane is
 * authored in the level data, and the searchlight locks to that lane while
 * the player is still far away. The doc forbids targeting a lane on hidden
 * last-millisecond input (§7); giving the runtime no choice to make is the
 * strongest form of complying with that.
 *
 * Guards never chase, never path, and have no stealth meter. They patrol a
 * fixed sidestep and telegraph. That is the whole behaviour.
 */
import { Group, type Object3D } from 'three';
import { AssetBundle, type Actor } from '../assets/characters';
import { CHARACTER_HEIGHT, CLIPS, HIDDEN_MESHES, SOURCES } from '../assets/manifest';
import { Box3, Vector3 } from 'three';
import { Searchlight } from './effects';
import type { LevelConfig } from '../levels/types';
import type { TrackedEntity } from '../levels/runner';

/** Distance at which a guard becomes visible and its light starts sweeping. */
const APPEAR_DISTANCE = 42;

/** Distance at which the light commits to the authored lane. */
const LOCK_DISTANCE = 26;

/** Distance at which the strike pose begins. */
const STRIKE_DISTANCE = 6;

/** Two is enough: encounters are 30+ units apart and draw distance is 44. */
const POOL_SIZE = 2;

interface GuardSlot {
  readonly actor: Actor;
  readonly light: Searchlight;
  readonly root: Group;
  entityId: string | null;
}

export class GuardPool {
  readonly group = new Group();
  private readonly slots: GuardSlot[] = [];

  private constructor(
    private readonly level: LevelConfig,
    slots: GuardSlot[],
  ) {
    this.slots = slots;
    for (const slot of slots) this.group.add(slot.root);
  }

  /**
   * Load the guard model and its clips, then build the pool.
   *
   * Resolves to null rather than throwing if the assets are missing, so a
   * failed load costs the telegraph but leaves the level playable — the
   * collider is in the runner and does not depend on any of this.
   */
  static async load(level: LevelConfig): Promise<GuardPool | null> {
    try {
      const bundle = new AssetBundle();
      await bundle.loadAll([SOURCES.characters.guard, ...SOURCES.animationLibraries]);

      const slots: GuardSlot[] = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const actor = bundle.actor(SOURCES.characters.guard);
        actor.hideMeshes(HIDDEN_MESHES['guard'] ?? []);
        // Face the oncoming player.
        actor.root.rotation.y = 0;
        fitToHeight(actor.root, CHARACTER_HEIGHT);
        actor.play(CLIPS.guard.idle);

        const light = new Searchlight(level.laneCount, level.laneWidth, 5.5);

        const root = new Group();
        root.add(actor.root, light.group);
        root.visible = false;

        slots.push({ actor, light, root, entityId: null });
      }
      return new GuardPool(level, slots);
    } catch (e) {
      console.warn('[guards] load failed; encounters will have no visual', e);
      return null;
    }
  }

  private laneX(lane: number): number {
    return (lane - (this.level.laneCount - 1) / 2) * this.level.laneWidth;
  }

  /**
   * Assign the nearest pending guard encounters to the pool and drive them.
   *
   * The sweep/lock/strike progression is a pure function of distance, so it
   * replays identically and cannot be influenced by what the player does.
   */
  update(tracked: readonly TrackedEntity[], step: number): void {
    const upcoming = tracked
      .filter((t) => t.entity.kind === 'guard' && t.relativeZ < APPEAR_DISTANCE && t.relativeZ > -6)
      .sort((a, b) => a.relativeZ - b.relativeZ)
      .slice(0, POOL_SIZE);

    for (const [i, slot] of this.slots.entries()) {
      const target = upcoming[i];
      if (!target) {
        slot.root.visible = false;
        slot.entityId = null;
        slot.actor.update(step);
        continue;
      }

      const ahead = target.relativeZ;
      slot.root.visible = true;

      // The searchlight group carries its own x, so the root only moves in z.
      slot.root.position.set(0, 0, -ahead);
      slot.actor.root.position.x = this.laneX(target.entity.lane);

      if (slot.entityId !== target.entity.id) {
        // New encounter in this slot: reset the telegraph from the start.
        slot.entityId = target.entity.id;
        slot.light.sweep();
        slot.actor.play(CLIPS.guard.walk);
      }

      if (ahead <= STRIKE_DISTANCE) {
        if (slot.light.currentState !== 'striking') slot.light.strike();
        if (target.state === 'hit') slot.actor.play(CLIPS.guard.react, { loop: false });
      } else if (ahead <= LOCK_DISTANCE) {
        if (slot.light.currentState === 'sweeping') {
          slot.light.lockTo(target.entity.lane);
          slot.actor.play(CLIPS.guard.idle);
        }
      }

      slot.light.update(step);
      slot.actor.update(step);
    }
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.actor.dispose();
      slot.light.dispose();
      slot.root.removeFromParent();
    }
    this.slots.length = 0;
    this.group.removeFromParent();
  }
}

/** Scale a character to the gameplay height, as the player loader does. */
function fitToHeight(root: Object3D, target: number): void {
  const box = new Box3().setFromObject(root);
  const height = box.getSize(new Vector3()).y;
  if (height <= 0) return;
  root.scale.setScalar(target / height);
  const scaled = new Box3().setFromObject(root);
  root.position.y -= scaled.min.y;
}
