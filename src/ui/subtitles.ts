/**
 * Subtitles for barks (C15): what an NPC or a boss says shows as a line of text above the action bar, with the
 * speaker's name, for a time that follows the length of the line. At most two lines are shown; a third pushes the
 * oldest out. It is a polite live region, so a screen reader hears the same words. The Settings > Display switch
 * "Subtitles" decides whether `say` shows anything.
 */
export const SUBTITLE_MAX = 2;
/** Seconds a line stays: a floor and a reading speed of about 15 characters per second. */
export function subtitleSeconds(text: string): number {
  return Math.min(8, Math.max(2.5, 1.5 + text.length / 15));
}

interface Line {
  el: HTMLDivElement;
  left: number;
}

export class Subtitles {
  readonly element: HTMLDivElement;
  private readonly lines: Line[] = [];

  constructor(
    parent: HTMLElement,
    /** The "Subtitles" setting. */
    private readonly enabled: () => boolean = () => true,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'subtitles';
    this.element.dataset.testid = 'subtitles';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    parent.append(this.element);
  }

  get count(): number {
    return this.lines.length;
  }

  /** Shows `speaker: text`. Returns false when subtitles are off or the line is empty. */
  say(speaker: string, text: string, seconds = subtitleSeconds(text)): boolean {
    if (!this.enabled() || !text.trim()) return false;
    const el = document.createElement('div');
    el.className = 'subtitle-line';
    const who = document.createElement('span');
    who.className = 'subtitle-speaker';
    who.textContent = speaker;
    const words = document.createElement('span');
    words.className = 'subtitle-text';
    words.textContent = text;
    el.append(who, words);
    this.element.append(el);
    this.lines.push({ el, left: seconds });
    while (this.lines.length > SUBTITLE_MAX) this.drop(this.lines[0]!);
    return true;
  }

  private drop(line: Line): void {
    line.el.remove();
    this.lines.splice(this.lines.indexOf(line), 1);
  }

  /** Ages the lines; call every frame with real elapsed seconds. */
  update(dt: number): void {
    for (const line of [...this.lines]) {
      line.left -= dt;
      if (line.left <= 0) this.drop(line);
      else line.el.classList.toggle('fading', line.left < 0.5);
    }
  }

  clear(): void {
    for (const line of [...this.lines]) this.drop(line);
  }
}
