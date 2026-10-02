/**
 * Quest presentation: the conversation panel, name plates with ! / ? over NPCs, the HUD quest
 * tracker and the quest log (J).
 */
import { t } from '../data/i18n';

export interface DialogueButton {
  label: string;
  /** Small tag before the label ("New quest", "Quest"). */
  tag?: string;
  onClick: () => void;
}

export interface DialoguePage {
  speaker: string;
  role?: string;
  text: string;
  buttons: DialogueButton[];
}

export class DialoguePanel {
  private readonly panel: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly role: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly buttons: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel dialogue-panel';
    this.panel.hidden = true;
    this.panel.dataset.testid = 'dialogue';
    this.name = document.createElement('div');
    this.name.className = 'dialogue-name';
    this.role = document.createElement('div');
    this.role.className = 'dialogue-role';
    this.text = document.createElement('div');
    this.text.className = 'dialogue-text';
    this.buttons = document.createElement('div');
    this.buttons.className = 'dialogue-buttons';
    this.panel.append(this.name, this.role, this.text, this.buttons);
    root.appendChild(this.panel);
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  show(page: DialoguePage): void {
    this.name.textContent = page.speaker;
    this.role.textContent = page.role ?? '';
    this.role.hidden = !page.role;
    this.text.replaceChildren(
      ...page.text.split('\n').map((line) => Object.assign(document.createElement('p'), { textContent: line })),
    );
    this.buttons.replaceChildren(
      ...page.buttons.map((b, i) => {
        const el = document.createElement('button');
        el.dataset.testid = `dialogue-option-${i}`;
        if (b.tag) el.appendChild(Object.assign(document.createElement('span'), { className: 'dialogue-tag', textContent: b.tag }));
        el.append(b.label);
        el.addEventListener('click', b.onClick);
        return el;
      }),
    );
    this.panel.hidden = false;
  }

  close(): void {
    this.panel.hidden = true;
  }
}

type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

/** Name plates over nearby NPCs, with a marker when they have something for you. */
export class NpcPlates {
  private readonly layer: HTMLDivElement;
  private readonly plates = new Map<string, HTMLDivElement>();
  private readonly screen = { x: 0, y: 0 };

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'npc-plates';
    root.appendChild(this.layer);
  }

  update(npcs: { id: string; x: number; z: number; name: string; marker: '!' | '?' | '' }[], project: Project): void {
    const seen = new Set<string>();
    for (const n of npcs) {
      if (!project(n.x, 2.5, n.z, this.screen)) continue;
      seen.add(n.id);
      let plate = this.plates.get(n.id);
      if (!plate) {
        plate = document.createElement('div');
        plate.className = 'npc-plate';
        plate.dataset.testid = `npc-${n.id}`;
        this.layer.appendChild(plate);
        this.plates.set(n.id, plate);
      }
      const key = `${n.name}|${n.marker}`;
      if (plate.dataset.key !== key) {
        plate.dataset.key = key;
        plate.replaceChildren();
        if (n.marker) plate.appendChild(Object.assign(document.createElement('div'), { className: 'npc-marker', textContent: n.marker }));
        plate.appendChild(Object.assign(document.createElement('div'), { className: 'npc-name', textContent: n.name }));
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
}

/** Up to three active quests under the minimap (the tracked one first). */
export class QuestTracker {
  private readonly el: HTMLDivElement;
  private last = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'quest-tracker';
    this.el.dataset.testid = 'quest-tracker';
    root.appendChild(this.el);
  }

  update(quests: TrackedQuest[]): void {
    const shown = quests.slice(0, 3);
    const key = shown.map((q) => `${q.id}|${q.step}|${q.tracked}`).join('#');
    if (key === this.last) return;
    this.last = key;
    this.el.replaceChildren(
      ...shown.map((q) => {
        const row = document.createElement('div');
        row.className = `quest-row q-${q.kind}${q.tracked ? ' tracked' : ''}`;
        row.append(
          Object.assign(document.createElement('div'), { className: 'quest-title', textContent: q.title }),
          Object.assign(document.createElement('div'), { className: 'quest-step', textContent: q.step }),
        );
        return row;
      }),
    );
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

export class QuestLog {
  private readonly panel: HTMLDivElement;
  private readonly list: HTMLDivElement;

  constructor(
    root: HTMLElement,
    private readonly entries: () => { active: QuestLogEntry[]; done: string[] },
    private readonly track: (id: string) => void,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel quest-log';
    this.panel.hidden = true;
    this.panel.dataset.testid = 'quest-log';
    const title = document.createElement('h2');
    title.textContent = t('questUi.log');
    this.list = document.createElement('div');
    this.panel.append(title, this.list);
    root.appendChild(this.panel);
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
    if (this.open) this.refresh();
  }

  refresh(): void {
    if (!this.open) return;
    const { active, done } = this.entries();
    const rows: HTMLElement[] = [];
    if (active.length === 0) rows.push(Object.assign(document.createElement('p'), { className: 'inv-hint', textContent: t('questUi.noQuests') }));
    for (const q of active) {
      const row = document.createElement('div');
      row.className = `log-entry q-${q.kind}${q.tracked ? ' tracked' : ''}`;
      const head = document.createElement('div');
      head.className = 'log-head';
      head.append(
        Object.assign(document.createElement('span'), { className: 'quest-title', textContent: q.title }),
        Object.assign(document.createElement('span'), { className: 'log-kind', textContent: `${t(`questUi.kinds.${q.kind}`)} · ${t('questUi.level', { level: q.level })}` }),
      );
      const track = document.createElement('button');
      track.textContent = q.tracked ? t('questUi.tracked') : t('questUi.track');
      track.disabled = q.tracked;
      track.addEventListener('click', () => {
        this.track(q.id);
        this.refresh();
      });
      row.append(
        head,
        Object.assign(document.createElement('p'), { className: 'log-summary', textContent: q.summary }),
        Object.assign(document.createElement('p'), { className: 'quest-step', textContent: `▸ ${q.step}` }),
        Object.assign(document.createElement('p'), { className: 'inv-hint', textContent: q.rewards }),
        track,
      );
      rows.push(row);
    }
    if (done.length) {
      rows.push(Object.assign(document.createElement('h3'), { className: 'log-done-title', textContent: t('questUi.completedList') }));
      rows.push(Object.assign(document.createElement('p'), { className: 'log-done', textContent: done.join(' · ') }));
    }
    this.list.replaceChildren(...rows);
  }
}
