/**
 * Character select (Phase 4): three save slots, each holding one character. An empty slot
 * opens the class picker with a portrait, a short pitch and a name field.
 */
import { CLASSES } from '../data/db';
import { t } from '../data/i18n';

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

/** Classes that can be picked right now (Xenomant arrives in Phase 4b). */
export const PLAYABLE_CLASSES = ['bastion', 'spectre'];
const ALL_CLASSES = ['bastion', 'spectre', 'xenomant'];

export class CharacterSelect {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;

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
    parent.appendChild(this.root);
    this.showSlots();
  }

  close(): void {
    this.root.remove();
  }

  private showSlots(): void {
    const heading = document.createElement('h2');
    heading.textContent = t('select.title');
    const list = document.createElement('div');
    list.className = 'char-slots';
    for (const slot of this.slots()) list.appendChild(this.slotCard(slot));
    this.body.replaceChildren(heading, list);
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
    card.appendChild(this.portrait(c.classId));
    const name = document.createElement('div');
    name.className = 'char-slot-name';
    name.textContent = c.name;
    const info = document.createElement('div');
    info.className = 'char-slot-info';
    info.textContent = `${t(`items.classes.${c.classId}`)} · ${t('ui.level', { level: c.level })}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'char-slot-delete';
    del.textContent = '✕';
    del.title = t('select.delete');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(t('select.deleteConfirm', { name: c.name }))) {
        this.actions.remove(slot.index);
        this.showSlots();
      }
    });
    card.append(name, info, del);
    card.addEventListener('click', () => this.actions.play(slot.index));
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
    nameInput.maxLength = 24;
    nameInput.placeholder = t('select.namePlaceholder');
    nameInput.className = 'char-name-input';
    nameInput.dataset.testid = 'char-name';

    const render = () => {
      for (const el of classes.children) el.classList.toggle('selected', (el as HTMLElement).dataset.classId === chosen);
      const res = CLASSES.get(chosen)?.resource.id ?? 'heat';
      details.replaceChildren(
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
    row.append(nameInput, create, back);

    this.body.replaceChildren(heading, classes, details, row);
    render();
    nameInput.focus();
  }
}
