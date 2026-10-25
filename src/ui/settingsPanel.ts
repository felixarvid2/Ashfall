/**
 * The Settings panel (menu button with the sliders icon): Sound | Display | Controls tabs.
 *
 * Usage: `new SettingsPanel(uiRoot, deps)`; `panel.open('display')` / `panel.close()` / `panel.toggle(tab?)`;
 * `panel.element` is the root for `panelStack.register`. Values are read from `deps.settings()` and every change
 * goes through `deps.apply(patch)`, which the game uses to change the setting, apply it and save it.
 * The Sound tab holds the existing volume rows of `SoundUi` (moved in, so the sound work lives in one place).
 */
import { t } from '../data/i18n';
import {
  BRIGHTNESS_RANGE,
  MAX_KEYS_PER_ACTION,
  PAD_ACTIONS,
  isBindableKey,
  isBindablePadButton,
  rebindKey,
  rebindPad,
  resetBinding,
  resetPadBinding,
  resolveKeybindings,
  resolvePadBindings,
  tabDefaults,
  type Action,
  type PadAction,
  type Settings,
} from '../data/settings';
import type { GamepadInput } from '../core/gamepad';
import { armConfirm } from './confirmSheet';
import { hapticsSupported, haptic } from './haptics';
import { keyLabel } from './hud';
import { panelStack } from './panelStack';
import type { SoundUi } from './soundPanel';

export type SettingsTab = 'sound' | 'display' | 'controls';
const TABS: SettingsTab[] = ['sound', 'display', 'controls'];

export interface SettingsDeps {
  settings: () => Settings;
  /** Reset tips (B06): every onboarding tip and first-run banner shows again, and Show tips turns on. */
  resetTips?: () => void;
  /** Change settings, apply them and save. */
  apply: (patch: Partial<Settings>) => void;
  soundUi: SoundUi;
  /** Mute switch of the Sound tab. */
  toggleMute: () => void;
  /** The gamepad, for rebinding its buttons (A02); without it the Gamepad group is left out. */
  pad?: GamepadInput;
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

/** The key list of Settings > Controls, in groups (B042). Every action of the data model appears once. */
export const KEY_GROUPS: { id: 'movement' | 'combat' | 'panels' | 'system'; actions: Action[] }[] = [
  { id: 'movement', actions: ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'dodge', 'forceStand'] },
  { id: 'combat', actions: ['skill1', 'skill2', 'skill3', 'skill4', 'potion', 'pickup', 'showLabels', 'mount', 'flare', 'respawn'] },
  { id: 'panels', actions: ['inventory', 'character', 'skills', 'map', 'quests'] },
  { id: 'system', actions: ['quickSave', 'quickLoad', 'toggleMute', 'toggleDebug'] },
];

/**
 * The colour-blind palette is a class and a data attribute on the UI root, so every stylesheet can use it (B044):
 * `.colorblind[data-colorblind=protanopia|deuteranopia|tritanopia]`. (`.reduce-flashing` is set by `Hud.setReduceFlashing`.)
 */
export function applyAccessibility(root: Element, s: Pick<Settings, 'colorblind'>): void {
  root.classList.toggle('colorblind', s.colorblind !== 'off');
  if (root instanceof HTMLElement) {
    if (s.colorblind === 'off') delete root.dataset.colorblind;
    else root.dataset.colorblind = s.colorblind;
  }
}

