/** Minimal Phase 0 HUD: title and controls hint. */
import { t } from '../data/i18n';
import type { Action, MoveMode } from '../data/settings';

/** "KeyW" → "W", "Digit1" → "1", "F3" → "F3". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Backquote') return '§';
  return code;
}

export class Hud {
  private readonly hint: HTMLDivElement;

  constructor(root: HTMLElement) {
    const title = document.createElement('div');
    title.className = 'hud-title';
    const h1 = document.createElement('h1');
    h1.textContent = t('game.title');
    const sub = document.createElement('p');
    sub.textContent = t('game.subtitle');
    title.append(h1, sub);

    this.hint = document.createElement('div');
    this.hint.className = 'hud-hint';
    root.append(title, this.hint);
  }

  updateHint(moveMode: MoveMode, bindings: Record<Action, string[]>): void {
    const first = (a: Action) => keyLabel(bindings[a][0] ?? '?');
    const move =
      moveMode === 'wasd'
        ? [first('moveUp'), first('moveLeft'), first('moveDown'), first('moveRight')].join('')
        : t('moveMode.clickHint');
    this.hint.textContent = t('hud.controlsHint', {
      move,
      debug: first('toggleDebug'),
      save: first('quickSave'),
      load: first('quickLoad'),
    });
  }
}
