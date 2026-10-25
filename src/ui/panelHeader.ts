/**
 * The shared panel header and the small helpers every panel gets.
 *
 * Usage: `panelHeader('Inventory', onClose)` returns a sticky `.panel-header` (grab handle, title, an
 * `.panel-header-extra` slot for gold or a counter, one 44x44 close button with aria-label "Close"). Dragging the
 * header down on a touch screen closes the panel like a sheet. `panelStack.register` calls `adoptHeader` for you:
 * it moves a panel's own `<h2>` into the header and drops the old per-panel close buttons.
 * Also here: `preserveScroll(el, fn)` (rebuild without losing the scroll position), `enhanceScroll` (bottom
 * fade and back-to-top chip, called by the stack) and the first-open panel tips (P032).
 */
import { t } from '../data/i18n';
import type { PanelSpec } from './panelStack';
import { getJsonPref, setJsonPref } from '../core/localPrefs';

export interface PanelHeaderOptions {
  /** The panel the header belongs to: enables swipe-down to close. */
  panel?: HTMLElement;
  /** Element for the right side next to the close button (gold, "Paused"). */
  extra?: HTMLElement;
}

/** Distance (px) and speed (px/ms) of a downward drag that closes the panel. */
const SWIPE_DISTANCE = 80;
const SWIPE_SPEED = 0.5;

export function panelHeader(title: string | HTMLElement, onClose: () => void, opts: PanelHeaderOptions = {}): HTMLElement {
  const header = document.createElement('div');
  header.className = 'panel-header';
  header.dataset.testid = 'panel-header';
  const grab = document.createElement('span');
  grab.className = 'panel-grab';
  grab.setAttribute('aria-hidden', 'true');
  const titleEl = typeof title === 'string' ? Object.assign(document.createElement('h2'), { textContent: title }) : title;
  titleEl.classList.add('panel-title');
  const extra = opts.extra ?? document.createElement('span');
  extra.classList.add('panel-header-extra');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'panel-close';
  close.dataset.testid = 'panel-close';
  close.setAttribute('aria-label', t('ui.close'));
  close.title = t('ui.close');
  close.textContent = '×';
  close.addEventListener('click', onClose);
  header.append(grab, titleEl, extra, close);
  if (opts.panel) installSwipe(header, opts.panel, onClose);
  return header;
}

/** Drag the header down to close: follows the finger, closes past 80 px or on a fling, else springs back. */
function installSwipe(header: HTMLElement, panel: HTMLElement, onClose: () => void): void {
  let start: { y: number; time: number; id: number } | null = null;
  let dy = 0;
  const reset = (animate: boolean) => {
    panel.style.transition = animate ? 'translate 150ms ease-out' : '';
    panel.style.translate = '';
    if (animate) setTimeout(() => (panel.style.transition = ''), 170);
  };
  header.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button')) return;
    // Only from the top of the content: a scrolled panel scrolls instead.
    if (panel.scrollTop > 2) return;
    start = { y: e.clientY, time: performance.now(), id: e.pointerId };
    dy = 0;
    try {
      header.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone.
    }
  });
  header.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    dy = Math.max(0, e.clientY - start.y);
    panel.style.transition = 'none';
    panel.style.translate = `0 ${dy}px`;
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!start || e.pointerId !== start.id) return;
    const speed = dy / Math.max(1, performance.now() - start.time);
    start = null;
    if (!cancelled && (dy > SWIPE_DISTANCE || (dy > 24 && speed > SWIPE_SPEED))) {
      panel.style.transition = 'translate 120ms ease-in';
      panel.style.translate = '0 100%';
      setTimeout(() => {
        reset(false);
        onClose();
      }, 120);
    } else reset(dy > 0);
  };
  header.addEventListener('pointerup', (e) => end(e, false));
  header.addEventListener('pointercancel', (e) => end(e, true));
}

/** Gives a registered panel its header: its own `<h2>` becomes the title, old close buttons go. */
export function adoptHeader(spec: PanelSpec, dismiss: () => void): void {
  const { el } = spec;
  for (const old of el.querySelectorAll('.service-close')) old.remove();
  const own = [...el.children].find((c) => c.tagName === 'H2') as HTMLElement | undefined;
  const header = panelHeader(own ?? spec.title ?? spec.id, dismiss, { panel: el });
  el.prepend(header);
  el.classList.add('has-header');
  el.dataset.panel = spec.id;
}

/** Rebuild content without losing the panel's scroll position. */
export function preserveScroll(el: HTMLElement, rebuild: () => void): void {
  const top = el.scrollTop;
  rebuild();
  if (top > 0) el.scrollTop = top;
}

/** Bottom fade (`.scroll-more`) while there is more below, and a back-to-top chip (`.scrolled`) after 600 px. */
export function enhanceScroll(el: HTMLElement, visible: () => boolean): void {
  const wrap = document.createElement('div');
  wrap.className = 'panel-top-wrap';
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'panel-top';
  chip.dataset.testid = 'panel-top';
  chip.setAttribute('aria-label', t('panels.backToTop'));
  chip.textContent = '↑';
  chip.addEventListener('click', () => el.scrollTo({ top: 0, behavior: 'smooth' }));
  wrap.append(chip);
  el.append(wrap);
  const update = () => {
    if (!visible()) return;
    el.classList.toggle('scroll-more', el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    el.classList.toggle('scrolled', el.scrollTop > 600);
  };
  el.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(el);
}

// ---- first-open tips (P032) --------------------------------------------------------------------------

const TIPS_KEY = 'ashfall.tips';

function seenTips(): string[] {
  const raw = getJsonPref<unknown>(TIPS_KEY, []);
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

function markTipSeen(id: string): void {
  const seen = seenTips();
  // Storage may be blocked; the tip simply shows again next time.
  if (!seen.includes(id)) setJsonPref(TIPS_KEY, [...seen, id]);
}

/**
 * On touch screens a panel's permanent hint line (`spec.hint`) becomes a dismissible banner the first time the
 * panel opens, and afterwards sits behind a "?" button in the header. Call when the panel opens.
 */
export function showPanelTip(spec: PanelSpec): void {
  const { el } = spec;
  if (!spec.hint) return;
  const src = el.querySelector<HTMLElement>(spec.hint);
  if (!src) return;
  const touch = !!el.closest('#ui.touch-ui');
  src.classList.toggle('panel-hint-src', touch);
  el.querySelector('.panel-tip')?.remove();
  el.querySelector('.panel-help')?.remove();
  if (!touch) return;
  const text = ((src.querySelector('.hint-touch') ?? src).textContent ?? '').trim();
  if (!text) return;
  const header = el.querySelector('.panel-header');
  const show = () => {
    el.querySelector('.panel-tip')?.remove();
    const tip = document.createElement('div');
    tip.className = 'panel-tip';
    tip.dataset.testid = 'panel-tip';
    const body = Object.assign(document.createElement('span'), { textContent: text });
    const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: t('panels.gotIt') });
    ok.addEventListener('click', () => {
      markTipSeen(spec.id);
      tip.remove();
      addHelp();
    });
    tip.append(body, ok);
    header?.after(tip);
  };
  const addHelp = () => {
    if (el.querySelector('.panel-help')) return;
    const help = Object.assign(document.createElement('button'), { type: 'button', className: 'panel-help', textContent: '?' });
    help.setAttribute('aria-label', t('panels.help'));
    help.addEventListener('click', () => {
      help.remove();
      show();
    });
    header?.querySelector('.panel-header-extra')?.append(help);
  };
  if (seenTips().includes(spec.id)) addHelp();
  else show();
}