/** A synthetic keydown can carry `key` only (no `code`): a letter or digit still names its physical key. */
function codeFromKey(key: string | undefined): string {
  if (!key || key.length !== 1) return '';
  if (/[a-z]/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/[0-9]/.test(key)) return `Digit${key}`;
  return '';
}

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
  private readonly host: HTMLElement;
  /** The key list row that waits for a key press (B042). */
  private stopListening: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly deps: SettingsDeps) {
    this.host = parent;
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
    applyAccessibility(parent, this.deps.settings());
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
    this.stopListening?.();
    this.root.hidden = true;
  }

  toggle(tab?: SettingsTab): void {
    if (this.open) this.close();
    else this.show(tab);
  }

  private select(tab: SettingsTab): void {
    this.stopListening?.();
    this.current = tab;
    for (const [id, b] of this.tabButtons) {
      b.classList.toggle('active', id === tab);
      b.setAttribute('aria-selected', String(id === tab));
    }
    for (const [id, page] of this.pages) page.hidden = id !== tab;
    this.refresh();
  }

  /** Changes settings through the game, then updates the accessibility classes on the UI root. */
  private change(patch: Partial<Settings>): void {
    this.deps.apply(patch);
    applyAccessibility(this.host, this.deps.settings());
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
      (id) => this.change({ textScale: TEXT_SIZES.find((s) => s.key === id)!.scale }),
      'text-size',
    );
    page.append(this.row(t('settings.textSize'), sizes, preview));
    // Graphics.
    const hint = el('p', 'settings-hint');
    const graphics = this.segmented(
      (['low', 'medium', 'high'] as const).map((g) => ({ id: g, label: t(`settings.graphicsLevels.${g}`) })),
      () => this.deps.settings().graphics,
      (id) => this.change({ graphics: id as Settings['graphics'] }),
      'graphics',
    );
    this.refreshers.push(() => (hint.textContent = t(`settings.graphicsHint.${this.deps.settings().graphics}`)));
    page.append(this.row(t('settings.graphics'), graphics, hint));
    page.append(
      this.switchRow(t('settings.screenShake'), undefined, () => this.deps.settings().screenShake, (on) => this.change({ screenShake: on }), 'shake'),
      this.switchRow(t('settings.showFps'), undefined, () => this.deps.settings().showFps, (on) => this.change({ showFps: on }), 'fps'),
      this.switchRow(t('settings.showTips'), t('settings.showTipsHint'), () => this.deps.settings().showTips, (on) => this.change({ showTips: on }), 'tips'),
      this.resetTipsRow(),
    );
    if (hapticsSupported()) {
      // Vibration only matters on a phone: `html:not(.touch-device) .touch-only` hides it (B043, menus.css).
      const vibration = this.switchRow(t('settings.vibration'), t('settings.vibrationHint'), () => this.deps.settings().haptics, (on) => {
        this.change({ haptics: on });
        if (on) haptic('success');
      }, 'vibration');
      vibration.classList.add('touch-only');
      page.append(vibration);
    }
    page.append(
      this.switchRow(t('settings.pauseInMenus'), t('settings.pauseInMenusHint'), () => this.deps.settings().pauseInMenus, (on) => this.change({ pauseInMenus: on }), 'pause'),
      this.sliderRow(t('settings.brightness'), t('settings.brightnessHint'), BRIGHTNESS_RANGE, () => this.deps.settings().brightness, (v) => this.change({ brightness: v }), 'brightness'),
      this.row(
        t('settings.lootLabels'),
        this.segmented(
          (['all', 'magic', 'rare', 'legendary'] as const).map((m) => ({ id: m, label: t(`settings.lootLabelLevels.${m}`) })),
          () => this.deps.settings().lootLabelMin,
          (id) => this.change({ lootLabelMin: id as Settings['lootLabelMin'] }),
          'loot-labels',
        ),
        el('p', 'settings-hint', t('settings.lootLabelsHint')),
      ),
      el('h3', 'settings-group', t('settings.accessibility')),
      this.switchRow(t('settings.reduceFlashing'), t('settings.reduceFlashingHint'), () => this.deps.settings().reduceFlashing, (on) => this.change({ reduceFlashing: on }), 'reduce-flashing'),
      this.switchRow(t('settings.reduceMotion'), t('settings.reduceMotionHint'), () => this.deps.settings().reduceMotion, (on) => this.change({ reduceMotion: on }), 'reduce-motion'),
      this.row(
        t('settings.colorblind'),
        this.segmented(
          (['off', 'protanopia', 'deuteranopia', 'tritanopia'] as const).map((m) => ({ id: m, label: t(`settings.colorblindModes.${m}`) })),
          () => this.deps.settings().colorblind,
          (id) => this.change({ colorblind: id as Settings['colorblind'] }),
          'colorblind',
        ),
        el('p', 'settings-hint', t('settings.colorblindHint')),
      ),
      this.resetRow('display'),
    );
    return page;
  }

  private buildControls(): HTMLDivElement {
    const page = this.page('controls');
    const thumbLayout = this.row(
      t('settings.thumbLayout'),
      this.segmented(
        (['right', 'left'] as const).map((m) => ({ id: m, label: t(`settings.layouts.${m}`) })),
        () => this.deps.settings().touchLayout,
        (id) => this.change({ touchLayout: id as Settings['touchLayout'] }),
        'layout',
      ),
    );
    const buttonSize = this.row(
      t('settings.buttonSize'),
      this.segmented(
        BUTTON_SIZES.map((s) => ({ id: s.key, label: t(`settings.sizes.${s.key}`) })),
        () => BUTTON_SIZES.reduce((best, s) => (Math.abs(s.scale - this.deps.settings().buttonScale) < Math.abs(best.scale - this.deps.settings().buttonScale) ? s : best)).key,
        (id) => this.change({ buttonScale: BUTTON_SIZES.find((s) => s.key === id)!.scale }),
        'button-size',
      ),
    );
    thumbLayout.classList.add('touch-only');
    buttonSize.classList.add('touch-only');
    page.append(
      this.row(
        t('settings.touchControls'),
        this.segmented(
          (['auto', 'on', 'off'] as const).map((m) => ({ id: m, label: t(`touch.modes.${m}`) })),
          () => this.deps.settings().touchControls,
          (id) => this.change({ touchControls: id as Settings['touchControls'] }),
          'touch',
        ),
      ),
      this.row(
        t('settings.moveMode'),
        this.segmented(
          (['click', 'wasd'] as const).map((m) => ({ id: m, label: t(`settings.moveModes.${m}`) })),
          () => this.deps.settings().moveMode,
          (id) => this.change({ moveMode: id as Settings['moveMode'] }),
          'move',
        ),
      ),
      thumbLayout,
      buttonSize,
      this.buildKeyList(),
      ...(this.deps.pad ? [this.buildPadList(this.deps.pad)] : []),
      this.resetRow('controls'),
    );
    return page;
  }

  // ---- Key rebinding (B042) -------------------------------------------------------------------

  private buildKeyList(): HTMLElement {
    const list = el('div', 'key-list');
    list.dataset.testid = 'key-list';
    // Keys are for a keyboard: the touch controls hide the list.
    list.classList.add('touch-hide');
    list.append(el('h3', 'settings-group', t('settings.keyboard')), el('p', 'settings-hint', t('settings.keyboardHint')));
    for (const group of KEY_GROUPS) {
      list.append(el('h4', 'key-group', t(`settings.groups.${group.id}`)));
      for (const action of group.actions) list.append(this.keyRow(action));
    }
    return list;
  }

  private keyRow(action: Action): HTMLDivElement {
    const row = el('div', 'key-row');
    row.dataset.testid = `key-row-${action}`;
    row.dataset.action = action;
    const label = el('div', 'key-label', t(`settings.actions.${action}`));
    const chips = el('div', 'key-chips');
    const reset = el('button', 'key-reset', '↺');
    reset.type = 'button';
    reset.dataset.testid = `key-reset-${action}`;
    reset.title = t('settings.keyReset');
    reset.setAttribute('aria-label', `${t('settings.keyReset')}: ${t(`settings.actions.${action}`)}`);
    reset.addEventListener('click', () => {
      this.stopListening?.();
      this.change({ keybindings: resetBinding(this.deps.settings(), action) });
      this.refresh();
    });
    const hint = el('p', 'key-hint');
    hint.hidden = true;
    hint.setAttribute('role', 'status');

    const startListening = (slot: number, chip: HTMLButtonElement) => {
      this.stopListening?.();
      chip.classList.add('listening');
      chip.textContent = t('settings.pressKey');
      let pending: string | null = null;
      const release = panelStack.captureKeys((e) => {
        if (e.code === 'Escape') {
          this.stopListening?.();
          return true;
        }
        const code = e.code || codeFromKey(e.key);
        if (e.repeat || !isBindableKey(code)) return true;
        // A key another action holds (B is the mount key by default): warn first, a second press of the same key swaps it over.
        const result = rebindKey(this.deps.settings(), action, slot, code, pending === code);
        if (!result.keybindings) {
          pending = code;
          hint.textContent = t('settings.keyConflict', { key: keyLabel(code), action: t(`settings.actions.${result.conflicts[0]!}`) });
          hint.hidden = false;
          return true;
        }
        this.stopListening?.();
        this.change({ keybindings: result.keybindings });
        this.refresh();
        return true;
      });
      const away = (ev: Event) => {
        if (!(ev.target as Element | null)?.closest?.('.key-chip')) this.stopListening?.();
      };
      window.addEventListener('pointerdown', away, true);
      this.stopListening = () => {
        release();
        window.removeEventListener('pointerdown', away, true);
        this.stopListening = null;
        hint.hidden = true;
        render();
      };
    };

    const render = () => {
      const keys = resolveKeybindings(this.deps.settings())[action];
      const buttons: HTMLButtonElement[] = [];
      const addChip = (slot: number, code: string | null) => {
        const chip = el('button', code ? 'key-chip' : 'key-chip add', code ? keyLabel(code) : '+');
        chip.type = 'button';
        chip.dataset.testid = `key-chip-${action}-${slot}`;
        chip.setAttribute('aria-label', code ? t('settings.keyChange', { action: t(`settings.actions.${action}`), key: keyLabel(code) }) : t('settings.keyAdd', { action: t(`settings.actions.${action}`) }));
        chip.addEventListener('click', () => startListening(slot, chip));
        buttons.push(chip);
      };
      keys.forEach((code, i) => addChip(i, code));
      if (keys.length === 0) addChip(0, null);
      else if (keys.length < MAX_KEYS_PER_ACTION) addChip(keys.length, null);
      chips.replaceChildren(...buttons);
      reset.hidden = !(action in this.deps.settings().keybindings);
      row.classList.toggle('unbound', keys.length === 0);
    };
    this.refreshers.push(render);
    render();
    row.append(label, chips, reset, hint);
    return row;
  }

  // ---- Gamepad rebinding (A02) ----------------------------------------------------------------

  private buildPadList(pad: GamepadInput): HTMLElement {
    const list = el('div', 'key-list pad-list');
    list.dataset.testid = 'pad-list';
    list.classList.add('touch-hide');
    list.append(el('h3', 'settings-group', t('settings.gamepad')), el('p', 'settings-hint', t('settings.gamepadHint')));
    for (const action of PAD_ACTIONS) list.append(this.padRow(pad, action));
    return list;
  }

  private padRow(pad: GamepadInput, action: PadAction): HTMLDivElement {
    const row = el('div', 'key-row pad-row');
    row.dataset.testid = `pad-row-${action}`;
    row.dataset.action = action;
    const name = t(`settings.padActions.${action}`);
    const chips = el('div', 'key-chips');
    const reset = el('button', 'key-reset', '↺');
    reset.type = 'button';
    reset.dataset.testid = `pad-reset-${action}`;
    reset.title = t('settings.keyReset');
    reset.setAttribute('aria-label', `${t('settings.keyReset')}: ${name}`);
    reset.addEventListener('click', () => {
      this.stopListening?.();
      this.change({ padBindings: resetPadBinding(this.deps.settings(), action) });
      this.refresh();
    });
    const hint = el('p', 'key-hint');
    hint.hidden = true;
    hint.setAttribute('role', 'status');

    const startListening = (slot: number, chip: HTMLButtonElement) => {
      this.stopListening?.();
      chip.classList.add('listening');
      chip.textContent = t('settings.pressButton');
      let pending: string | null = null;
      // Every button press goes here (nothing else sees it) until one is bindable.
      const listen = (): (() => void) =>
        pad.capture((code) => {
          if (!isBindablePadButton(code)) {
            release = listen();
            return;
          }
          const result = rebindPad(this.deps.settings(), action, slot, code, pending === code);
          if (!result.padBindings) {
            pending = code;
            hint.textContent = t('settings.padConflict', { button: keyLabel(code), action: t(`settings.padActions.${result.conflicts[0]!}`) });
            hint.hidden = false;
            release = listen();
            return;
          }
          this.stopListening?.();
          this.change({ padBindings: result.padBindings });
          this.refresh();
        });
      let release = listen();
      // Escape on the keyboard or a click elsewhere gives up.
      const giveUp = (e: Event) => {
        if (e instanceof KeyboardEvent ? e.code === 'Escape' : !(e.target as Element | null)?.closest?.('.key-chip')) {
          if (e instanceof KeyboardEvent) e.stopImmediatePropagation();
          this.stopListening?.();
        }
      };
      window.addEventListener('pointerdown', giveUp, true);
      window.addEventListener('keydown', giveUp, true);
      this.stopListening = () => {
        release();
        window.removeEventListener('pointerdown', giveUp, true);
        window.removeEventListener('keydown', giveUp, true);
        this.stopListening = null;
        hint.hidden = true;
        render();
      };
    };

    const render = () => {
      const buttons = resolvePadBindings(this.deps.settings())[action];
      const nodes: HTMLButtonElement[] = [];
      const addChip = (slot: number, code: string | null) => {
        const chip = el('button', code ? 'key-chip' : 'key-chip add', code ? keyLabel(code) : '+');
        chip.type = 'button';
        chip.dataset.testid = `pad-chip-${action}-${slot}`;
        chip.setAttribute('aria-label', code ? t('settings.keyChange', { action: name, key: keyLabel(code) }) : t('settings.keyAdd', { action: name }));
        chip.addEventListener('click', () => startListening(slot, chip));
        nodes.push(chip);
      };
      buttons.forEach((code, i) => addChip(i, code));
      if (buttons.length === 0) addChip(0, null);
      else if (buttons.length < MAX_KEYS_PER_ACTION) addChip(buttons.length, null);
      chips.replaceChildren(...nodes);
      reset.hidden = !(action in (this.deps.settings().padBindings ?? {}));
      row.classList.toggle('unbound', buttons.length === 0);
    };
    this.refreshers.push(render);
    render();
    row.append(el('div', 'key-label', name), chips, reset, hint);
    return row;
  }

  // ---- Reset (B047) ---------------------------------------------------------------------------

  /** "Reset tips" (B06): two taps, then every tip and first-run banner is new again and Show tips is on. */
  private resetTipsRow(): HTMLDivElement {
    const row = el('div', 'settings-row settings-reset-row');
    const btn = el('button', 'settings-reset', t('settings.resetTips'));
    btn.type = 'button';
    btn.dataset.testid = 'settings-reset-tips';
    armConfirm(btn, {
      armedLabel: t('settings.resetConfirm'),
      run: () => {
        this.deps.resetTips?.();
        this.change({ showTips: true });
        this.refresh();
      },
    });
    row.append(btn);
    return row;
  }

  /** "Reset this tab": two taps (armConfirm), then the tab's settings go back to their defaults. */
  private resetRow(tab: 'display' | 'controls'): HTMLDivElement {
    const row = el('div', 'settings-row settings-reset-row');
    const btn = el('button', 'settings-reset', t('settings.resetTab'));
    btn.type = 'button';
    btn.dataset.testid = `settings-reset-${tab}`;
    armConfirm(btn, {
      armedLabel: t('settings.resetConfirm'),
      run: () => {
        this.stopListening?.();
        this.change(tabDefaults(tab, document.documentElement.classList.contains('touch-device')));
        this.refresh();
      },
    });
    row.append(btn);
    return row;
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

  /** A label with a range slider and its value in percent (brightness). */
  private sliderRow(label: string, hint: string | undefined, range: { min: number; max: number; step: number }, value: () => number, change: (v: number) => void, testid: string): HTMLDivElement {
    const row = el('div', 'settings-row settings-slider-row');
    const text = el('div', 'settings-label', label);
    const input = el('input', 'settings-slider');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.dataset.testid = `setting-${testid}`;
    input.setAttribute('aria-label', label);
    const out = el('span', 'settings-value');
    const sync = () => {
      input.value = String(value());
      out.textContent = `${Math.round(value() * 100)}%`;
    };
    input.addEventListener('input', () => {
      change(Number(input.value));
      sync();
    });
    this.refreshers.push(sync);
    sync();
    row.append(text, input, out);
    if (hint) row.append(el('p', 'settings-hint', hint));
    return row;
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
