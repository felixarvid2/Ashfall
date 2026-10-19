/**
 * Sound controls: a speaker button (mute) and a volume button on the HUD (bottom right on desktop;
 * the touch layouts get the same two buttons in their menu row), and the volume rows (master, music, effects,
 * interface) that the settings panel shows in its Sound tab; the volume button opens that tab. Each row has a
 * slider, a percent readout and -/+ 10 steppers, and plays a short interface tick when a change is final (P095).
 * Settings live in `Settings.audio`; the owner applies and saves.
 */
import { cssUrl } from './art';
import { t } from '../data/i18n';
import type { AudioSettings } from '../data/settings';
import { audio } from '../audio/engine';

const iconUrl = (id: string): string => `${import.meta.env.BASE_URL}assets/ui/menu/${id}.svg`;

const SLIDERS = ['master', 'music', 'sfx', 'ui'] as const;

export interface SoundUiHooks {
  /** A slider moved: apply the volumes now. */
  apply: () => void;
  /** A change is final: save the settings. */
  save: () => void;
  toggleMute: () => void;
  /** Label of the mute key ("N"). */
  muteKey: () => string;
}

/** A button the touch layout adds to its menu row. */
export interface TouchMenuEntry {
  id: string;
  label: string;
  onClick: () => void;
  onBuilt?: (button: HTMLButtonElement) => void;
}

export class SoundUi {
  /** The volume rows (master, music, effects, interface): the settings panel shows them in its Sound tab. */
  readonly rows: HTMLDivElement;
  /** What the volume button opens: the settings panel on its Sound tab (set by the game). */
  openSettings: (() => void) | null = null;
  private readonly muteButtons: HTMLButtonElement[] = [];
  private readonly sliders = new Map<(typeof SLIDERS)[number], { input: HTMLInputElement; value: HTMLElement; row: HTMLElement }>();

  constructor(
    root: HTMLElement,
    private readonly settings: () => AudioSettings,
    private readonly hooks: SoundUiHooks,
  ) {
    const hud = document.createElement('div');
    hud.className = 'sound-hud';
    const mute = this.button('sound-mute', () => hooks.toggleMute());
    const open = this.button('sound-open', () => this.toggle());
    open.title = t('sound.settings');
    open.setAttribute('aria-label', t('sound.settings'));
    this.setIcon(open, 'sound-settings');
    this.muteButtons.push(mute);
    hud.append(mute, open);

    this.rows = document.createElement('div');
    this.rows.className = 'sound-rows';
    for (const key of SLIDERS) this.rows.append(this.buildRow(key));
    root.append(hud);
    this.refresh();
  }

  private buildRow(key: (typeof SLIDERS)[number]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sound-row';
    row.dataset.testid = `sound-row-${key}`;
    const name = Object.assign(document.createElement('span'), { className: 'sound-name', textContent: t(`sound.${key}`) });
    const value = Object.assign(document.createElement('output'), { className: 'sound-value' });
    value.dataset.testid = `sound-value-${key}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.dataset.testid = `sound-${key}`;
    input.setAttribute('aria-label', t(`sound.${key}`));
    const set = (percent: number, final: boolean) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      input.value = String(clamped);
      value.textContent = `${clamped}%`;
      this.settings()[key] = clamped / 100;
      this.hooks.apply();
      if (final) this.commit();
    };
    input.addEventListener('input', () => set(Number(input.value), false));
    // A change is final when the thumb is released: save and play a tick so the level can be judged.
    input.addEventListener('change', () => this.commit());
    const step = (dir: -1 | 1) => {
      const b = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'sound-step',
        textContent: dir < 0 ? '−' : '+',
      });
      b.dataset.testid = `sound-${key}-${dir < 0 ? 'dec' : 'inc'}`;
      b.setAttribute('aria-label', t(dir < 0 ? 'sound.lower' : 'sound.raise', { name: t(`sound.${key}`) }));
      b.addEventListener('click', () => set(Number(input.value) + dir * 10, true));
      return b;
    };
    row.append(name, value, step(-1), input, step(1));
    this.sliders.set(key, { input, value, row });
    return row;
  }

  /** The value is final: save the settings and play the interface tick. */
  private commit(): void {
    this.hooks.save();
    audio.play('ui.equip');
  }

  private button(testid: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'sound-btn';
    b.dataset.testid = testid;
    b.append(Object.assign(document.createElement('span'), { className: 'sound-icon' }));
    b.addEventListener('click', onClick);
    return b;
  }

  private setIcon(button: HTMLElement, id: string): void {
    const icon = button.querySelector<HTMLElement>('.sound-icon, .touch-menu-icon');
    icon?.style.setProperty('--icon', cssUrl(iconUrl(id)));
  }

  /** The two buttons for the touch menu row (speaker, volume settings). */
  touchEntries(): TouchMenuEntry[] {
    return [
      { id: 'sound', label: t('touch.menu.sound'), onClick: () => this.hooks.toggleMute(), onBuilt: (b) => this.muteButtons.push(b) },
      { id: 'sound-settings', label: t('touch.menu.soundSettings'), onClick: () => this.toggle() },
    ];
  }

  /** Open the settings panel on its Sound tab. */
  toggle(): void {
    this.openSettings?.();
  }

  /** Show the current mute state and slider positions. */
  refresh(): void {
    const a = this.settings();
    const label = a.muted ? t('sound.unmute', { key: this.hooks.muteKey() }) : t('sound.mute', { key: this.hooks.muteKey() });
    for (const b of this.muteButtons) {
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(a.muted));
      b.classList.toggle('muted', a.muted);
      this.setIcon(b, a.muted ? 'sound-off' : 'sound');
    }
    for (const [key, { input, value, row }] of this.sliders) {
      const percent = Math.round(a[key] * 100);
      input.value = String(percent);
      value.textContent = `${percent}%`;
      row.classList.toggle('muted', a.muted);
    }
  }
}
