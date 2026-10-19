/**
 * The endgame status stack on a phone (H073): the rift timer, the world boss countdown and the Ash Harvest rows
 * collapse into one chip. It shows one row at a time (the rift row whenever a rift is running, otherwise the rows
 * take turns every few seconds); a tap shows every row for a moment. Which rows exist is up to the three HUD
 * classes (they set `hidden`); this only marks the active one with `data-tick`. Desktop and landscape ignore the
 * marks (the CSS only reads them in the portrait layout).
 */
export const ROTATE_SECONDS = 4;
export const EXPAND_SECONDS = 5;

/** Index of the row to show: the pinned one if any, else rotating through `count` rows every ROTATE_SECONDS. */
export function activeRow(count: number, pinned: number, elapsed: number): number {
  if (count <= 0) return -1;
  if (pinned >= 0) return pinned;
  return Math.floor(elapsed / ROTATE_SECONDS) % count;
}

export class EndgameStack {
  private elapsed = 0;
  private expandLeft = 0;
  private last = 0;

  constructor(
    private readonly stack: HTMLElement,
    private readonly rows: { rift: HTMLElement; worldBoss: HTMLElement; harvest: HTMLElement },
    /** Tap on the world boss row while the stack is expanded (opens the map). */
    private readonly onWorldBoss: () => void,
  ) {
    stack.addEventListener('click', (e) => {
      if (!stack.classList.contains('expanded')) {
        this.expandLeft = EXPAND_SECONDS;
        this.render();
        return;
      }
      if ((e.target as Element | null)?.closest('.worldboss-hud')) this.onWorldBoss();
      this.expandLeft = EXPAND_SECONDS;
    });
  }

  /** Called every frame with the frame time. */
  update(dt: number): void {
    this.elapsed += dt;
    if (this.expandLeft > 0) this.expandLeft = Math.max(0, this.expandLeft - dt);
    // Re-evaluate a few times a second, not every frame.
    const slot = Math.floor(this.elapsed * 4);
    if (slot === this.last) return;
    this.last = slot;
    this.render();
  }

  private render(): void {
    const visible = [this.rows.rift, this.rows.worldBoss, this.rows.harvest].filter((r) => !r.hidden);
    const pinned = visible.indexOf(this.rows.rift);
    const index = activeRow(visible.length, pinned, this.elapsed);
    for (const row of [this.rows.rift, this.rows.worldBoss, this.rows.harvest]) {
      if (row === visible[index]) row.dataset.tick = '';
      else delete row.dataset.tick;
    }
    const expanded = this.expandLeft > 0 && visible.length > 0;
    this.stack.classList.toggle('expanded', expanded);
    // The count tells the player there is more behind the chip ("1/3").
    if (visible.length > 1 && !expanded) this.stack.dataset.pos = `${index + 1}/${visible.length}`;
    else delete this.stack.dataset.pos;
  }
}
