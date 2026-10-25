/**
 * The panel stack: one place that knows which panels are open and how they close.
 *
 * Usage (game.ts registers every panel once, after building them):
 *   panelStack.init(uiRoot);
 *   panelStack.register({ id: 'inventory', el: panelRoot, kind: 'main', title: 'Inventory',
 *     open: () => inv.toggle(true), close: () => inv.toggle(false), tab: { icon: 'inventory', label: 'Bag' } });
 *   panelStack.open('inventory') / close(id) / toggle(id) / closeTop() / back() / closeAll() / top() / isOpen(id)
 *   panelStack.setBadge('skills', true)   // notification dot on the tab bar
 *   panelStack.onChange((openIds) => ...)
 * Panels keep toggling their own `hidden` attribute; the stack watches it, so a panel that is opened by a key,
 * a button or code is tracked the same way. Registering also gives the panel its shared header (title, one
 * 44 px close button, swipe-down), scroll fade and scroll-position memory.
 *
 * What the stack does for every registered panel:
 *  - Back (Android, browser) and Escape close the top panel: each open panel owns one history entry.
 *  - In portrait touch, `main` and `service` panels are exclusive (a panel's `companions` may stay beside it),
 *    and a bottom tab bar switches between the panels that have a `tab`.
 *  - `#ui` gets `has-panel` (a main/service panel is open) and `has-sheet` (a sheet or modal is open); the
 *    portrait CSS hides the HUD under `has-panel`.
 *  - `scrim: true` panels get a tap-outside-to-close scrim on touch screens.
 * Kinds: 'main' (inventory, character, skills, map, quests, settings), 'service' (hub services, tier, rift,
 * dialogue, lore), 'sheet' (tooltip sheet and other bottom sheets), 'modal' (confirm sheet).
 */
import { cssUrl } from './art';
import { adoptHeader, enhanceScroll, showPanelTip } from './panelHeader';

export type PanelKind = 'main' | 'service' | 'sheet' | 'modal';

export interface PanelSpec {
  id: string;
  /** The panel root; it shows and hides through the `hidden` attribute. */
  el: HTMLElement;
  kind: PanelKind;
  /** Header title when the panel has no `<h2>` of its own (an existing `<h2>` is moved into the header). */
  title?: string;
  /** Show the panel; default sets `el.hidden = false`. */
  open?: () => void;
  /** The panel's own close path (so its side effects run). Must hide `el`. */
  close: () => void;
  /** False: the panel brings its own header (or none). */
  header?: boolean;
  /** Ids that may stay open beside this panel in portrait (a hub service and the backpack). */
  companions?: string[];
  /** Tap outside closes it (touch screens only). */
  scrim?: boolean;
  /** An entry in the bottom tab bar (menu icon id from assets/ui/menu and its label). */
  tab?: { icon: string; label: string };
  /** CSS selector of a permanent hint line inside the panel: on touch it becomes a first-open tip (P032). */
  hint?: string;
}

interface Entry {
  spec: PanelSpec;
  visible: boolean;
  /** Scroll position of the panel while it is open (restored after its content is rebuilt). */
  scroll: number;
  observer: MutationObserver;
}

const MAIN_KINDS: ReadonlySet<PanelKind> = new Set(['main', 'service']);

class PanelStack {
  private root: HTMLElement | null = null;
  private readonly entries = new Map<string, Entry>();
  /** Panels registered with `registerLazy` and not built yet. */
  private readonly lazy = new Map<string, { load: () => Promise<void>; loading: Promise<void> | null }>();
  /** Visible panels, oldest first. */
  private order: string[] = [];
  /** History entries this stack has pushed (the browser's Back walks them). */
  private depth = 0;
  private expectingPop = false;
  private popTimer: ReturnType<typeof setTimeout> | undefined;
  private reconcileQueued = false;
  private scrim: HTMLDivElement | null = null;
  private tabbar: HTMLDivElement | null = null;
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly badges = new Set<string>();
  /** Scroll position per main panel id, kept for the next time it opens. */
  private readonly scrollMemory = new Map<string, number>();
  private readonly listeners = new Set<(open: string[]) => void>();
  /** Asked first for every keydown (key rebinding listens here); true = consumed. */
  private keyCapture: ((e: KeyboardEvent) => boolean) | null = null;
  /** Escape with no panel open: true when it did something (the pause menu opens). */
  private escapeFallback: (() => boolean) | null = null;

