/**
 * One shared bottom sheet for item and skill details on touch screens (hover tooltips do not exist there).
 *
 * Usage:
 *   tooltipSheet.show({ content: renderItemTooltip(item, classId), title: 'Item', actions: [
 *     { label: 'Equip', primary: true, onClick: () => equip() },
 *     { label: 'Salvage', danger: true, onClick: () => salvage() } ] });
 *   tooltipSheet.hide();  tooltipSheet.isOpen
 * `content` can be a single element or two (an item and the equipped item for a side-by-side comparison, P056):
 * pass `compare: otherElement` and it is shown beside / below the first. The sheet scrolls, closes with its X,
 * a tap outside, a swipe down, Escape or the Back button, and calls `onClose` when it goes away however that
 * happened. Use `useSheet()` to decide between this and the desktop hover tooltip.
 */
import { panelHeader } from './panelHeader';
import { panelStack } from './panelStack';

export interface SheetAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Keep the sheet open after the action (default: it closes). */
  keepOpen?: boolean;
}

export interface SheetOptions {
  content: HTMLElement;
  /** Second element for a comparison, e.g. the equipped item. */
  compare?: HTMLElement;
  title?: string;
  actions?: SheetAction[];
  onClose?: () => void;
}

/** True on touch screens: show details in the sheet rather than a hover tooltip. */
export function useSheet(): boolean {
  return panelStack.container.classList.contains('touch-ui');
}

class TooltipSheet {
  private el: HTMLDivElement | null = null;
  private body!: HTMLDivElement;
  private actions!: HTMLDivElement;
  private titleEl!: HTMLHeadingElement;
  private onClose: (() => void) | undefined;

  get isOpen(): boolean {
    return !!this.el && !this.el.hidden;
  }

  private ensure(): HTMLDivElement {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'tooltip-sheet';
    el.hidden = true;
    el.dataset.testid = 'tooltip-sheet';
    this.titleEl = Object.assign(document.createElement('h2'), { className: 'sheet-title' });
    this.body = Object.assign(document.createElement('div'), { className: 'sheet-body' });
    this.actions = Object.assign(document.createElement('div'), { className: 'sheet-actions' });
    el.append(panelHeader(this.titleEl, () => this.hide(), { panel: el }), this.body, this.actions);
    panelStack.container.append(el);
    this.el = el;
    panelStack.register({ id: 'tooltip-sheet', el, kind: 'sheet', header: false, scrim: true, close: () => this.hide() });
    return el;
  }

  show(opts: SheetOptions): void {
    const el = this.ensure();
    // A new sheet replaces the old one without reporting it closed twice.
    const previous = this.onClose;
    this.onClose = undefined;
    if (!el.hidden) previous?.();
    this.titleEl.textContent = opts.title ?? '';
    this.titleEl.hidden = !opts.title;
    this.body.classList.toggle('has-compare', !!opts.compare);
    this.body.replaceChildren(opts.content, ...(opts.compare ? [opts.compare] : []));
    this.body.scrollTop = 0;
    this.actions.replaceChildren(
      ...(opts.actions ?? []).map((a) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: a.label, disabled: !!a.disabled });
        b.className = `sheet-action${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`;
        b.addEventListener('click', () => {
          if (!a.keepOpen) this.hide();
          a.onClick();
        });
        return b;
      }),
    );
    this.actions.hidden = (opts.actions?.length ?? 0) === 0;
    this.onClose = opts.onClose;
    el.hidden = false;
  }

  hide(): void {
    if (!this.el || this.el.hidden) return;
    this.el.hidden = true;
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
  }
}

export const tooltipSheet = new TooltipSheet();

