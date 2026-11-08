// @vitest-environment happy-dom
/** C06 photo mode: the camera's orbit and zoom range, and the mode's input, HUD class and exit paths. */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraRig, PHOTO_PITCH, PHOTO_ZOOM } from '../src/render/camera';
import { DEFAULT_KEYBINDINGS, ACTIONS } from '../src/data/settings';
import { KEY_GROUPS } from '../src/ui/settingsPanel';
import { PhotoMode } from '../src/ui/photoMode';
import { panelStack } from '../src/ui/panelStack';
import { registerGamePanels } from '../src/ui/panelRegistry';

describe('camera photo mode', () => {
  it('orbits only in photo mode and puts the camera back on exit', () => {
    const rig = new CameraRig(16 / 9);
    const base = rig.viewAngles;
    rig.orbit(1, 0.2);
    expect(rig.viewAngles).toEqual(base);
    rig.setPhoto(true);
    rig.orbit(1, 0.2);
    expect(rig.viewAngles.yaw).toBeCloseTo(base.yaw + 1);
    expect(rig.viewAngles.pitch).toBeCloseTo(base.pitch + 0.2);
    rig.setPhoto(false);
    expect(rig.viewAngles).toEqual(base);
  });

  it('keeps the tilt between the ground and straight down', () => {
    const rig = new CameraRig(16 / 9);
    rig.setPhoto(true);
    rig.orbit(0, 10);
    expect(rig.viewAngles.pitch).toBeCloseTo(PHOTO_PITCH.max);
    rig.orbit(0, -20);
    expect(rig.viewAngles.pitch).toBeCloseTo(PHOTO_PITCH.min);
  });

  it('moves the camera around the hero and zooms past the normal range, then clamps back', () => {
    const rig = new CameraRig(16 / 9);
    rig.snapTo(0, 0, 0);
    const before = rig.camera.position.clone();
    rig.setPhoto(true);
    rig.orbit(Math.PI, 0);
    rig.update(0, 0, 0, 0.5);
    expect(rig.camera.position.x).toBeLessThan(before.x - 1);
    for (let i = 0; i < 40; i++) rig.zoom(5);
    for (let i = 0; i < 60; i++) rig.update(0, 0, 0, 0.1);
    const far = rig.effectiveDistance;
    rig.setPhoto(false);
    for (let i = 0; i < 60; i++) rig.update(0, 0, 0, 0.1);
    expect(rig.effectiveDistance).toBeLessThan(far);
    expect(PHOTO_ZOOM.far).toBeGreaterThan(1);
  });
});

describe('photo mode action', () => {
  it('has a default key, a settings row and no clash with another action', () => {
    expect(ACTIONS).toContain('photoMode');
    const key = DEFAULT_KEYBINDINGS.photoMode[0]!;
    expect(ACTIONS.filter((a) => DEFAULT_KEYBINDINGS[a].includes(key))).toEqual(['photoMode']);
    expect(KEY_GROUPS.flatMap((g) => g.actions)).toContain('photoMode');
  });
});

