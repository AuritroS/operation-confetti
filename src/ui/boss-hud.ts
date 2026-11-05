import './boss-hud.css';

/**
 * What the boss HUD needs. `BossSnapshot` satisfies this structurally.
 *
 * Declared here rather than imported from the level so the UI layer does not
 * depend on a level's internals — the HUD should be renderable from any
 * source of these numbers, including a test.
 */
export interface BossReadout {
  readonly state: 'practice' | 'playing' | 'victory' | 'defeat';
  readonly beat: 'attack' | 'exposed' | 'gap';
  readonly playerHp: number;
  readonly bossHp: number;
  readonly gun: { readonly ready: boolean; readonly progress: number; readonly jammed: boolean };
}

const HEART = 'M12 20.3l-1.5-1.3C5.4 14.4 2 11.4 2 7.8 2 5 4.2 3 7 3c1.6 0 3.1.7 4 1.9C11.9 3.7 13.4 3 15 3c2.8 0 5 2 5 4.8 0 3.6-3.4 6.6-8.5 11.2l-1.5 1.3z';

/**
 * Aurora's health, Matthew's hearts, and the cannon.
 *
 * Builds its own DOM into a container instead of binding ids in a page, so
 * two pages cannot drift apart by each keeping their own copy of the markup —
 * which is exactly how the campaign ended up with a line of plain text where
 * level 3's standalone page had the designed bars.
 */
export class BossHud {
  private readonly bar: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly health: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly hearts: HTMLElement;
  private readonly pips: SVGElement[] = [];
  private readonly gun: HTMLElement;
  private readonly gunFill: HTMLElement;
  private readonly gunLabel: HTMLElement;

  constructor(container: HTMLElement, maxHearts = 5) {
    this.bar = document.createElement('div');
    this.bar.className = 'boss-bar';
    this.bar.innerHTML =
      '<div class="boss-bar-row"><span class="boss-bar-name">AURORA</span><strong>100</strong></div>'
      + '<div class="boss-bar-track"><i></i></div>';
    this.health = this.bar.querySelector('strong')!;
    this.healthFill = this.bar.querySelector('.boss-bar-track i')!;

    this.strip = document.createElement('div');
    this.strip.className = 'player-strip';
    this.strip.innerHTML =
      '<div class="hearts" role="img" aria-label="Health"></div>'
      + '<div class="gun"><div class="gun-track"><i></i></div><span class="gun-label">READY</span></div>';
    this.hearts = this.strip.querySelector('.hearts')!;
    this.gun = this.strip.querySelector('.gun')!;
    this.gunFill = this.strip.querySelector('.gun-track i')!;
    this.gunLabel = this.strip.querySelector('.gun-label')!;

    for (let i = 0; i < maxHearts; i++) {
      // Drawn rather than typed: the heart glyph renders as a colour emoji on
      // some platforms, which would fight the palette and ignore the
      // lost-heart styling.
      this.hearts.insertAdjacentHTML('beforeend',
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}"/></svg>`);
      this.pips.push(this.hearts.lastElementChild as SVGElement);
    }

    container.append(this.bar, this.strip);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.bar.hidden = !visible;
    this.strip.hidden = !visible;
  }

  update(s: BossReadout): void {
    // Practice is unscored and damage-free, so showing health there would be
    // describing a fight that is not happening.
    const fighting = s.state !== 'practice';
    this.setVisible(fighting);
    if (!fighting) return;

    this.health.textContent = String(s.bossHp);
    this.healthFill.style.width = `${s.bossHp}%`;
    this.bar.classList.toggle('exposed', s.state === 'playing' && s.beat === 'exposed');

    for (let i = 0; i < this.pips.length; i++) {
      this.pips[i]!.classList.toggle('lost', i >= s.playerHp);
    }
    this.hearts.setAttribute('aria-label', `${s.playerHp} of ${this.pips.length} hearts`);

    const { ready, progress, jammed } = s.gun;
    this.gunFill.style.width = `${progress * 100}%`;
    this.gun.classList.toggle('charging', !ready && !jammed);
    this.gun.classList.toggle('jammed', jammed);
    this.gunLabel.textContent = jammed ? 'JAMMED' : ready ? 'READY' : 'CHARGING';
  }

  dispose(): void {
    this.bar.remove();
    this.strip.remove();
  }
}
