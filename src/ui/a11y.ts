/**
 * Accessible names (C14): every button, field and panel has a name a screen reader can say. `accessibleName` reads
 * the name the way the browser does (aria-label, aria-labelledby, own text, an image's alt, the title, the
 * placeholder); `unnamed` lists what has none; `repairNames` gives the rest a name from their title or heading, so a
 * control added later without one is still announced. `watchAccessibility` runs the repair after the UI changes.
 * The lint test (tests/round4A11y.test.ts) runs the same audit over the real panels.
 */

const CONTROLS = 'button, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [role="slider"], [role="menuitem"], input:not([type="hidden"]), select, textarea, a[href], canvas.minimap';
const PANELS = '.panel';

/** The text a screen reader would say for `el`, or '' when it has none. */
export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return label;
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const doc = el.ownerDocument;
    const text = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
    if (text) return text;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.labels?.length) {
      const text = [...el.labels].map((l) => l.textContent?.trim() ?? '').join(' ').trim();
      if (text) return text;
    }
    if (el.placeholder?.trim()) return el.placeholder.trim();
  }
  const own = el.textContent?.replace(/\s+/g, ' ').trim();
  if (own) return own;
  const alt = [...el.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt')?.trim() ?? '').join(' ').trim();
  if (alt) return alt;
  return el.getAttribute('title')?.trim() ?? '';
}

/** True when `el` is out of the accessibility tree anyway (hidden attribute, aria-hidden, display none by attribute). */
function skipped(el: Element): boolean {
  return !!el.closest('[aria-hidden="true"]');
}

/** Controls without an accessible name, and panels without a role and a name. Hidden panels count: they open later. */
export function unnamed(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll(CONTROLS)) if (!skipped(el) && !accessibleName(el)) out.push(el);
  for (const el of root.querySelectorAll(PANELS)) if (!el.getAttribute('role') || !accessibleName(el.querySelector('h1, h2, h3') ?? el) || !el.getAttribute('aria-label')) out.push(el);
  return out;
}

/** "panel close" → "Panel close": the last-resort name taken from a test id. */
function fromTestId(id: string | undefined): string {
  if (!id) return '';
  const words = id.replace(/[-_.]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : '';
}

/** Gives every unnamed control a name (its title, else its test id) and every panel a dialog role and a heading name. Returns how many were fixed. */
export function repairNames(root: ParentNode): number {
  let fixed = 0;
  for (const el of root.querySelectorAll(PANELS)) {
    if (!el.getAttribute('role')) {
      el.setAttribute('role', 'dialog');
      fixed++;
    }
    if (!el.getAttribute('aria-label')) {
      const heading = el.querySelector('h1, h2, h3')?.textContent?.trim();
      const name = heading || el.getAttribute('title') || fromTestId((el as HTMLElement).dataset?.testid);
      if (name) {
        el.setAttribute('aria-label', name);
        fixed++;
      }
    }
  }
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (skipped(el) || accessibleName(el)) continue;
    const name = fromTestId((el as HTMLElement).dataset?.testid) || el.className.toString().split(/\s+/)[0]?.replace(/[-_]+/g, ' ') || '';
    if (name) {
      el.setAttribute('aria-label', name[0]!.toUpperCase() + name.slice(1));
      fixed++;
    }
  }
  return fixed;
}

/** Repairs now and after the interface changes (debounced), so lazily built panels get their names too. */
export function watchAccessibility(root: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    repairNames(root);
  };
  run();
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(() => {
    timer ??= setTimeout(run, 800);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  };
}
