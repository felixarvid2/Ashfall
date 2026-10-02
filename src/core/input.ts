/**
 * Input state: keyboard actions (via key bindings), mouse position and buttons,
 * and wheel. Systems read a snapshot every tick; "pressed" edges are consumed
 * once per tick so a tap is never missed or double-counted.
 */
import type { Action } from '../data/settings';

export class Input {
  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly buttonsDown = new Set<number>();
  private readonly buttonsPressed = new Set<number>();
  private wheelAccum = 0;
  private bindings: Record<Action, string[]>;

  /** Mouse in normalized device coordinates (-1..1), +y up. */
  readonly mouseNdc = { x: 0, y: 0 };
  /** True once the mouse has moved over the canvas at least once. */
  mouseSeen = false;

  constructor(
    private readonly target: HTMLElement,
    bindings: Record<Action, string[]>,
  ) {
    this.bindings = bindings;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setBindings(bindings: Record<Action, string[]>): void {
    this.bindings = bindings;
  }

  /** Action held this tick. */
  isDown(action: Action): boolean {
    return this.bindings[action].some((code) => this.keysDown.has(code));
  }

  /** Action went down since the last endTick(). */
  wasPressed(action: Action): boolean {
    return this.bindings[action].some((code) => this.keysPressed.has(code));
  }

  isMouseDown(button = 0): boolean {
    return this.buttonsDown.has(button);
  }

  wasMousePressed(button = 0): boolean {
    return this.buttonsPressed.has(button);
  }

  /** Wheel delta since last call (positive = scroll down / zoom out). */
  consumeWheel(): number {
    const value = this.wheelAccum;
    this.wheelAccum = 0;
    return value;
  }

  /** Clear edge-triggered state. Call after each logic tick. */
  endTick(): void {
    this.keysPressed.clear();
    this.buttonsPressed.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Ignore typing in form fields (debug panel inputs, future chat/search).
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!e.repeat) this.keysPressed.add(e.code);
    this.keysDown.add(e.code);
    if (this.isBound(e.code)) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keysDown.clear();
    this.buttonsDown.clear();
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.buttonsDown.add(e.button);
    this.buttonsPressed.add(e.button);
    this.updateMouse(e);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.buttonsDown.delete(e.button);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.updateMouse(e);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.wheelAccum += Math.sign(e.deltaY);
  };

  private updateMouse(e: MouseEvent): void {
    const rect = this.target.getBoundingClientRect();
    this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.mouseSeen = true;
  }

  private isBound(code: string): boolean {
    for (const codes of Object.values(this.bindings)) if (codes.includes(code)) return true;
    return false;
  }
}
