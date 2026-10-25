/**
 * Quest presentation: the conversation panel, name plates with ! / ? over NPCs, the HUD quest
 * tracker and the quest log (J).
 */
import { t } from '../data/i18n';
import { haptic } from './haptics';

// The conversation panel lives in its own module (P081-P083); re-exported so existing imports keep working.
import { DialoguePanel, type DialogueButton, type DialoguePage } from './dialoguePanel';
import { getPref, prefsBlocked, setPref } from '../core/localPrefs';
export { DialoguePanel, type DialogueButton, type DialoguePage };

type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

/** Name plates over nearby NPCs, with a marker when they have something for you. */
export class NpcPlates {
  private readonly layer: HTMLDivElement;
  private readonly plates = new Map<string, HTMLDivElement>();
  private readonly screen = { x: 0, y: 0 };

  /** `onTap` makes the plates buttons (touch: walk to the NPC and talk); elite plates pass none. */
  constructor(root: HTMLElement, private readonly onTap?: (id: string) => void) {
    this.layer = document.createElement('div');
    this.layer.className = 'npc-plates';
    root.appendChild(this.layer);
  }

  update(npcs: { id: string; x: number; z: number; name: string; marker: '!' | '?' | ''; color?: string; y?: number }[], project: Project): void {
    const seen = new Set<string>();
    for (const n of npcs) {
      if (!project(n.x, n.y ?? 2.5, n.z, this.screen)) continue;
      seen.add(n.id);
      let plate = this.plates.get(n.id);
      if (!plate) {
        plate = document.createElement('div');
        plate.className = 'npc-plate';
        plate.dataset.testid = `npc-${n.id}`;
        if (this.onTap) {
          const tap = this.onTap;
          plate.classList.add('tappable');
          plate.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            tap(n.id);
          });
        }
        this.layer.appendChild(plate);
        this.plates.set(n.id, plate);
      }
      const key = `${n.name}|${n.marker}|${n.color ?? ''}`;
      if (plate.dataset.key !== key) {
        plate.dataset.key = key;
        plate.replaceChildren();
        if (n.marker) plate.appendChild(Object.assign(document.createElement('div'), { className: 'npc-marker', textContent: n.marker }));
        const name = Object.assign(document.createElement('div'), { className: 'npc-name', textContent: n.name });
        if (n.color) name.style.color = n.color;
        plate.appendChild(name);
      }
      plate.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -100%)`;
    }
    for (const [id, plate] of this.plates) {
      if (seen.has(id)) continue;
      plate.remove();
      this.plates.delete(id);
    }
  }
}

export interface TrackedQuest {
  id: string;
  title: string;
  step: string;
  kind: 'main' | 'side' | 'mystery';
  tracked: boolean;
  /** Metres to the nearest marker of the quest's current step, and the screen direction to it (degrees, 0 = up). */
  dist?: number;
  angle?: number;
}

/** Seconds of fighting before the tracker folds to its title (H054). */
export const COLLAPSE_AFTER_COMBAT = 6;

/**
 * Whether the HUD tracker shows its step or only the title. A tap toggles it; six seconds of combat fold it
 * (and it unfolds when the fight ends), unless the player chose; a changed step always unfolds it.
 */
export class TrackerFold {
  collapsed = false;
  private manual = false;
  private combatTime = 0;

  tick(dt: number, combat: boolean): void {
    if (!combat) {
      this.combatTime = 0;
      if (!this.manual) this.collapsed = false;
      return;
    }
    this.combatTime += dt;
    if (!this.manual && this.combatTime >= COLLAPSE_AFTER_COMBAT) this.collapsed = true;
  }

  /** The player tapped the tracker. */
  toggle(): void {
    this.manual = true;
    this.collapsed = !this.collapsed;
  }

  /** A step changed: show it. */
  reveal(): void {
    this.manual = false;
    this.collapsed = false;
    this.combatTime = 0;
  }
}

/** "142 m", rounded to 5 m so the number does not flicker while walking. */
export function formatDistance(metres: number): string {
  return `${Math.max(0, Math.round(metres / 5) * 5)} m`;
}

/** Active quests under the minimap: the tracked one expanded, the others behind a "+N" chip on touch. */
export class QuestTracker {
  private readonly el: HTMLDivElement;
  private readonly more: HTMLButtonElement;
  private last = '';
  private steps = new Map<string, string>();
  private readonly fold = new TrackerFold();
  private distText = '';
  private angle = -1;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    root: HTMLElement,
    /** The "+N" chip opens the quest log. */
    private readonly openLog: () => void = () => {},
  ) {
    this.el = document.createElement('div');
    this.el.className = 'quest-tracker';
    this.el.dataset.testid = 'quest-tracker';
    this.more = document.createElement('button');
    this.more.type = 'button';
    this.more.className = 'quest-more';
    this.more.dataset.testid = 'quest-more';
    this.more.hidden = true;
    this.more.addEventListener('click', () => this.openLog());
    root.appendChild(this.el);
  }

  /** Time passes: folds the tracker during long fights. */
  tick(dt: number, combat: boolean): void {
    this.fold.tick(dt, combat);
    this.el.classList.toggle('collapsed', this.fold.collapsed);
  }

  update(quests: TrackedQuest[]): void {
    const shown = quests.slice(0, 3);
    const key = shown.map((q) => `${q.id}|${q.step}|${q.tracked}`).join('#');
    if (key !== this.last) {
      const first = this.last === '';
      this.last = key;
      // A new quest or a new step: the row flashes, the tracker unfolds and the phone ticks (H055).
      const changed = new Set<string>();
      const before = this.steps;
      for (const q of shown) if (before.get(q.id) !== q.step) changed.add(q.id);
      this.steps = new Map(shown.map((q) => [q.id, q.step]));
      this.distText = '';
      this.angle = -1;
      this.el.replaceChildren(
        ...shown.map((q) => {
          const row = document.createElement('div');
          row.className = `quest-row q-${q.kind}${q.tracked ? ' tracked' : ''}${!first && changed.has(q.id) ? ' updated' : ''}`;
          const step = Object.assign(document.createElement('div'), { className: 'quest-step', textContent: q.step });
          // A finished step stays on top for a moment, struck through with a check, and fades out over the new one (A018).
          // It is absolutely positioned, so the row never changes height.
          const oldStep = before.get(q.id);
          if (!first && changed.has(q.id) && oldStep) {
            step.append(Object.assign(document.createElement('span'), { className: 'quest-step-old', textContent: `\u2713 ${oldStep}` }));
          }
          row.append(
            Object.assign(document.createElement('div'), { className: 'quest-title', textContent: q.title }),
            step,
            Object.assign(document.createElement('div'), { className: 'quest-dist' }),
          );
          if (q.tracked) row.addEventListener('click', () => this.toggleFold());
          return row;
        }),
        this.more,
      );
      if (!first && changed.size > 0) {
        this.fold.reveal();
        this.el.classList.remove('collapsed');
        haptic('quest');
        clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(() => this.el.querySelectorAll('.updated').forEach((r) => r.classList.remove('updated')), 1500);
      }
    }
    // The chip counts the quests that are not on screen.
    const others = quests.length - (quests.some((q) => q.tracked) ? 1 : 0);
    this.more.hidden = others <= 0;
    this.more.textContent = `+${Math.max(0, others)}`;
    this.more.setAttribute('aria-label', t('questUi.log'));
    // Where to: the distance to the tracked quest's marker and an arrow pointing at it (H056).
    const tracked = quests.find((q) => q.tracked);
    const text = tracked?.dist !== undefined ? formatDistance(tracked.dist) : '';
    const angle = tracked?.angle !== undefined ? Math.round(tracked.angle / 5) * 5 : -1;
    if (text !== this.distText || angle !== this.angle) {
      this.distText = text;
      this.angle = angle;
      const slot = this.el.querySelector('.quest-row.tracked .quest-dist');
      if (slot) {
        slot.replaceChildren();
        if (text) {
          const arrow = Object.assign(document.createElement('span'), { className: 'quest-dist-arrow', textContent: '▲' });
          arrow.style.setProperty('--angle', `${angle}deg`);
          slot.append(arrow, text);
        }
      }
    }
  }

  private toggleFold(): void {
    this.fold.toggle();
    this.el.classList.toggle('collapsed', this.fold.collapsed);
  }
}

export interface QuestLogEntry {
  id: string;
  title: string;
  summary: string;
  step: string;
  kind: 'main' | 'side' | 'mystery';
  level: number;
  rewards: string;
  tracked: boolean;
}

export interface QuestLogDone {
  id: string;
  title: string;
  summary: string;
  /** What the quest paid ("Rewards: 120 XP · 40 gold"). */
  rewards: string;
}

/** Which active quests start expanded: the tracked one, else the first (P072). */
export function initialExpanded(active: readonly { id: string; tracked: boolean }[]): Set<string> {
  const pick = active.find((q) => q.tracked) ?? active[0];
  return new Set(pick ? [pick.id] : []);
}

/** Quests this many levels (or more) below the player count as trivial (B040). */
export const TRIVIAL_LEVELS = 20;

export function isTrivialQuest(questLevel: number, playerLevel: number): boolean {
  return playerLevel - questLevel >= TRIVIAL_LEVELS;
}

/** The log's two groups, main quests first; mystery quests sit with the side quests. Empty groups are left out (B040). */
export function groupQuests<T extends { kind: 'main' | 'side' | 'mystery' }>(active: readonly T[]): { group: 'main' | 'side'; items: T[] }[] {
  const main = active.filter((q) => q.kind === 'main');
  const side = active.filter((q) => q.kind !== 'main');
  return [...(main.length ? [{ group: 'main' as const, items: main }] : []), ...(side.length ? [{ group: 'side' as const, items: side }] : [])];
}

const HINT_KEY = 'ashfall.hint.questTrack';

export class QuestLog {
  private readonly panel: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private tab: 'active' | 'done' = 'active';
  private expanded = new Set<string>();
  private seeded = false;
  private lastTracked: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly entries: () => { active: QuestLogEntry[]; done: QuestLogDone[] },
    /** Sets the tracked quest; `null` stops tracking. */
    private readonly track: (id: string | null) => void,
    private readonly actions: { showOnMap?: (id: string) => void; openMap?: () => void; /** The hero's level, for dimming trivial quests. */ playerLevel?: () => number } = {},
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel quest-log';
    this.panel.hidden = true;
    this.panel.dataset.testid = 'quest-log';
    const title = document.createElement('h2');
    title.textContent = t('questUi.log');
    this.tabs = document.createElement('div');
    this.tabs.className = 'log-tabs';
    this.tabs.setAttribute('role', 'tablist');
    this.list = document.createElement('div');
    this.list.className = 'log-list';
    this.panel.append(title, this.tabs, this.list);
    root.appendChild(this.panel);
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  /** The panel root (for the panel stack). */
  get element(): HTMLElement {
    return this.panel;
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
    if (this.open) {
      this.seeded = false;
      this.refresh();
    }
  }

  refresh(): void {
    if (!this.open) return;
    const { active, done } = this.entries();
    if (!this.seeded) {
      this.seeded = true;
      this.expanded = initialExpanded(active);
    }
    this.lastTracked = active.find((q) => q.tracked)?.id ?? null;
    if (this.tab === 'done' && done.length === 0) this.tab = 'active';
    this.renderTabs(active.length, done.length);
    this.list.replaceChildren(...(this.tab === 'active' ? this.renderActive(active) : this.renderDone(done)));
  }

  private renderTabs(active: number, done: number): void {
    const tab = (id: 'active' | 'done', label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `log-tab${this.tab === id ? ' on' : ''}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(this.tab === id));
      b.dataset.testid = `log-tab-${id}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        this.tab = id;
        this.refresh();
      });
      return b;
    };
    this.tabs.replaceChildren(tab('active', t('questUi.activeTab', { n: active })), tab('done', t('questUi.completedTab', { n: done })));
  }

  private renderActive(active: QuestLogEntry[]): HTMLElement[] {
    if (active.length === 0) return [this.emptyState()];
    const rows: HTMLElement[] = [];
    if (!this.hintSeen()) {
      rows.push(Object.assign(document.createElement('p'), { className: 'log-hint', textContent: t('questUi.trackHint') }));
      this.markHintSeen();
    }
    const playerLevel = this.actions.playerLevel?.() ?? 0;
    const ordered = groupQuests(active).flatMap((g) => g.items.map((q, i) => ({ q, heading: i === 0 ? g.group : null })));
    for (const { q, heading } of ordered) {
      if (heading) rows.push(Object.assign(document.createElement('h3'), { className: 'log-group', textContent: t(heading === 'main' ? 'questUi.groupMain' : 'questUi.groupSide') }));
      const open = this.expanded.has(q.id);
      const trivial = playerLevel > 0 && isTrivialQuest(q.level, playerLevel);
      const row = document.createElement('div');
      row.className = `log-entry q-${q.kind}${q.tracked ? ' tracked' : ''}${open ? ' open' : ''}${trivial ? ' trivial' : ''}`;
      row.dataset.quest = q.id;
      const head = document.createElement('div');
      head.className = 'log-head';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'log-toggle';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.append(
        Object.assign(document.createElement('span'), { className: 'quest-title', textContent: q.title }),
        Object.assign(document.createElement('span'), { className: 'log-kind', textContent: `${t(`questUi.kinds.${q.kind}`)} · ${t('questUi.level', { level: q.level })}${trivial ? ` · ${t('questUi.trivial')}` : ''}` }),
        Object.assign(document.createElement('span'), { className: 'log-now', textContent: q.step }),
      );
      toggle.addEventListener('click', () => {
        if (this.expanded.has(q.id)) this.expanded.delete(q.id);
        else this.expanded.add(q.id);
        this.refresh();
      });
      // A star: tap to follow the quest on the HUD, tap again to stop.
      const star = document.createElement('button');
      star.type = 'button';
      star.className = `log-star${q.tracked ? ' on' : ''}`;
      star.dataset.testid = `log-star-${q.id}`;
      star.setAttribute('aria-pressed', String(q.tracked));
      star.setAttribute('aria-label', q.tracked ? t('questUi.untrack') : t('questUi.track'));
      star.textContent = q.tracked ? '★' : '☆';
      star.addEventListener('click', () => {
        haptic('tap');
        this.track(q.tracked ? null : q.id);
        this.refresh();
      });
      head.append(toggle, star);
      row.append(head);
      if (open) {
        const body = document.createElement('div');
        body.className = 'log-body';
        body.append(
          Object.assign(document.createElement('p'), { className: 'log-summary', textContent: q.summary }),
          Object.assign(document.createElement('p'), { className: 'quest-step', textContent: `▸ ${q.step}` }),
          Object.assign(document.createElement('p'), { className: 'log-rewards', textContent: q.rewards }),
        );
        if (this.actions.showOnMap) {
          const onMap = document.createElement('button');
          onMap.type = 'button';
          onMap.className = 'log-map';
          onMap.dataset.testid = `log-map-${q.id}`;
          onMap.textContent = t('questUi.showOnMap');
          onMap.addEventListener('click', () => this.actions.showOnMap?.(q.id));
          body.append(onMap);
        }
        row.append(body);
      }
      rows.push(row);
    }
    return rows;
  }

  private renderDone(done: QuestLogDone[]): HTMLElement[] {
    return done.map((q) => {
      const open = this.expanded.has(`done:${q.id}`);
      const row = document.createElement('div');
      row.className = `log-entry log-done-row${open ? ' open' : ''}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'log-toggle';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.append(
        Object.assign(document.createElement('span'), { className: 'log-check', textContent: '✓' }),
        Object.assign(document.createElement('span'), { className: 'quest-title', textContent: q.title }),
        Object.assign(document.createElement('span'), { className: 'log-now', textContent: q.rewards }),
      );
      toggle.addEventListener('click', () => {
        const k = `done:${q.id}`;
        if (this.expanded.has(k)) this.expanded.delete(k);
        else this.expanded.add(k);
        this.refresh();
      });
      row.append(toggle);
      if (open) row.append(Object.assign(document.createElement('p'), { className: 'log-summary log-body', textContent: q.summary }));
      return row;
    });
  }

  private emptyState(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'log-empty';
    box.dataset.testid = 'log-empty';
    const open = this.actions.openMap;
    box.append(
      Object.assign(document.createElement('div'), { className: 'log-empty-icon', textContent: '!' }),
      Object.assign(document.createElement('p'), { className: 'log-empty-title', textContent: t('questUi.noQuests') }),
      Object.assign(document.createElement('p'), { className: 'log-empty-hint', textContent: t('questUi.emptyHint') }),
    );
    if (open) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'log-map', textContent: t('questUi.openMap') });
      b.dataset.testid = 'log-open-map';
      b.addEventListener('click', open);
      box.append(b);
    }
    return box;
  }

  private hintSeen(): boolean {
    // Blocked storage counts as seen, so the hint shows only once per page load.
    return getPref(HINT_KEY) === '1' || prefsBlocked();
  }

  private markHintSeen(): void {
    setPref(HINT_KEY, '1');
  }

  /** The id of the tracked quest as of the last refresh (for tests and the HUD). */
  get trackedId(): string | null {
    return this.lastTracked;
  }
}
