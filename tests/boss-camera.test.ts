import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BOSS_LAYOUT } from '../src/levels/boss/layout';
import { BossCamera } from '../src/render/boss/camera';

describe('Level 3 portrait framing', () => {
  it.each([
    [360, 800], [375, 667], [390, 844], [430, 932],
  ])('keeps the hero, boss, cake, and stage visible at %ix%i', (width, height) => {
    const view = new BossCamera();
    view.resize(width, height);
    view.camera.updateMatrixWorld();
    const projected = (x: number, y: number, z: number) => new Vector3(x, y, z).project(view.camera);
    let heroHeight = 0;
    for (const x of BOSS_LAYOUT.laneCentres) {
      const feet = projected(x, 0.08, BOSS_LAYOUT.playerZ);
      const head = projected(x, 1.63, BOSS_LAYOUT.playerZ);
      expect(Math.abs(head.x)).toBeLessThan(0.82);
      expect(feet.y).toBeGreaterThan(-0.65);
      expect(head.y).toBeLessThan(-0.1);
      expect(head.y - feet.y).toBeGreaterThan(0.18);
      heroHeight = head.y - feet.y;
    }
    const bossFeet = projected(0, BOSS_LAYOUT.bossStageY + 0.08, BOSS_LAYOUT.bossZ);
    const bossHead = projected(0, BOSS_LAYOUT.bossStageY + 4.23, BOSS_LAYOUT.bossZ);
    const cakeTop = projected(BOSS_LAYOUT.cakeX, BOSS_LAYOUT.bossStageY + 3.01, BOSS_LAYOUT.cakeZ);
    const arch = projected(0, 6.38, -8.7);
    const towerPod = projected(-3.15, 7, -15.4);
    expect(bossHead.y - bossFeet.y).toBeGreaterThan(heroHeight * 1.5);
    expect(bossHead.y).toBeGreaterThan(0.38);
    expect(bossHead.y).toBeLessThan(0.6);
    expect(cakeTop.x).toBeGreaterThan(0.25);
    expect(cakeTop.x).toBeLessThan(0.55);
    expect(cakeTop.y).toBeGreaterThan(0.3);
    expect(arch.y).toBeLessThan(0.72);
    expect(arch.y).toBeGreaterThan(bossHead.y + 0.07);
    expect(towerPod.x).toBeLessThan(-0.25);
    expect(towerPod.y).toBeGreaterThan(0.48);
    expect(towerPod.y).toBeLessThan(0.7);
  });
});
