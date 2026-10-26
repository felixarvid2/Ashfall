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

/** The text "Copy details" puts on the clipboard: what failed, the stack, the build and the browser. */
export function errorReport(kind: ErrorKind, detail?: string, stack?: string): string {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  const ua = typeof navigator === 'object' ? navigator.userAgent : 'unknown';
  return [
    `Ashfall ${version} - ${kind}`,
    `Error: ${detail ?? '(no message)'}`,
    stack ? `Stack:\n${stack}` : '',
    `Browser: ${ua}`,
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');
}

/** Clipboard write with a textarea fallback (insecure contexts, sandboxed frames). Resolves true when it worked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall back to a hidden textarea and execCommand below.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Shows (or replaces) the error screen. Returns the element. `stack` only goes into "Copy details". */
export function showErrorScreen(root: HTMLElement, kind: ErrorKind, detail?: string, reload: () => void = () => location.reload(), stack?: string): HTMLElement {
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
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = t('error.copy');
  copy.dataset.testid = 'error-copy';
  copy.style.cssText = `${BUTTON_STYLE}color:#8c8378;border-color:#8c8378;margin-top:0;padding:8px 20px;font-size:0.9em;`;
  copy.addEventListener('click', () => {
    void copyText(errorReport(kind, detail, stack)).then((ok) => {
      copy.textContent = t(ok ? 'error.copied' : 'error.copyFailed');
    });
  });
  el.append(button, copy);

  root.appendChild(el);
  return el;
}

export function hideErrorScreen(root: HTMLElement): void {
  root.querySelectorAll(`.${SCREEN_CLASS}`).forEach((el) => el.remove());
}
