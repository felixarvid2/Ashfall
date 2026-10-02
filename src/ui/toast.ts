/** Short on-screen notifications ("Game saved"). */
export class Toasts {
  private readonly stack: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.stack = document.createElement('div');
    this.stack.className = 'toast-stack';
    root.appendChild(this.stack);
  }

  show(message: string, kind: 'info' | 'error' = 'info', ms = 1800): void {
    const el = document.createElement('div');
    el.className = `toast ${kind === 'error' ? 'error' : ''}`;
    el.textContent = message;
    this.stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms);
    setTimeout(() => el.remove(), ms + 450);
  }
}
