/** Short on-screen notifications ("Game saved"). */

/** Toasts on screen at once; a fourth pushes the oldest out (H058). */
export const MAX_TOASTS = 3;

export interface ToastRecord {
  message: string;
  kind: 'info' | 'error';
  count: number;
}

/**
 * Adds a message to the visible list. The same message and kind merges into the existing entry ("x3") and
 * reports `merged`; otherwise the entry is appended and the oldest ones beyond `max` are returned as `dropped`.
 */
export function pushToast(
  list: ToastRecord[],
  message: string,
  kind: 'info' | 'error',
  max = MAX_TOASTS,
): { entry: ToastRecord; merged: boolean; dropped: ToastRecord[] } {
  const same = list.find((r) => r.message === message && r.kind === kind);
  if (same) {
    same.count += 1;
    return { entry: same, merged: true, dropped: [] };
  }
  const entry: ToastRecord = { message, kind, count: 1 };
  list.push(entry);
  return { entry, merged: false, dropped: list.splice(0, Math.max(0, list.length - max)) };
}

interface Shown {
  record: ToastRecord;
  el: HTMLDivElement;
  fade: ReturnType<typeof setTimeout>;
  remove: ReturnType<typeof setTimeout>;
}

export class Toasts {
  private readonly stack: HTMLDivElement;
  private readonly shown: Shown[] = [];

  constructor(root: HTMLElement) {
    this.stack = document.createElement('div');
    this.stack.className = 'toast-stack';
    root.appendChild(this.stack);
  }

  show(message: string, kind: 'info' | 'error' = 'info', ms = 1800): void {
    const records = this.shown.map((s) => s.record);
    const { entry, merged, dropped } = pushToast(records, message, kind);
    for (const gone of dropped) {
      const i = this.shown.findIndex((s) => s.record === gone);
      if (i >= 0) this.dispose(this.shown.splice(i, 1)[0]!);
    }
    if (merged) {
      // Same text again: "x3" and a fresh timer.
      const s = this.shown.find((x) => x.record === entry)!;
      clearTimeout(s.fade);
      clearTimeout(s.remove);
      s.el.classList.remove('fade');
      this.label(s);
      this.arm(s, ms);
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${kind === 'error' ? 'error' : ''}`;
    const s: Shown = { record: entry, el, fade: 0 as never, remove: 0 as never };
    this.label(s);
    this.stack.appendChild(el);
    this.shown.push(s);
    this.arm(s, ms);
  }

  private label(s: Shown): void {
    s.el.textContent = s.record.count > 1 ? `${s.record.message}  x${s.record.count}` : s.record.message;
  }

  private arm(s: Shown, ms: number): void {
    s.fade = setTimeout(() => s.el.classList.add('fade'), ms);
    s.remove = setTimeout(() => {
      const i = this.shown.indexOf(s);
      if (i >= 0) this.shown.splice(i, 1);
      s.el.remove();
    }, ms + 450);
  }

  private dispose(s: Shown): void {
    clearTimeout(s.fade);
    clearTimeout(s.remove);
    s.el.remove();
  }
}
