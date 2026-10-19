/**
 * The Settings panel (menu button with the sliders icon): Sound | Display | Controls tabs.
 *
 * Usage: `new SettingsPanel(uiRoot, deps)`; `panel.open('display')` / `panel.close()` / `panel.toggle(tab?)`;
 * `panel.element` is the root for `panelStack.register`. Values are read from `deps.settings()` and every change
 * goes through `deps.apply(patch)`, which the game uses to change the setting, apply it and save it.
 * The Sound tab holds the existing volume rows of `SoundUi` (moved in, so the sound work lives in one place).
 */
import { t } from '../data/i18n';
import type { Settings } from '../data/settings';
import { hapticsSupported, haptic } from './haptics';
import type { SoundUi } from './soundPanel';

export type SettingsTab = 'sound' | 'display' | 'controls';
const TABS: SettingsTab[] = ['sound', 'display', 'controls'];

export interface SettingsDeps {
  settings: () => Settings;
  /** Change settings, apply them and save. */
  apply: (patch: Partial<Settings>) => void;
  soundUi: SoundUi;
  /** Mute switch of the Sound tab. */
  toggleMute: () => void;
}

/** Text size steps: label key, scale. */
export const TEXT_SIZES: { key: 's' | 'm' | 'l' | 'xl'; scale: number }[] = [
  { key: 's', scale: 0.9 },
  { key: 'm', scale: 1 },
  { key: 'l', scale: 1.15 },
  { key: 'xl', scale: 1.35 },
];
const BUTTON_SIZES: { key: 's' | 'm' | 'l'; scale: number }[] = [
  { key: 's', scale: 0.9 },
  { key: 'm', scale: 1 },
  { key: 'l', scale: 1.2 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class SettingsPanel {
  private readonly root: HTMLDivElement;
  private readonly tabButtons = new Map<SettingsTab, HTMLButtonElement>();
  private readonly pages = new Map<SettingsTab, HTMLDivElement>();
  private current: SettingsTab = 'sound';
  private readonly refreshers: (() => void)[] = [];

  constructor(parent: HTMLElement, private readonly deps: SettingsDeps) {
    this.root = el('div', 'settings-panel panel');
    this.root.hidden = true;
    this.root.dataset.testid = 'settings-panel';
    const title = el('h2', undefined, t('settings.title'));
    const tabs = el('div', 'settings-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const id of TABS) {
      const b = el('button', 'settings-tab', t(`settings.tabs.${id}`));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.testid = `settings-tab-${id}`;
      b.addEventListener('click', () => this.select(id));
      tabs.append(b);
      this.tabButtons.set(id, b);
    }
    this.root.append(title, tabs);
    this.pages.set('sound', this.buildSound());
    this.pages.set('display', this.buildDisplay());
    this.pages.set('controls', this.buildControls());
    for (const page of this.pages.values()) this.root.append(page);
    parent.append(this.root);
    this.select('sound');
  }

  get element(): HTMLElement {
    return this.root;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get tab(): SettingsTab {
    return this.current;
  }

  /** Shows the panel on a tab (the current one when omitted). */
  show(tab: SettingsTab = this.current): void {
    this.select(tab);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(tab?: SettingsTab): void {
    if (this.open) this.close();
    else this.show(tab);
  }

  private select(tab: SettingsTab): void {
    this.current = tab;
    for (const [id, b] of this.tabButtons) {
      b.classList.toggle('active', id === tab);
      b.setAttribute('aria-selected', String(id === tab));
    }
    for (const [id, page] of this.pages) page.hidden = id !== tab;
    this.refresh();
  }

  /** Re-reads every control from the settings. */
  refresh(): void {
    this.deps.soundUi.refresh();
    for (const fn of this.refreshers) fn();
  }

  // ---- Pages ----------------------------------------------------------------------------------

  private page(name: SettingsTab): HTMLDivElement {
    const page = el('div', 'settings-page');
    page.dataset.testid = `settings-page-${name}`;
    return page;
  }

  private buildSound(): HTMLDivElement {
    const page = this.page('sound');
    page.append(
      this.switchRow(t('sound.title'), undefined, () => !this.deps.settings().audio.muted, () => {
        this.deps.toggleMute();
      }),
      this.deps.soundUi.rows,
    );
    return page;
  }

  private buildDisplay(): HTMLDivElement {
    const page = this.page('display');
    // Text size with a live preview line.
    const preview = el('p', 'settings-preview', t('settings.textPreview'));
    const sizes = this.segmented(
      TEXT_SIZES.map((s) => ({ id: s.key, label: t(`settings.sizes.${s.key}`) })),
      () => TEXT_SIZES.reduce((best, s) => (Math.abs(s.scale - this.deps.settings().textScale) < Math.abs(best.scale - this.deps.settings().textScale) ? s : best)).key,
      (id) => this.deps.apply({ textScale: TEXT_SIZES.find((s) => s.key === id)!.scale }),
      'text-size',
    );
    page.append(this.row(t('settings.textSize'), sizes, preview));
    // Graphics.
    const hint = el('p', 'settings-hint');
    const graphics = this.segmented(
      (['low', 'medium', 'high'] as const).map((g) => ({ id: g, label: t(`settings.graphicsLevels.${g}`) })),
      () => this.deps.settings().graphics,
      (id) => this.deps.apply({ graphics: id as Settings['graphics'] }),
      'graphics',
    );
    this.refreshers.push(() => (hint.textContent = t(`settings.graphicsHint.${this.deps.settings().graphics}`)));
    page.append(this.row(t('settings.graphics'), graphics, hint));
    page.append(
      this.switchRow(t('settings.screenShake'), undefined, () => this.deps.settings().screenShake, (on) => this.deps.apply({ screenShake: on }), 'shake'),
      this.switchRow(t('settings.showFps'), undefined, () => this.deps.settings().showFps, (on) => this.deps.apply({ showFps: on }), 'fps'),
    );
    if (hapticsSupported()) {
      page.append(
        this.switchRow(t('settings.vibration'), t('settings.vibrationHint'), () => this.deps.settings().haptics, (on) => {
          this.deps.apply({ haptics: on });
          if (on) haptic('success');
        }, 'vibration'),
      );
    }
    page.append(
      this.switchRow(t('settings.pauseInMenus'), t('settings.pauseInMenusHint'), () => this.deps.settings().pauseInMenus, (on) => this.deps.apply({ pauseInMenus: on }), 'pause'),
    );
    return page;
  }

  private buildControls(): HTMLDivElement {
    const page = this.page('controls');
    page.append(
      this.row(
        t('settings.touchControls'),
        this.segmented(
          (['auto', 'on', 'off'] as const).map((m) => ({ id: m, label: t(`touch.modes.${m}`) })),
          () => this.deps.settings().touchControls,
          (id) => this.deps.apply({ touchControls: id as Settings['touchControls'] }),
          'touch',
        ),
      ),
      this.row(
        t('settings.moveMode'),
        this.segmented(
          (['click', 'wasd'] as const).map((m) => ({ id: m, label: t(`settings.moveModes.${m}`) })),
          () => this.deps.settings().moveMode,
          (id) => this.deps.apply({ moveMode: id as Settings['moveMode'] }),
          'move',
        ),
      ),
      this.row(
        t('settings.thumbLayout'),
        this.segmented(
          (['right', 'left'] as const).map((m) => ({ id: m, label: t(`settings.layouts.${m}`) })),
          () => this.deps.settings().touchLayout,
          (id) => this.deps.apply({ touchLayout: id as Settings['touchLayout'] }),
          'layout',
        ),
      ),
      this.row(
        t('settings.buttonSize'),
        this.segmented(
          BUTTON_SIZES.map((s) => ({ id: s.key, label: t(`settings.sizes.${s.key}`) })),
          () => BUTTON_SIZES.reduce((best, s) => (Math.abs(s.scale - this.deps.settings().buttonScale) < Math.abs(best.scale - this.deps.settings().buttonScale) ? s : best)).key,
          (id) => this.deps.apply({ buttonScale: BUTTON_SIZES.find((s) => s.key === id)!.scale }),
          'button-size',
        ),
      ),
    );
    return page;
  }

  // ---- Controls -------------------------------------------------------------------------------

  private row(label: string, control: HTMLElement, extra?: HTMLElement): HTMLDivElement {
    const row = el('div', 'settings-row');
    row.append(el('div', 'settings-label', label), control);
    if (extra) row.append(extra);
    return row;
  }

  /** A row of buttons, one active. */
  private segmented(options: { id: string; label: string }[], value: () => string, change: (id: string) => void, testid: string): HTMLDivElement {
    const group = el('div', 'settings-seg');
    group.setAttribute('role', 'radiogroup');
    group.dataset.testid = `setting-${testid}`;
    const buttons = options.map((o) => {
      const b = el('button', 'seg', o.label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.value = o.id;
      b.addEventListener('click', () => {
        haptic('tick');
        change(o.id);
        sync();
      });
      group.append(b);
      return b;
    });
    const sync = () => {
      const v = value();
      for (const b of buttons) {
        b.classList.toggle('active', b.dataset.value === v);
        b.setAttribute('aria-checked', String(b.dataset.value === v));
      }
    };
    this.refreshers.push(sync);
    sync();
    return group;
  }

  /** A label with an on/off switch. */
  private switchRow(label: string, hint: string | undefined, value: () => boolean, change: (on: boolean) => void, testid = 'switch'): HTMLDivElement {
    const row = el('div', 'settings-row settings-switch-row');
    const text = el('div', 'settings-label', label);
    const sw = el('button', 'switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.dataset.testid = `setting-${testid}`;
    sw.append(el('span', 'switch-knob'));
    const sync = () => {
      const on = value();
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', String(on));
      sw.setAttribute('aria-label', label);
    };
    sw.addEventListener('click', () => {
      haptic('tick');
      change(!value());
      sync();
    });
    this.refreshers.push(sync);
    sync();
    row.append(text, sw);
    if (hint) row.append(el('p', 'settings-hint', hint));
    return row;
  }
}
