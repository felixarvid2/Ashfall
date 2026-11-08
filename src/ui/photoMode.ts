/**
 * Photo mode (C06): a key (or the pause menu) hides the HUD, freezes the world and lets the camera orbit and zoom
 * around the hero; Escape (or the pad's B, or the Exit button) returns. Mouse: drag to orbit, wheel to zoom.
 * Touch: drag to orbit, pinch to zoom. Keyboard: arrows orbit, + and - zoom. Pad: right stick orbits, the
 * left and right triggers zoom. `#ui.photo-mode` (style.css) hides everything but the hint and the Exit button.
 */
import { t } from '../data/i18n';
import { panelStack } from './panelStack';

/** Radians of orbit per pixel of drag, and per second of key or stick input. */
export const DRAG_YAW = 0.006;
export const DRAG_PITCH = 0.005;
export const KEY_ORBIT = 1.4;
/** Zoom wheel steps per pixel of pinch change, and per second of key/trigger input. */
export const PINCH_ZOOM = 0.02;
export const KEY_ZOOM = 2.5;

/** What photo mode needs of the camera rig and the game. */
export interface PhotoDeps {
  setPhoto(on: boolean): void;
  orbit(dYaw: number, dPitch: number): void;
  zoom(steps: number): void;
  /** Called after photo mode ends, to drop clicks and keys it swallowed. */
  onExit?: () => void;
  /** Photo mode may start now (playing, no menu open). */
  canEnter: () => boolean;
  /** True for the key bound to the photo mode action, so it also ends the mode. */
  isToggleKey: (e: KeyboardEvent) => boolean;
}

export class PhotoMode {
  private on = false;
  private readonly hint: HTMLDivElement;
  private readonly cleanup: (() => void)[] = [];
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;

  constructor(private readonly root: HTMLElement, private readonly deps: PhotoDeps) {
    this.hint = document.createElement('div');
    this.hint.className = 'photo-hint';
    this.hint.dataset.testid = 'photo-hint';
    this.hint.hidden = true;
    this.hint.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.className = 'photo-hint-text';
    text.textContent = t('ux.photo.hint');
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'photo-exit';
    exit.dataset.testid = 'photo-exit';
    exit.textContent = t('ux.photo.exit');
    exit.addEventListener('click', () => this.exit());
    this.hint.append(text, exit);
    root.append(this.hint);
  }

  get active(): boolean {
    return this.on;
  }

  toggle(): void {
    if (this.on) this.exit();
    else this.enter();
  }

  enter(): boolean {
    if (this.on || !this.deps.canEnter()) return false;
    this.on = true;
    this.root.classList.add('photo-mode');
    this.hint.hidden = false;
    this.deps.setPhoto(true);
    // Keys: arrows orbit, + and - zoom, Escape or the photo key leave. Everything else is swallowed.
    const release = panelStack.captureKeys((e) => {
      if (e.code === 'Escape' || this.deps.isToggleKey(e)) {
        if (!e.repeat) this.exit();
        return true;
      }
      const step = 0.06;
      if (e.code === 'ArrowLeft') this.deps.orbit(-step, 0);
      else if (e.code === 'ArrowRight') this.deps.orbit(step, 0);
      else if (e.code === 'ArrowUp') this.deps.orbit(0, step);
      else if (e.code === 'ArrowDown') this.deps.orbit(0, -step);
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.deps.zoom(-0.5);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.deps.zoom(0.5);
      return true;
    });
    this.cleanup.push(release);
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = this.pinchDistance();
    };
    const move = (e: PointerEvent) => {
      const was = this.pointers.get(e.pointerId);
      if (!was) return;
      const now = { x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, now);
      if (this.pointers.size >= 2) {
        const d = this.pinchDistance();
        if (this.pinch > 0) this.deps.zoom((this.pinch - d) * PINCH_ZOOM);
        this.pinch = d;
      } else {
        // Dragging right turns the world with the hand: the camera goes the other way round.
        this.deps.orbit(-(now.x - was.x) * DRAG_YAW, (now.y - was.y) * DRAG_PITCH);
      }
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = this.pinchDistance();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    this.cleanup.push(
      () => document.removeEventListener('pointerdown', down, true),
      () => document.removeEventListener('pointermove', move, true),
      () => document.removeEventListener('pointerup', up, true),
      () => document.removeEventListener('pointercancel', up, true),
    );
    return true;
  }

  private pinchDistance(): number {
    const pts = [...this.pointers.values()];
    return pts.length >= 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
  }

  /** Pad input each frame: the right stick orbits (x turns, y tilts), `zoom` is -1 (in) .. 1 (out). */
  update(dt: number, stick: { x: number; y: number } | null, zoom: number): void {
    if (!this.on) return;
    if (stick) this.deps.orbit(stick.x * KEY_ORBIT * dt, stick.y * KEY_ORBIT * dt * 0.7);
    if (zoom !== 0) this.deps.zoom(zoom * KEY_ZOOM * dt);
  }

  exit(): void {
    if (!this.on) return;
    this.on = false;
    for (const fn of this.cleanup.splice(0)) fn();
    this.pointers.clear();
    this.root.classList.remove('photo-mode');
    this.hint.hidden = true;
    this.deps.setPhoto(false);
    this.deps.onExit?.();
  }
}