describe('PhotoMode', () => {
  let root: HTMLElement;
  let calls: string[];
  let photo: PhotoMode;
  let canEnter: boolean;
  const key = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, cancelable: true, bubbles: true }));

  beforeAll(() => {
    document.body.replaceChildren();
    const r = document.createElement('div');
    r.id = 'ui';
    document.body.append(r);
    panelStack.init(r);
  });

  beforeEach(() => {
    root = document.querySelector<HTMLElement>('#ui')!;
    root.classList.remove('photo-mode');
    root.querySelectorAll('.photo-hint, canvas').forEach((e) => e.remove());
    calls = [];
    canEnter = true;
    photo = new PhotoMode(root, {
      setPhoto: (on) => calls.push(`photo:${on}`),
      orbit: (y, p) => calls.push(`orbit:${y.toFixed(2)},${p.toFixed(2)}`),
      zoom: (s) => calls.push(`zoom:${s}`),
      onExit: () => calls.push('exit'),
      canEnter: () => canEnter,
      isToggleKey: (e) => e.code === 'F8',
    });
  });

  it('hides the HUD with a class, shows the hint with an Exit button, and Exit restores everything', () => {
    expect(photo.enter()).toBe(true);
    expect(root.classList.contains('photo-mode')).toBe(true);
    const hint = root.querySelector<HTMLElement>('[data-testid=photo-hint]')!;
    expect(hint.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-testid=photo-exit]')!.click();
    expect(photo.active).toBe(false);
    expect(root.classList.contains('photo-mode')).toBe(false);
    expect(hint.hidden).toBe(true);
    expect(calls).toEqual(['photo:true', 'photo:false', 'exit']);
  });

  it('does not start when the game says no', () => {
    canEnter = false;
    expect(photo.enter()).toBe(false);
    expect(root.classList.contains('photo-mode')).toBe(false);
  });

  it('Escape and the photo key leave, the arrows orbit and +/- zoom', () => {
    photo.enter();
    key('ArrowLeft');
    key('ArrowUp');
    key('Equal');
    expect(calls).toContain('orbit:-0.06,0.00');
    expect(calls).toContain('orbit:0.00,0.06');
    expect(calls).toContain('zoom:-0.5');
    key('Escape');
    expect(photo.active).toBe(false);
    photo.enter();
    key('F8');
    expect(photo.active).toBe(false);
  });

  it('dragging the canvas orbits, a second finger pinches to zoom, and drags elsewhere are ignored', () => {
    photo.enter();
    const canvas = document.createElement('canvas');
    root.append(canvas);
    const ev = (type: string, id: number, x: number, y: number, target: EventTarget = canvas) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      target.dispatchEvent(e);
    };
    ev('pointerdown', 1, 100, 100);
    ev('pointermove', 1, 150, 120);
    expect(calls.some((c) => c.startsWith('orbit:-0.30,0.10'))).toBe(true);
    calls.length = 0;
    ev('pointerup', 1, 150, 120);
    ev('pointerdown', 2, 10, 10, root);
    ev('pointermove', 2, 20, 20, root);
    expect(calls).toEqual([]);
    ev('pointerdown', 3, 100, 100);
    ev('pointerdown', 4, 200, 100);
    ev('pointermove', 4, 300, 100);
    expect(calls.some((c) => c.startsWith('zoom:-'))).toBe(true);
  });

  it('pad input orbits with the stick and zooms with the triggers only while active', () => {
    photo.update(0.5, { x: 1, y: 0 }, 1);
    expect(calls).toEqual([]);
    photo.enter();
    calls.length = 0;
    photo.update(0.5, { x: 1, y: 0 }, 1);
    expect(calls.some((c) => c.startsWith('orbit:0.70'))).toBe(true);
    expect(calls.some((c) => c.startsWith('zoom:1.25'))).toBe(true);
  });

  it('Escape through the panel registry (also the pad B) ends photo mode first', () => {
    const stubPanel = { open: false, toggle: () => {}, close: () => {}, show: () => {}, element: Object.assign(document.createElement('div'), { hidden: true }), canOpen: () => true };
    const lazy = { whenLoaded: () => {}, ensure: () => Promise.resolve(stubPanel as never) };
    for (const c of ['inventory-panel', 'character-panel', 'tree-panel', 'map-panel', 'quest-log', 'tier-panel', 'rift-panel', 'lore-panel', 'dialogue-panel']) {
      root.append(Object.assign(document.createElement('div'), { className: c, hidden: true }));
    }
    registerGamePanels(root, { pause: stubPanel, inventory: stubPanel, character: lazy, skills: lazy, map: stubPanel, quests: stubPanel, settings: lazy as never, tier: stubPanel, rift: stubPanel, lore: stubPanel, closeDialogue: () => {}, photo });
    photo.enter();
    const handled = panelStack.escape();
    expect(photo.active).toBe(false);
    expect(handled).toBe(true);
  });
});

void vi;
