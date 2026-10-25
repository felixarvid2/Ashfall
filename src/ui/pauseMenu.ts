/**
 * The pause menu (B041): Escape with nothing open shows a small "Paused" panel with Resume, Settings, Character
 * select and Export save. While it is open the simulation is frozen (`pausing`, read by game.ts `menuPaused`); the
 * freeze also holds while Settings is open from here, and the menu returns when Settings closes.
 *
 * Usage: `new PauseMenu(uiRoot, deps)`; `registerGamePanels` registers it with the panel stack and sets Escape to open it.
 * Touch screens have no Escape key: the panel works there (Back closes it) but the settings icon stays their way in.
 */
import { t } from '../data/i18n';
import { confirmSheet } from './confirmSheet';
import { panelStack } from './panelStack';

export interface PauseMenuDeps {
  exportSave: () => void;
  /** Saves and returns to the character select screen. */
  toCharacterSelect: () => void;
  /** False before the game has started (character select) so Escape does nothing there. */
  canOpen: () => boolean;
}

export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly resume: HTMLButtonElement;
  /** Settings was opened from this menu: the game stays paused and the menu comes back afterwards. */
  private held = false;

  constructor(parent: HTMLElement, private readonly deps: PauseMenuDeps) {
    this.root = document.createElement('div');
    this.root.className = 'pause-menu panel';
    this.root.dataset.testid = 'pause-menu';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t('pause.title'));
    const title = Object.assign(document.createElement('h2'), { textContent: t('pause.title') });
    const button = (id: string, label: string, run: () => void, primary = false): HTMLButtonElement => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: `pause-btn${primary ? ' primary' : ''}`, textContent: label });
      b.dataset.testid = `pause-${id}`;
      b.addEventListener('click', run);
      return b;
    };
    this.resume = button('resume', t('pause.resume'), () => panelStack.close('pause'), true);
    const settings = button('settings', t('pause.settings'), () => {
      this.held = true;
      panelStack.open('settings');
      panelStack.close('pause');
    });
    const select = button('select', t('pause.characterSelect'), () => {
      void confirmSheet({ title: t('pause.selectTitle'), body: t('pause.selectBody'), confirmLabel: t('pause.selectConfirm') }).then((ok) => {
        if (ok) this.deps.toCharacterSelect();
      });
    });
    const exportBtn = button('export', t('pause.exportSave'), () => this.deps.exportSave());
    this.root.append(title, this.resume, settings, select, exportBtn);
    parent.append(this.root);
    // Settings opened from here closed again: bring the menu back.
    panelStack.onChange((open) => {
      if (this.held && !open.includes('settings')) {
        this.held = false;
        panelStack.open('pause');
      }
    });
  }

  get element(): HTMLElement {
    return this.root;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** The simulation waits: the menu is open, or Settings is open on its behalf. */
  get pausing(): boolean {
    return this.open || this.held;
  }

  canOpen(): boolean {
    return this.deps.canOpen();
  }

  show(): void {
    this.root.hidden = false;
    // A screen opens with a focused control (keyboard and gamepad).
    queueMicrotask(() => this.resume.focus({ preventScroll: true }));
  }

  close(): void {
    this.root.hidden = true;
  }
}
