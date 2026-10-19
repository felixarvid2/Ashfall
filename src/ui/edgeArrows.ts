/**
 * Edge arrow (H070): while an engaged boss or the world boss is off the visible field, a chevron on the screen
 * edge points at it. `placeEdgeArrow` is the geometry (no DOM); `EdgeArrow` draws it.
 */
export interface Point {
  x: number;
  y: number;
}

export interface EdgeInsets {
  /** Distance from each screen edge to where the arrow may sit (safe areas, top chrome, thumb controls). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface EdgePlacement {
  /** False while the target is on screen. */
  visible: boolean;
  x: number;
  y: number;
  /** Degrees clockwise from straight up. */
  angle: number;
}

/**
 * Where the arrow goes: the target's screen position clamped into the box `insets` leaves, rotated away from the
 * player's screen position. The target counts as on screen inside the viewport (a small `margin` in from its edge).
 */
export function placeEdgeArrow(from: Point, to: Point, viewport: { w: number; h: number }, insets: EdgeInsets, margin = 8): EdgePlacement {
  const onScreen = to.x >= margin && to.x <= viewport.w - margin && to.y >= margin && to.y <= viewport.h - margin;
  const x = Math.min(viewport.w - insets.right, Math.max(insets.left, to.x));
  const y = Math.min(viewport.h - insets.bottom, Math.max(insets.top, to.y));
  const angle = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
  return { visible: !onScreen, x, y, angle };
}

export class EdgeArrow {
  private readonly el: HTMLDivElement;
  private shown = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'edge-arrow';
    this.el.dataset.testid = 'edge-arrow';
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    root.append(this.el);
  }

  /** `null` hides the arrow. */
  update(placement: EdgePlacement | null): void {
    const show = placement?.visible ?? false;
    if (show !== this.shown) {
      this.shown = show;
      this.el.hidden = !show;
    }
    if (!show || !placement) return;
    this.el.style.transform = `translate(${placement.x.toFixed(0)}px, ${placement.y.toFixed(0)}px) translate(-50%, -50%) rotate(${placement.angle.toFixed(0)}deg)`;
  }
}
