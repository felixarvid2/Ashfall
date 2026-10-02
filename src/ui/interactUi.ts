/** "E  Open Supply Crate" prompt over the nearest usable object, and the lore log reader. */
import { t } from '../data/i18n';

type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

export class InteractPrompt {
  private readonly el: HTMLDivElement;
  private readonly screen = { x: 0, y: 0 };
  private current = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'interact-prompt';
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  /** Show the prompt for an object at (x, z), or hide it with `null`. */
  update(target: { x: number; z: number; kind: string } | null, keyLabel: string, project: Project): void {
    if (!target || !project(target.x, 1.6, target.z, this.screen)) {
      this.el.hidden = true;
      return;
    }
    const text = t('interact.prompt', { key: keyLabel, action: t(`interact.actions.${target.kind}`) });
    if (text !== this.current) {
      this.current = text;
      this.el.replaceChildren();
      const key = document.createElement('span');
      key.className = 'interact-key';
      key.textContent = keyLabel;
      this.el.append(key, ` ${t(`interact.actions.${target.kind}`)}`);
      this.el.dataset.testid = 'interact-prompt';
    }
    this.el.hidden = false;
    this.el.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -100%)`;
  }
}

export class LoreReader {
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLParagraphElement;
  private readonly footer: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel lore-panel';
    this.panel.hidden = true;
    this.panel.dataset.testid = 'lore-panel';
    this.title = document.createElement('h2');
    this.body = document.createElement('p');
    this.body.className = 'lore-body';
    this.footer = document.createElement('div');
    this.footer.className = 'inv-hint';
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = t('interact.close');
    close.addEventListener('click', () => this.close());
    this.panel.append(this.title, this.body, this.footer, close);
    root.appendChild(this.panel);
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  show(logId: string, xp: number): void {
    this.title.textContent = t(`lore.${logId}.title`);
    this.body.textContent = t(`lore.${logId}.body`);
    this.footer.textContent = xp > 0 ? t('interact.loreXp', { xp }) : '';
    this.panel.hidden = false;
  }

  close(): void {
    this.panel.hidden = true;
  }
}
