import type { BossPractice } from '../../levels/boss/practice';

/** Flat, asset-free control diagram. The approved environment follows next. */
export class PracticeView {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  draw(game: BossPractice, time: number): void {
    const { width: w, height: h } = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#11142c'); bg.addColorStop(1, '#243550');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);

    const center = w / 2;
    const span = Math.min(w * 0.29, 112);
    const playerY = h * 0.74;
    const targetY = h * 0.27;
    const laneX = (index: number) => center + (index - 1) * span;
    const floorTop = h * 0.43;
    c.fillStyle = '#324760';
    c.beginPath();
    c.moveTo(center - span * 1.57, h);
    c.lineTo(center - span * 1.35, floorTop);
    c.lineTo(center + span * 1.35, floorTop);
    c.lineTo(center + span * 1.57, h);
    c.closePath(); c.fill();
    for (let lane = 0; lane < 3; lane++) {
      const x = laneX(lane);
      c.strokeStyle = lane === game.lane ? '#f1c775' : '#668198';
      c.lineWidth = lane === game.lane ? 3 : 1;
      c.setLineDash(lane === game.lane ? [] : [9, 11]);
      c.beginPath(); c.moveTo(x, floorTop + 8); c.lineTo(x, h); c.stroke();
      c.setLineDash([]);
      c.fillStyle = lane === game.lane ? '#f1c775' : '#9cb2c6';
      c.font = '600 12px system-ui'; c.textAlign = 'center';
      c.fillText(String(lane + 1), x, h * 0.91);
    }

    // The boss target is a fixed aim point, available from all three lanes.
    const pulse = Math.sin(time * 2.5) * 4;
    c.strokeStyle = '#f3a3e9'; c.lineWidth = 3;
    c.beginPath(); c.arc(center, targetY, 40 + pulse, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#962f9d';
    c.beginPath(); c.arc(center, targetY, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff0ff'; c.font = '700 14px system-ui';
    c.fillText('AURORA', center, targetY + 5);

    const playerX = center + (game.renderX / game.lanes.laneWidth) * span;
    c.fillStyle = '#54a7ed';
    c.beginPath(); c.arc(playerX, playerY, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#10284c'; c.beginPath(); c.arc(playerX, playerY, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = '700 12px system-ui'; c.fillText('YOU', playerX, playerY + 40);

    for (const shot of game.activeShots) {
      const startX = laneX(shot.lane);
      const t = shot.progress;
      const x = startX + (center - startX) * t;
      const y = playerY - 27 + (targetY - playerY + 27) * t;
      c.fillStyle = '#ffe787';
      c.beginPath(); c.arc(x, y, 7 + 3 * t, 0, Math.PI * 2); c.fill();
    }
  }
}
