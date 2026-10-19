/**
 * The conversation panel (NPC dialogue, quest offers and quest talk).
 *
 * Usage: `panel.show({ speaker, role, text, buttons })`; a quest offer passes `offer` (title, level, rewards) and
 * marks Accept `primary` (P083). The header has a 44 px close button that goes through the panel stack, so the
 * game's own close path runs (P081). On touch the options are 48 px high and a page whose only option is a
 * "continue" advances when the text is tapped (P082). Long text scrolls inside the panel; header and options stay.
 */
import { t } from '../data/i18n';
import { haptic } from './haptics';
import { panelStack } from './panelStack';

export interface DialogueButton {
  label: string;
  /** Small tag before the label ("New quest", "Quest"). */
  tag?: string;
  /** The filled main action of the page (Accept). */
  primary?: boolean;
  onClick: () => void;
}

export interface DialoguePage {
  speaker: string;
  role?: string;
  text: string;
  buttons: DialogueButton[];
  /** A quest offer: shown as a card with reward chips above the text. */
  offer?: { title: string; level?: number; xp: number; gold: number };
}

export class DialoguePanel {
  private readonly panel: HTMLDivElement;
  private readonly avatar: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly role: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly buttons: HTMLDivElement;
  /** Set while the page has one option that a tap on the text also triggers. */
  private advance: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel dialogue-panel';
    this.panel.hidden = true;
    this.panel.dataset.testid = 'dialogue';
    const head = document.createElement('div');
    head.className = 'dialogue-head';
    this.avatar = document.createElement('div');
    this.avatar.className = 'dialogue-avatar';
    this.avatar.setAttribute('aria-hidden', 'true');
    const who = document.createElement('div');
    who.className = 'dialogue-who';
    this.name = document.createElement('div');
    this.name.className = 'dialogue-name';
    this.role = document.createElement('div');
    this.role.className = 'dialogue-role';
    who.append(this.name, this.role);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dialogue-close';
    close.dataset.testid = 'dialogue-close';
    close.setAttribute('aria-label', t('ui.close'));
    close.textContent = '×';
    close.addEventListener('click', () => panelStack.close('dialogue'));
    head.append(this.avatar, who, close);
    this.text = document.createElement('div');
    this.text.className = 'dialogue-text';
    this.text.addEventListener('click', () => this.advance?.());
    this.buttons = document.createElement('div');
    this.buttons.className = 'dialogue-buttons';
    this.panel.append(head, this.text, this.buttons);
    root.appendChild(this.panel);
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  show(page: DialoguePage): void {
    this.name.textContent = page.speaker;
    this.avatar.textContent = page.speaker.trim().charAt(0).toUpperCase();
    this.role.textContent = page.role ?? '';
    this.role.hidden = !page.role;
    const paragraphs = page.text.split('\n').map((line) => Object.assign(document.createElement('p'), { textContent: line }));
    this.text.replaceChildren(...(page.offer ? [this.offerCard(page.offer)] : []), ...paragraphs);
    this.text.scrollTop = 0;
    // Tap-to-advance only for a lone, non-primary option: never an Accept, never the farewell of a greeting.
    const only = page.buttons.length === 1 ? page.buttons[0]! : null;
    this.advance = only && !only.primary && !only.tag ? () => { haptic('tap'); only.onClick(); } : null;
    this.text.classList.toggle('advance', this.advance !== null);
    this.panel.classList.toggle('is-offer', !!page.offer);
    this.buttons.replaceChildren(
      ...page.buttons.map((b, i) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.dataset.testid = `dialogue-option-${i}`;
        if (b.primary) el.classList.add('primary');
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
    this.advance = null;
  }

  /** Title, level and reward chips of a quest offer. */
  private offerCard(offer: NonNullable<DialoguePage['offer']>): HTMLElement {
    const card = document.createElement('div');
    card.className = 'dialogue-offer';
    card.dataset.testid = 'dialogue-offer';
    const title = Object.assign(document.createElement('div'), { className: 'dialogue-offer-title', textContent: offer.title });
    const chips = document.createElement('div');
    chips.className = 'dialogue-chips';
    const chip = (cls: string, text: string) => chips.appendChild(Object.assign(document.createElement('span'), { className: `dialogue-chip ${cls}`, textContent: text }));
    if (offer.level !== undefined) chip('level', t('questUi.level', { level: offer.level }));
    chip('xp', t('questUi.rewardXp', { xp: offer.xp }));
    chip('gold', t('questUi.rewardGold', { gold: offer.gold }));
    card.append(title, chips);
    return card;
  }
}
