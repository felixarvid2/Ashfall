/**
 * Character select (Phase 4): three save slots, each holding one character. An empty slot
 * opens the class picker with a portrait, a short pitch and a name field.
 * Touch (portrait): slots are compact rows, classes a row of three chips, and Begin / Back stay on a bar above the
 * keyboard. The name field is not focused automatically there, so the keyboard does not hide the classes.
 */
import { CLASSES } from '../data/db';
import { t } from '../data/i18n';
import { confirmSheet } from './confirmSheet';
import { panelStack } from './panelStack';
import { tooltipSheet } from './tooltipSheet';
import { artUrl, cssUrl } from './art';

export interface SlotSummary {
  index: number;
  /** null = empty slot. */
  character: { name: string; classId: string; level: number; savedAt: string } | null;
  corrupt?: boolean;
}

export interface CharacterSelectActions {
  play(slot: number): void;
  create(slot: number, classId: string, name: string): void;
  remove(slot: number): void;
  portraitUrl(classId: string): string | null;
}

/** Classes that can be picked. */
export const PLAYABLE_CLASSES = ['bastion', 'spectre', 'xenomant'];
const ALL_CLASSES = ['bastion', 'spectre', 'xenomant'];

/** Longest character name. */
export const NAME_MAX = 24;

const LAST_SLOT_KEY = 'ashfall.lastSlot';

