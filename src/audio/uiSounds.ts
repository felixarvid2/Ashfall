/**
 * Interface sounds from one delegated set of listeners on the UI root: button clicks, panels
 * opening and closing (panels toggle their `hidden` attribute) and, for a mouse, hover ticks.
 * Equipping, buying and error notices are played by the game where they happen.
 */
import type { AudioEngine } from './engine';

/** What counts as a pressable control. */
const CLICKABLE = 'button, [role="button"], .map-tab, .inv-cell, .char-slot';
/** Controls that also tick on hover (not the 40 inventory cells). */
const HOVERABLE = 'button, [role="button"], .map-tab, .char-slot';
/** Seconds between hover ticks. */
const HOVER_GAP = 0.08;

export function installUiSounds(root: HTMLElement, engine: AudioEngine): void {
  root.addEventListener(
    'click',
    (e) => {
      if ((e.target as Element | null)?.closest(CLICKABLE)) engine.play('ui.click');
    },
    true,
  );

  const observer = new MutationObserver((records) => {
    // Compare each panel's state before the first and after the last change in this batch.
    const before = new Map<Element, boolean>();
    for (const r of records) {
      const el = r.target as HTMLElement;
      if (el.classList.contains('panel') && !before.has(el)) before.set(el, r.oldValue !== null);
    }
    for (const [el, wasHidden] of before) {
      const hidden = el.hasAttribute('hidden');
      if (hidden !== wasHidden) engine.play(hidden ? 'ui.close' : 'ui.open');
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true, subtree: true });

  // A hover tick only for a real mouse: touch has no hover and a pen is rarely over buttons.
  const mouse = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)');
  if (mouse && mouse.matches) {
    let over: Element | null = null;
    let lastTick = 0;
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest(HOVERABLE) ?? null;
      if (el === over) return;
      over = el;
      const now = performance.now() / 1000;
      if (el && now - lastTick >= HOVER_GAP) {
        lastTick = now;
        engine.play('ui.hover');
      }
    });
  }
}
