/**
 * Sound controls: a speaker button (mute) and a volume button on the HUD (bottom right on desktop;
 * the touch layouts get the same two buttons in their menu row), and a small panel with a slider
 * for master, music, effects and interface. Settings live in `Settings.audio`; the owner applies and saves.
 */
import { cssUrl } from './art';
import { t } from '../data/i18n';
import type { AudioSettings } from '../data/settings';

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
  readonly panel: HTMLDivElement;
  private readonly muteButtons: HTMLButtonElement[] = [];
  private readonly sliders = new Map<(typeof SLIDERS)[number], HTMLInputElement>();

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

    this.panel = document.createElement('div');
    this.panel.className = 'sound-panel panel';
    this.panel.dataset.testid = 'sound-panel';
    this.panel.hidden = true;
    const title = document.createElement('h2');
    title.textContent = t('sound.title');
    this.panel.append(title);
    for (const key of SLIDERS) {
      const row = document.createElement('label');
      row.className = 'sound-row';
      const name = document.createElement('span');
      name.textContent = t(`sound.${key}`);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.dataset.testid = `sound-${key}`;
      input.addEventListener('input', () => {
        this.settings()[key] = Number(input.value) / 100;
        hooks.apply();
      });
      input.addEventListener('change', () => hooks.save());
      this.sliders.set(key, input);
      row.append(name, input);
      this.panel.append(row);
    }
    const close = document.createElement('button');
    close.className = 'sound-close';
    close.textContent = t('sound.close');
    close.addEventListener('click', () => this.toggle(false));
    this.panel.append(close);

    root.append(hud, this.panel);
    this.refresh();
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

  /** The two buttons for the touch menu row (speaker, volume panel). */
  touchEntries(): TouchMenuEntry[] {
    return [
      { id: 'sound', label: t('touch.menu.sound'), onClick: () => this.hooks.toggleMute(), onBuilt: (b) => this.muteButtons.push(b) },
      { id: 'sound-settings', label: t('touch.menu.soundSettings'), onClick: () => this.toggle() },
    ];
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  toggle(open = this.panel.hidden): void {
    this.panel.hidden = !open;
    if (open) this.refresh();
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
    for (const [key, input] of this.sliders) input.value = String(Math.round(a[key] * 100));
    this.panel.classList.toggle('muted', a.muted);
  }
}