function readLastSlot(): number | null {
  try {
    const n = Number.parseInt(localStorage.getItem(LAST_SLOT_KEY) ?? '', 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastSlot(slot: number): void {
  try {
    localStorage.setItem(LAST_SLOT_KEY, String(slot));
  } catch {
    // Storage may be blocked; Continue then simply is not offered next time.
  }
}

/** "just now", "5 min ago", "2 h ago", "3 days ago", else the date. Pure, for the slot rows (P041). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return t('select.ago.now');
  if (minutes < 60) return t('select.ago.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('select.ago.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 14) return t('select.ago.days', { n: days });
  return new Date(then).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** True on touch screens, where focusing a field raises the keyboard over the screen. */
function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export class CharacterSelect {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  /** Hidden marker for the class picker, so Back/Escape return to the slot list (panel stack). */
  private readonly picker: HTMLDivElement;
  /** Removes the keyboard-inset listener of the class picker. */
  private stopKeyboard: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly slots: () => SlotSummary[],
    private readonly actions: CharacterSelectActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'char-select';
    const title = document.createElement('h1');
    title.textContent = t('game.title');
    const sub = document.createElement('div');
    sub.className = 'char-select-sub';
    sub.textContent = t('game.subtitle');
    this.body = document.createElement('div');
    this.body.className = 'char-select-body';
    this.root.append(title, sub, this.body);
    // The painted title scene behind the menu.
    const backdrop = artUrl('menu/title');
    if (backdrop) this.root.style.setProperty('--menu-art', cssUrl(backdrop));
    this.picker = document.createElement('div');
    this.picker.hidden = true;
    this.root.append(this.picker);
    parent.appendChild(this.root);
    if (!panelStack.has('class-picker')) {
      panelStack.register({ id: 'class-picker', el: this.picker, kind: 'modal', header: false, close: () => this.showSlots() });
    }
    this.showSlots();
  }

  close(): void {
    this.stopKeyboard?.();
    this.picker.hidden = true;
    this.root.remove();
  }

  private play(slot: number): void {
    writeLastSlot(slot);
    this.actions.play(slot);
  }

  private showSlots(): void {
    this.stopKeyboard?.();
    this.stopKeyboard = null;
    this.picker.hidden = true;
    this.root.classList.remove('picking');
    const heading = document.createElement('h2');
    heading.textContent = t('select.title');
    const summaries = this.slots();
    const list = document.createElement('div');
    list.className = 'char-slots';
    for (const slot of summaries) list.appendChild(this.slotCard(slot));

    // One tap back into the game for the character played last (P041).
    const parts: HTMLElement[] = [];
    const last = readLastSlot();
    const lastChar = summaries.find((s) => s.index === last)?.character;
    if (last !== null && lastChar) {
      const cont = document.createElement('button');
      cont.type = 'button';
      cont.className = 'char-continue';
      cont.dataset.testid = 'char-continue';
      cont.textContent = t('select.continue', { name: lastChar.name, level: lastChar.level });
      cont.addEventListener('click', () => this.play(last));
      parts.push(cont);
    }

    const credits = document.createElement('button');
    credits.type = 'button';
    credits.className = 'char-credits-btn';
    credits.dataset.testid = 'char-credits';
    credits.textContent = t('select.creditsButton');
    credits.addEventListener('click', () => this.showCredits());
    this.body.replaceChildren(...parts, heading, list, credits);
  }

  /** The art, music and font credits (their licences ask for it), one source per line, in a scrollable sheet. */
  private showCredits(): void {
    const box = document.createElement('div');
    box.className = 'char-credits-text';
    box.dataset.testid = 'credits-text';
    for (const line of t('select.credits').split(' · ')) {
      box.appendChild(Object.assign(document.createElement('p'), { textContent: line }));
    }
    tooltipSheet.show({ content: box, title: t('select.creditsTitle') });
  }

  private slotCard(slot: SlotSummary): HTMLElement {
    const card = document.createElement('div');
    card.className = 'char-slot';
    card.dataset.testid = `slot-${slot.index}`;
    const c = slot.character;
    if (!c) {
      card.classList.add('empty');
      const plus = document.createElement('div');
      plus.className = 'char-slot-plus';
      plus.textContent = '+';
      const label = document.createElement('div');
      label.className = 'char-slot-name';
      label.textContent = slot.corrupt ? t('select.corrupt') : t('select.new');
      card.append(plus, label);
      card.addEventListener('click', () => this.showClassPicker(slot.index));
      return card;
    }
    const text = document.createElement('div');
    text.className = 'char-slot-text';
    const name = document.createElement('div');
    name.className = 'char-slot-name';
    name.textContent = c.name;
    const info = document.createElement('div');
    info.className = 'char-slot-info';
    info.textContent = `${t(`items.classes.${c.classId}`)} · ${t('ui.level', { level: c.level })}`;
    const played = document.createElement('div');
    played.className = 'char-slot-played';
    const when = relativeTime(c.savedAt);
    played.textContent = when ? t('select.lastPlayed', { when }) : '';
    text.append(name, info, played);

    // A 44 px options button in its own column, so a tap near the corner cannot delete or start the game (P040).
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'char-slot-more';
    more.dataset.testid = `slot-${slot.index}-more`;
    more.textContent = '⋯';
    more.title = t('select.options');
    more.setAttribute('aria-label', t('select.options'));
    more.setAttribute('aria-haspopup', 'true');
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = card.querySelector('.char-slot-menu');
      if (existing) {
        existing.remove();
        more.setAttribute('aria-expanded', 'false');
        return;
      }
      const menu = document.createElement('div');
      menu.className = 'char-slot-menu';
      menu.setAttribute('role', 'menu');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'char-slot-delete';
      del.dataset.testid = `slot-${slot.index}-delete`;
      del.setAttribute('role', 'menuitem');
      del.textContent = t('select.delete');
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        more.setAttribute('aria-expanded', 'false');
        void confirmSheet({
          title: t('select.deleteTitle'),
          body: [t('select.deleteConfirm', { name: c.name }), t('select.deleteDetails', { class: t(`items.classes.${c.classId}`), level: c.level })],
          confirmLabel: t('select.deleteButton'),
          danger: true,
        }).then((ok) => {
          if (!ok) return;
          this.actions.remove(slot.index);
          this.showSlots();
        });
      });
      menu.appendChild(del);
      card.appendChild(menu);
      more.setAttribute('aria-expanded', 'true');
    });
    card.append(this.portrait(c.classId), text, more);
    card.addEventListener('click', () => {
      // A tap anywhere else on the card closes an open menu first instead of starting the game.
      const menu = card.querySelector('.char-slot-menu');
      if (menu) {
        menu.remove();
        more.setAttribute('aria-expanded', 'false');
        return;
      }
      this.play(slot.index);
    });
    return card;
  }

  private portrait(classId: string): HTMLElement {
    const url = this.actions.portraitUrl(classId);
    if (url) return Object.assign(document.createElement('img'), { src: url, alt: '', className: 'char-portrait', draggable: false });
    const div = document.createElement('div');
    div.className = 'char-portrait placeholder';
    div.textContent = t(`items.classes.${classId}`).slice(0, 1);
    return div;
  }

  /**
   * Keep the Begin / Back bar on top of the on-screen keyboard: `--kb` is the part of the screen the keyboard
   * covers (the visual viewport shrinks while the layout viewport may not).
   */
  private trackKeyboard(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      this.root.style.setProperty('--kb', `${Math.round(covered)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    this.stopKeyboard = () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      this.root.style.removeProperty('--kb');
    };
  }

  private showClassPicker(slot: number): void {
    let chosen = PLAYABLE_CLASSES[0]!;
    const heading = document.createElement('h2');
    heading.textContent = t('select.chooseClass');
    const classes = document.createElement('div');
    classes.className = 'char-classes';
    const details = document.createElement('div');
    details.className = 'char-class-details';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = NAME_MAX;
    nameInput.placeholder = t('select.namePlaceholder');
    nameInput.className = 'char-name-input';
    nameInput.dataset.testid = 'char-name';
    // The right keyboard: capitals for names, no autocorrect or suggestions, a "done" key (P036).
    nameInput.setAttribute('autocapitalize', 'words');
    nameInput.setAttribute('autocomplete', 'off');
    nameInput.setAttribute('autocorrect', 'off');
    nameInput.setAttribute('enterkeyhint', 'done');
    nameInput.spellcheck = false;
    nameInput.setAttribute('aria-label', t('select.namePlaceholder'));
    const counter = document.createElement('span');
    counter.className = 'char-name-count';
    counter.setAttribute('aria-hidden', 'true');
    const updateCount = () => {
      counter.textContent = `${nameInput.value.length}/${NAME_MAX}`;
    };
    nameInput.addEventListener('input', updateCount);
    updateCount();
    const nameWrap = document.createElement('div');
    nameWrap.className = 'char-name-wrap';
    nameWrap.append(nameInput, counter);

    const render = () => {
      for (const el of classes.children) {
        const on = (el as HTMLElement).dataset.classId === chosen;
        el.classList.toggle('selected', on);
        el.setAttribute('aria-pressed', String(on));
      }
      const res = CLASSES.get(chosen)?.resource.id ?? 'heat';
      const splash = artUrl(`menu/${chosen}`);
      details.replaceChildren(
        ...(splash ? [Object.assign(document.createElement('img'), { src: splash, alt: '', className: 'char-class-splash', draggable: false })] : []),
        Object.assign(document.createElement('div'), { className: 'char-class-title', textContent: t(`items.classes.${chosen}`) }),
        Object.assign(document.createElement('div'), { className: 'char-class-tagline', textContent: t(`select.classes.${chosen}.tagline`) }),
        Object.assign(document.createElement('p'), { textContent: t(`select.classes.${chosen}.desc`) }),
        Object.assign(document.createElement('div'), { className: 'muted', textContent: t('select.resource', { resource: t(`resources.${res}`) }) }),
      );
    };

    for (const id of ALL_CLASSES) {
      const playable = PLAYABLE_CLASSES.includes(id);
      const card = document.createElement('div');
      card.className = `char-class${playable ? '' : ' locked'}`;
      card.dataset.classId = id;
      card.dataset.testid = `class-${id}`;
      card.setAttribute('role', 'button');
      card.appendChild(this.portrait(id));
      const label = document.createElement('div');
      label.className = 'char-slot-name';
      label.textContent = t(`items.classes.${id}`);
      card.appendChild(label);
      if (!playable) {
        const soon = document.createElement('div');
        soon.className = 'char-slot-info';
        soon.textContent = t('select.comingSoon');
        card.appendChild(soon);
      } else {
        card.addEventListener('click', () => {
          chosen = id;
          render();
        });
      }
      classes.appendChild(card);
    }

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'char-create';
    create.dataset.testid = 'char-create';
    create.textContent = t('select.create');
    const submit = () => {
      const name = nameInput.value.trim() || t(`items.classes.${chosen}`);
      writeLastSlot(slot);
      this.actions.create(slot, chosen, name);
    };
    create.addEventListener('click', submit);
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
    });
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'char-back';
    back.textContent = t('select.back');
    back.addEventListener('click', () => this.showSlots());
    const row = document.createElement('div');
    row.className = 'char-create-row';
    row.append(nameWrap, create, back);

    this.body.replaceChildren(heading, classes, details, row);
    this.picker.hidden = false;
    this.root.classList.add('picking');
    render();
    this.stopKeyboard?.();
    this.trackKeyboard();
    // Start at the top: the player sees the classes before anything else (P035).
    this.root.scrollTop = 0;
    // A phone would raise the keyboard over the classes; the field is focused when it is tapped.
    if (!coarsePointer()) nameInput.focus({ preventScroll: true });
  }
}
