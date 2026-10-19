/**
 * In-game confirmation: a bottom sheet instead of the native confirm() (which a sandboxed frame can block).
 *
 * Usage:
 *   if (await confirmSheet({ title: 'Delete Nova?', body: 'Level 12 Pyro. This cannot be undone.',
 *                            confirmLabel: 'Delete', danger: true })) remove();
 * The promise resolves false for Cancel, a tap outside, Escape and the Back button. Focus starts on Cancel.
 * `body` may be a string, an element, or a list of them (one paragraph each).
 * Also: `armConfirm(button, opts)` is the lighter two-tap pattern for costly one-tap actions (P013): the first
 * tap turns the button into "Confirm - 1,235 gold", the second within 3 s runs it.
 */
import { t } from '../data/i18n';
import { haptic } from './haptics';
import { panelStack } from './panelStack';

export interface ConfirmOptions {
  title: string;
  body?: string | HTMLElement | (string | HTMLElement)[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive: the confirm button is red. */
  danger?: boolean;
}

let sheet: HTMLDivElement | null = null;
let settle: ((ok: boolean) => void) | null = null;
let parts: { title: HTMLElement; body: HTMLElement; cancel: HTMLButtonElement; confirm: HTMLButtonElement } | null = null;

function ensure(): NonNullable<typeof parts> {
  if (sheet && parts) return parts;
  sheet = document.createElement('div');
  sheet.className = 'confirm-sheet';
  sheet.hidden = true;
  sheet.dataset.testid = 'confirm-sheet';
  sheet.setAttribute('role', 'alertdialog');
  sheet.setAttribute('aria-modal', 'true');
  const title = Object.assign(document.createElement('h2'), { className: 'confirm-title' });
  const body = Object.assign(document.createElement('div'), { className: 'confirm-body' });
  const actions = Object.assign(document.createElement('div'), { className: 'confirm-actions' });
  const cancel = Object.assign(document.createElement('button'), { type: 'button', className: 'confirm-cancel' });
  cancel.dataset.testid = 'confirm-cancel';
  const confirm = Object.assign(document.createElement('button'), { type: 'button', className: 'confirm-ok' });
  confirm.dataset.testid = 'confirm-ok';
  actions.append(cancel, confirm);
  sheet.append(title, body, actions);
  panelStack.container.append(sheet);
  cancel.addEventListener('click', () => settle?.(false));
  confirm.addEventListener('click', () => settle?.(true));
  sheet.setAttribute('aria-labelledby', 'confirm-title');
  title.id = 'confirm-title';
  panelStack.register({
    id: 'confirm',
    el: sheet,
    kind: 'modal',
    header: false,
    scrim: true,
    // Back, Escape and a tap outside all land here.
    close: () => settle?.(false),
  });
  parts = { title, body, cancel, confirm };
  return parts;
}

export function confirmSheet(opts: ConfirmOptions): Promise<boolean> {
  const p = ensure();
  // A second question replaces the first, which counts as "no".
  settle?.(false);
  p.title.textContent = opts.title;
  const items = opts.body === undefined ? [] : Array.isArray(opts.body) ? opts.body : [opts.body];
  p.body.replaceChildren(
    ...items.map((b) => (typeof b === 'string' ? Object.assign(document.createElement('p'), { textContent: b }) : b)),
  );
  p.cancel.textContent = opts.cancelLabel ?? t('panels.cancel');
  p.confirm.textContent = opts.confirmLabel ?? t('panels.confirm');
  p.confirm.classList.toggle('danger', !!opts.danger);
  return new Promise<boolean>((resolve) => {
    settle = (ok) => {
      settle = null;
      sheet!.hidden = true;
      if (!ok) haptic('tick');
      resolve(ok);
    };
    sheet!.hidden = false;
    p.cancel.focus({ preventScroll: true });
  });
}

export interface ArmOptions {
  /** Label while armed, e.g. "Confirm - 1,235 gold". */
  armedLabel: string;
  /** Runs on the second tap. */
  run: () => void;
  /** Milliseconds the armed state lasts (default 3000). */
  timeout?: number;
}

/** Two-tap confirmation on a button: tap to arm, tap again to run. Returns a function that disarms it. */
export function armConfirm(button: HTMLButtonElement, opts: ArmOptions): () => void {
  const original = button.textContent ?? '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    button.classList.remove('armed');
    button.textContent = original;
  };
  button.addEventListener('click', (e) => {
    if (timer === undefined) {
      e.stopImmediatePropagation();
      button.classList.add('armed');
      button.textContent = opts.armedLabel;
      haptic('tick');
      timer = setTimeout(disarm, opts.timeout ?? 3000);
      return;
    }
    disarm();
    opts.run();
  }, true);
  return disarm;
}
