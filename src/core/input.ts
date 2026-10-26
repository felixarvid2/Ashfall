/**
 * Input state: keyboard actions (via key bindings), mouse position and buttons,
 * and wheel. Systems read a snapshot every tick; "pressed" edges are consumed
 * once per tick so a tap is never missed or double-counted.
 */
import type { PadState, TouchState } from './context';
import { DEFAULT_PADBINDINGS, type Action, type PadAction } from '../data/settings';
import { GamepadInput } from './gamepad';

export class Input {
  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly buttonsDown = new Set<number>();
  private readonly buttonsPressed = new Set<number>();
  private wheelAccum = 0;
  private bindings: Record<Action, string[]>;
  /** Actions held or tapped on the touch controls. */
  private readonly virtualDown = new Set<Action>();
  private readonly virtualPressed = new Set<Action>();
  /** Two-finger pinch on the canvas: last finger distance and the distance not yet turned into zoom steps. */
  private pinch: { distance: number; carry: number } | null = null;

  /** Joystick and attack button while the touch controls are shown (null otherwise). */
  touch: TouchState | null = null;

  /** The gamepad (A01): its buttons arrive as "Pad<n>" codes looked up in `padBindings`. */
  readonly gamepad: GamepadInput;
  private padBindings: Record<PadAction, string[]> = DEFAULT_PADBINDINGS;
  private readonly padDown = new Set<string>();
  private readonly padPressed = new Set<string>();
  /** True while a menu owns the pad: its buttons do nothing in the world (set by the game). */
  padBlocked: () => boolean = () => false;

  /** Mouse in normalized device coordinates (-1..1), +y up. */
  readonly mouseNdc = { x: 0, y: 0 };
  /** True once the mouse has moved over the canvas at least once. */
  mouseSeen = false;

  constructor(
    private readonly target: HTMLElement,
    bindings: Record<Action, string[]>,
    padBindings?: Record<PadAction, string[]>,
    gamepad: GamepadInput = new GamepadInput(),
  ) {
    this.bindings = bindings;
    if (padBindings) this.padBindings = padBindings;
    this.gamepad = gamepad;
    // Registered first, so a button that closes a menu (focus navigation listens later) is already blocked here.
    gamepad.onButton((code, down) => {
      if (!down) this.padDown.delete(code);
      else if (!this.padBlocked()) {
        this.padDown.add(code);
        this.padPressed.add(code);
      }
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    // A tap on the canvas acts as a left-click there; holding a finger down keeps the button held.
    target.addEventListener('touchstart', this.onTouchStart, { passive: false });
    target.addEventListener('touchmove', this.onTouchMove, { passive: false });
    target.addEventListener('touchend', this.onTouchEnd);
    target.addEventListener('touchcancel', this.onTouchEnd);
  }

  /** Hold (or release) an action from an on-screen button. */
  holdAction(action: Action, down: boolean): void {
    if (down) {
      if (!this.virtualDown.has(action)) this.virtualPressed.add(action);
      this.virtualDown.add(action);
    } else {
      this.virtualDown.delete(action);
    }
  }

  /** Tap an action once from an on-screen button. */
  pressAction(action: Action): void {
    this.virtualPressed.add(action);
  }

  /** Hold (or release) a mouse button from an on-screen button (the touch RMB skill). */
  holdButton(button: number, down: boolean): void {
    if (down) {
      if (!this.buttonsDown.has(button)) this.buttonsPressed.add(button);
      this.buttonsDown.add(button);
    } else {
      this.buttonsDown.delete(button);
    }
  }

  setBindings(bindings: Record<Action, string[]>, padBindings?: Record<PadAction, string[]>): void {
    this.bindings = bindings;
    if (padBindings) this.padBindings = padBindings;
  }

  /** Action held this tick (keyboard, touch button or pad button). */
  isDown(action: Action): boolean {
    return this.virtualDown.has(action) || this.bindings[action].some((code) => this.keysDown.has(code)) || this.isPadDown(action);
  }

  /** Action went down since the last endTick(). */
  wasPressed(action: Action): boolean {
    return this.virtualPressed.has(action) || this.bindings[action].some((code) => this.keysPressed.has(code)) || this.wasPadPressed(action);
  }

  /** A pad button bound to the action is held. */
  isPadDown(action: Action | PadAction): boolean {
    return ((this.padBindings as Partial<Record<string, string[]>>)[action] ?? []).some((code) => this.padDown.has(code));
  }

  /** A pad button bound to the action went down since the last endTick(). */
  wasPadPressed(action: Action | PadAction): boolean {
    return ((this.padBindings as Partial<Record<string, string[]>>)[action] ?? []).some((code) => this.padPressed.has(code));
  }

  /**
   * Left stick (moves), right stick (aims) and the two basic-slot buttons, while the pad was used last and no menu
   * owns it; null otherwise, so keyboard and mouse keep working whenever they were touched last.
   */
  get pad(): PadState | null {
    const g = this.gamepad;
    if (g.lastDevice !== 'pad' || !g.hasPad || this.padBlocked()) return null;
    return {
      stick: g.left.x !== 0 || g.left.y !== 0 ? { x: g.left.x, y: g.left.y } : null,
      aim: g.right.x !== 0 || g.right.y !== 0 ? { x: g.right.x, y: g.right.y } : null,
      attack: this.isPadDown('attack'),
      alt: this.isPadDown('altAttack'),
    };
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
    this.virtualPressed.clear();
    this.padPressed.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Ignore typing in form fields (debug panel inputs, future chat/search).
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.gamepad.noteKeyboardMouse();
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
    this.virtualDown.clear();
    this.padDown.clear();
  };

  private readonly onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length >= 2) {
      // A second finger turns the gesture into a pinch: let go of the click.
      this.buttonsDown.delete(0);
      this.pinch = { distance: touchDistance(e.touches), carry: 0 };
      return;
    }
    const t = e.changedTouches[0]!;
    this.updateMouse(t);
    this.buttonsDown.add(0);
    this.buttonsPressed.add(0);
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.pinch && e.touches.length >= 2) {
      const d = touchDistance(e.touches);
      this.pinch.carry += this.pinch.distance - d;
      this.pinch.distance = d;
      // Fingers apart zoom in (negative steps), together zoom out.
      while (Math.abs(this.pinch.carry) >= 40) {
        const step = Math.sign(this.pinch.carry);
        this.wheelAccum += step;
        this.pinch.carry -= step * 40;
      }
      return;
    }
    if (!this.pinch) this.updateMouse(e.touches[0]!);
  };

  private readonly onTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length === 0) {
      this.buttonsDown.delete(0);
      this.pinch = null;
    }
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.gamepad.noteKeyboardMouse();
    this.buttonsDown.add(e.button);
    this.buttonsPressed.add(e.button);
    this.updateMouse(e);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.buttonsDown.delete(e.button);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    // A mouse that only reports the same spot (or a touch device's synthetic move) is not the player's hand.
    if (e.movementX !== 0 || e.movementY !== 0) this.gamepad.noteKeyboardMouse();
    this.updateMouse(e);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.wheelAccum += Math.sign(e.deltaY);
  };

  private updateMouse(e: { clientX: number; clientY: number }): void {
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

function touchDistance(touches: TouchList): number {
  const a = touches[0]!;
  const b = touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
