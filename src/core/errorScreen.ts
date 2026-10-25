/** A full-screen message with a Reload button, for failures the game cannot continue from. */
import { t } from '../data/i18n';

export type ErrorKind = 'webgl' | 'startup' | 'contextLost' | 'crash';

const SCREEN_CLASS = 'error-screen';

const STYLE =
  'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
  'gap:14px;padding:24px;text-align:center;background:rgba(11,11,12,0.96);color:#d8d0c4;' +
  "font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;";
const BUTTON_STYLE =
  'margin-top:6px;padding:12px 28px;font:inherit;font-size:1.1em;letter-spacing:0.12em;text-transform:uppercase;' +
  'color:#ff8a2a;background:transparent;border:1px solid #ff8a2a;cursor:pointer;min-height:44px;';

/** Shows (or replaces) the error screen. Returns the element. */
export function showErrorScreen(root: HTMLElement, kind: ErrorKind, detail?: string, reload: () => void = () => location.reload()): HTMLElement {
  hideErrorScreen(root);
  const el = document.createElement('div');
  el.className = SCREEN_CLASS;
  el.setAttribute('role', 'alert');
  el.style.cssText = STYLE;

  const title = document.createElement('h1');
  title.textContent = t(`error.${kind}.title`);
  title.style.cssText = 'margin:0;font-size:1.8em;letter-spacing:0.1em;text-transform:uppercase;color:#ff8a2a;';
  const message = document.createElement('p');
  message.textContent = t(`error.${kind}.message`);
  message.style.cssText = 'margin:0;max-width:34em;line-height:1.4;';
  el.append(title, message);

  if (detail) {
    const small = document.createElement('code');
    small.textContent = detail.slice(0, 300);
    small.style.cssText = 'max-width:40em;color:#8c8378;font-size:0.8em;word-break:break-word;';
    el.append(small);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('error.reload');
  button.style.cssText = BUTTON_STYLE;
  button.addEventListener('click', reload);
  el.append(button);

  root.appendChild(el);
  return el;
}

export function hideErrorScreen(root: HTMLElement): void {
  root.querySelectorAll(`.${SCREEN_CLASS}`).forEach((el) => el.remove());
}