  /** Call once with the UI root. */
  init(root: HTMLElement): void {
    if (this.root) return;
    this.root = root;
    this.scrim = document.createElement('div');
    this.scrim.className = 'panel-scrim';
    this.scrim.hidden = true;
    this.scrim.dataset.testid = 'panel-scrim';
    this.scrim.addEventListener('click', () => this.closeTop());
    this.tabbar = document.createElement('div');
    this.tabbar.className = 'panel-tabbar';
    this.tabbar.dataset.testid = 'panel-tabbar';
    this.tabbar.hidden = true;
    root.append(this.scrim, this.tabbar);
    try {
      // A reload can leave one of our history entries as the current one; it means nothing now.
      if ((history.state as { ashfall?: number } | null)?.ashfall) history.replaceState(null, '');
    } catch {
      // Sandboxed frames may forbid history access.
    }
    window.addEventListener('popstate', (e) => this.onPop(e));
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.keyCapture?.(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof Element && e.target.closest('[data-esc-local]')) && (this.closeTop() || this.escapeFallback?.())) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
  }

  /** Routes every keydown to `fn` until the returned function is called (Escape included). `fn` returns true when it used the key. */
  captureKeys(fn: (e: KeyboardEvent) => boolean): () => void {
    this.keyCapture = fn;
    return () => {
      if (this.keyCapture === fn) this.keyCapture = null;
    };
  }

  /** What Escape does when no panel is open (the pause menu). */
  setEscapeFallback(fn: (() => boolean) | null): void {
    this.escapeFallback = fn;
  }

  /**
   * A panel whose code loads on first use (C02): its tab (and so its place in the tab bar) exists now, and
   * `open(id)` runs `load`, which builds the panel and `register`s it; the stack then opens it.
   */
  registerLazy(spec: { id: string; tab?: { icon: string; label: string }; load: () => Promise<void> }): void {
    if (this.entries.has(spec.id) || this.lazy.has(spec.id)) throw new Error(`panel already registered: ${spec.id}`);
    this.lazy.set(spec.id, { load: spec.load, loading: null });
    if (spec.tab) this.addTab({ id: spec.id, tab: spec.tab } as PanelSpec);
  }

  register(spec: PanelSpec): void {
    if (this.entries.has(spec.id)) throw new Error(`panel already registered: ${spec.id}`);
    this.lazy.delete(spec.id);
    const entry: Entry = { spec, visible: false, scroll: 0, observer: new MutationObserver((records) => this.onMutations(entry, records)) };
    this.entries.set(spec.id, entry);
    if (spec.header !== false && spec.kind !== 'modal') adoptHeader(spec, () => this.dismiss(spec.id));
    enhanceScroll(spec.el, () => entry.visible);
    spec.el.addEventListener('scroll', () => {
      if (entry.visible) entry.scroll = spec.el.scrollTop;
    });
    entry.observer.observe(spec.el, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
    if (spec.tab && !this.tabButtons.has(spec.id)) this.addTab(spec);
    this.sync(entry);
  }

  /** The UI root the stack was initialised with (sheets append themselves to it). */
  get container(): HTMLElement {
    if (!this.root) throw new Error('panelStack.init(root) has not run');
    return this.root;
  }

  has(id: string): boolean {
    return this.entries.has(id) || this.lazy.has(id);
  }

  isOpen(id: string): boolean {
    return !!this.entries.get(id)?.visible;
  }

  /** The id of the topmost open panel. */
  top(): string | null {
    return this.order[this.order.length - 1] ?? null;
  }

  /** The root element and kind of a registered panel (gamepad focus navigation scopes itself to the top one). */
  panel(id: string): { el: HTMLElement; kind: PanelKind } | null {
    const spec = this.entries.get(id)?.spec;
    return spec ? { el: spec.el, kind: spec.kind } : null;
  }

  /** What Escape does without the key event: close the top panel, else the fallback (the pause menu). True when it did something. */
  escape(): boolean {
    return this.closeTop() || (this.escapeFallback?.() ?? false);
  }

  openIds(): string[] {
    return [...this.order];
  }

  onChange(fn: (open: string[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  open(id: string): void {
    const pending = this.lazy.get(id);
    if (pending) {
      pending.loading ??= pending.load().then(() => this.open(id), (err) => {
        pending.loading = null;
        console.warn(`Panel '${id}' failed to load`, err);
      });
      return;
    }
    const entry = this.entries.get(id);
    if (!entry || entry.visible) return;
    if (entry.spec.open) entry.spec.open();
    else entry.spec.el.hidden = false;
    this.sync(entry);
  }

  /** Close through the panel's own close path. */
  close(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.visible) return;
    entry.spec.close();
    this.sync(entry);
  }

  toggle(id: string): void {
    if (this.isOpen(id)) this.close(id);
    else this.open(id);
  }

  /** The header's close button and the scrim: a short slide-down first, then the panel's own close. */
  dismiss(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.visible) return;
    const el = entry.spec.el;
    if (!this.animated() || entry.spec.kind === 'modal') return this.close(id);
    el.classList.add('is-closing');
    setTimeout(() => {
      el.classList.remove('is-closing');
      this.close(id);
    }, 120);
  }

  /** Closes the topmost panel. Returns false when none was open. */
  closeTop(): boolean {
    const id = this.top();
    if (id === null) return false;
    this.close(id);
    return true;
  }

  /** What a hardware Back does: walk our history entry when there is one, else close the top panel. */
  back(): boolean {
    if (this.order.length === 0) return false;
    if (this.depth > 0) {
      try {
        history.back();
        return true;
      } catch {
        // fall through
      }
    }
    return this.closeTop();
  }

  closeAll(except?: (id: string) => boolean): void {
    for (const id of [...this.order].reverse()) if (!except?.(id)) this.close(id);
  }

  /** A notification dot on a panel's tab (and anywhere else that reads `data-badge`). */
  setBadge(id: string, on: boolean): void {
    if (on) this.badges.add(id);
    else this.badges.delete(id);
    this.tabButtons.get(id)?.classList.toggle('has-dot', on);
  }

  // ---- internals ---------------------------------------------------------------------------------

  private animated(): boolean {
    return typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private portraitTouch(): boolean {
    return !!this.root?.classList.contains('touch-ui') && this.root.classList.contains('portrait');
  }

  private onMutations(entry: Entry, records: MutationRecord[]): void {
    let rebuilt = false;
    for (const r of records) {
      if (r.type === 'attributes' && r.target === entry.spec.el) this.sync(entry);
      else if (r.type === 'childList') rebuilt = true;
    }
    // A panel that rebuilds its content (replaceChildren) must not jump back to the top.
    if (rebuilt && entry.visible && entry.scroll > 0 && entry.spec.el.scrollTop !== entry.scroll) entry.spec.el.scrollTop = entry.scroll;
    if (rebuilt) entry.spec.el.dispatchEvent(new Event('scroll'));
    // A rebuilt panel brings its permanent hint line back; on touch it stays behind the first-open tip.
    if (rebuilt && entry.visible && entry.spec.hint && this.root?.classList.contains('touch-ui')) {
      entry.spec.el.querySelector(entry.spec.hint)?.classList.add('panel-hint-src');
    }
  }

  private sync(entry: Entry): void {
    const visible = !entry.spec.el.hidden && entry.spec.el.isConnected;
    if (visible === entry.visible) return;
    entry.visible = visible;
    const { id, el, kind } = entry.spec;
    if (visible) {
      this.order = this.order.filter((o) => o !== id);
      this.order.push(id);
      entry.scroll = kind === 'main' ? (this.scrollMemory.get(id) ?? 0) : 0;
      if (entry.scroll > 0) el.scrollTop = entry.scroll;
      if (this.animated() && kind !== 'modal') {
        el.classList.add('is-opening');
        setTimeout(() => el.classList.remove('is-opening'), 200);
      }
      this.makeRoom(entry);
      showPanelTip(entry.spec);
    } else {
      this.order = this.order.filter((o) => o !== id);
      if (kind === 'main') this.scrollMemory.set(id, entry.scroll);
      el.classList.remove('is-closing', 'is-opening');
    }
    this.render();
    this.queueReconcile();
    for (const fn of this.listeners) fn(this.openIds());
  }

  /** In portrait one main panel fills the screen: opening one closes the others (except its companions). */
  private makeRoom(entry: Entry): void {
    if (!this.portraitTouch() || !MAIN_KINDS.has(entry.spec.kind)) return;
    for (const id of [...this.order]) {
      if (id === entry.spec.id) continue;
      const other = this.entries.get(id);
      if (!other || !MAIN_KINDS.has(other.spec.kind)) continue;
      if (entry.spec.companions?.includes(id) || other.spec.companions?.includes(entry.spec.id)) continue;
      other.spec.close();
      this.sync(other);
    }
  }

  /** Root classes, scrim and tab bar follow the open panels. */
  private render(): void {
    const root = this.root;
    if (!root) return;
    const open = this.order.map((id) => this.entries.get(id)!.spec);
    root.classList.toggle('has-panel', open.some((s) => MAIN_KINDS.has(s.kind)));
    root.classList.toggle('has-sheet', open.some((s) => !MAIN_KINDS.has(s.kind)));
    const touch = root.classList.contains('touch-ui');
    const topSpec = open[open.length - 1];
    // Scrim under the topmost panel that asks for one.
    const scrimmed = touch && topSpec?.scrim ? topSpec : undefined;
    if (this.scrim) {
      this.scrim.hidden = !scrimmed;
      if (scrimmed) {
        const z = Number.parseInt(getComputedStyle(scrimmed.el).zIndex, 10);
        this.scrim.style.zIndex = String(Number.isFinite(z) ? z - 1 : 29);
      }
    }
    // Tab bar: while a panel with a tab is the top one.
    // (Not beside a hub service: the service and its backpack share the screen.)
    const tabbed = touch && !!topSpec?.tab && !open.some((o) => o.kind === 'service');
    if (this.tabbar) this.tabbar.hidden = !tabbed;
    root.classList.toggle('has-tabbar', tabbed);
    for (const [id, b] of this.tabButtons) {
      // The tab shows the same dot as its touch menu button (new skill points, items, quest steps).
      const icon = this.entries.get(id)?.spec.tab?.icon;
      const dot = !!icon && !!root.querySelector(`.touch-menu-btn.has-dot[data-testid="touch-menu-${icon}"]`);
      b.classList.toggle('has-dot', dot || this.badges.has(id));
      const active = topSpec?.id === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    }
    root.dataset.panelTop = topSpec?.id ?? '';
  }

  private addTab(spec: PanelSpec): void {
    if (!this.tabbar || !spec.tab) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-tab';
    b.dataset.testid = `panel-tab-${spec.id}`;
    b.setAttribute('aria-label', spec.tab.label);
    const icon = document.createElement('span');
    icon.className = 'panel-tab-icon';
    icon.style.setProperty('--icon', cssUrl(`${import.meta.env.BASE_URL}assets/ui/menu/${spec.tab.icon}.svg`));
    const label = document.createElement('span');
    label.className = 'panel-tab-label';
    label.textContent = spec.tab.label;
    b.append(icon, label);
    b.addEventListener('click', () => {
      if (!this.isOpen(spec.id)) this.open(spec.id);
    });
    b.classList.toggle('has-dot', this.badges.has(spec.id));
    this.tabbar.append(b);
    this.tabButtons.set(spec.id, b);
  }

  // ---- history -----------------------------------------------------------------------------------

  private queueReconcile(): void {
    if (this.reconcileQueued) return;
    this.reconcileQueued = true;
    queueMicrotask(() => {
      this.reconcileQueued = false;
      this.reconcile();
    });
  }

  /** One history entry per open panel. */
  private reconcile(): void {
    if (this.expectingPop) return;
    try {
      while (this.depth < this.order.length) {
        this.depth++;
        history.pushState({ ashfall: this.depth }, '');
      }
      if (this.depth > this.order.length) {
        const n = this.depth - this.order.length;
        this.depth = this.order.length;
        this.expectingPop = true;
        clearTimeout(this.popTimer);
        // If the browser never reports the traversal, carry on after a moment.
        this.popTimer = setTimeout(() => {
          this.expectingPop = false;
          this.reconcile();
        }, 500);
        history.go(-n);
      }
    } catch {
      // No history access (sandboxed frame): Back then behaves as before.
    }
  }

  private onPop(e: PopStateEvent): void {
    const state = (e.state as { ashfall?: number } | null) ?? null;
    this.depth = state?.ashfall ?? 0;
    if (this.expectingPop) {
      this.expectingPop = false;
      clearTimeout(this.popTimer);
      this.reconcile();
      return;
    }
    // The player pressed Back (or Forward): close panels until the stack matches the history again.
    while (this.order.length > this.depth) {
      const id = this.top()!;
      const entry = this.entries.get(id)!;
      entry.spec.close();
      this.sync(entry);
      if (entry.visible) break; // the panel refused to close; reconcile pushes its entry again
    }
    this.reconcile();
  }
}

/** The shared instance. */
export const panelStack = new PanelStack();
