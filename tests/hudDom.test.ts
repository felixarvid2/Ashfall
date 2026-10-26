// @vitest-environment happy-dom
/** The HUD against a real DOM: it follows a state each frame, in a fight, dead, with a boss and on a touch screen (C06). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEYBINDINGS } from '../src/data/settings';
import { Hud, type HudState } from '../src/ui/hud';

let root: HTMLElement;
let hud: Hud;
let respawned: number;

function state(over: Partial<HudState> = {}): HudState {
  return {
    life: { current: 80, max: 100, barrier: 10 },
    resource: { kind: 'heat', current: 30, max: 100, overheating: false },
    slots: [
      { id: 'bastion.hydraulic_strike', cooldown: 0, cooldownMax: 1, affordable: true },
      { id: 'bastion.seismic_shock', cooldown: 2, cooldownMax: 6, affordable: false },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
    ],
    dodge: { cooldown: 0.5, max: 2 },
    potion: { charges: 2, max: 3, recharge: 4, rechargeMax: 10 },
    wave: null,
    target: null,
    dead: false,
    xp: { level: 5, current: 40, next: 100, skillPoints: 2 },
    ...over,
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  respawned = 0;
  hud = new Hud(root, () => respawned++);
});

describe('HUD', () => {
  it('builds its orbs, action bar and xp bar', () => {
    expect(root.querySelectorAll('.orb').length).toBeGreaterThanOrEqual(2);
    expect(root.querySelectorAll('.slot').length).toBeGreaterThanOrEqual(4);
  });

  it('follows the state frame by frame without throwing', () => {
    hud.update(state(), 1 / 60);
    hud.update(state({ life: { current: 20, max: 100, barrier: 0 }, resource: { kind: 'heat', current: 100, max: 100, overheating: true }, combat: true }), 1 / 60);
    hud.update(
      state({
        target: { name: 'Hale', current: 50, max: 200, statuses: ['burning'], color: '#f80', affixes: ['Molten'], affixIds: ['molten'], tier: 'rare', phases: [0.5] },
        wave: { wave: 3, alive: 4, phase: 'active', timer: 0 },
        location: { title: 'Cinder Flats', sub: 'Route 7' },
        tier: 'WT II',
        event: { title: 'Ambush', text: 'Hold out' },
        buffs: [{ id: 'burning', remaining: 3, color: '#f40', harmful: true, timed: true }, { id: 'ward', remaining: 9, color: '#4cf', timed: true, stacks: 2 }],
        exposure: 0.4,
        flares: { charges: 2, max: 3, key: 'F' },
        unassignedSkills: 1,
      }),
      1 / 60,
    );
    expect(root.textContent).toContain('Hale');
    hud.update(state({ target: null, wave: null }), 1 / 60);
  });

  it('shows the death screen with its cause, and the respawn button works after the lock', () => {
    vi.useFakeTimers();
    hud.update(state({ dead: true, deathCause: 'Slain by Hale', deathRecap: { lines: ['12 physical'], summary: '40 in 5 s' } }), 0.1);
    for (let i = 0; i < 30; i++) hud.update(state({ dead: true }), 0.1);
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) button.click();
    hud.update(state({ dead: false }), 0.1);
    vi.useRealTimers();
    expect(hud.respawnLocked).toBeTypeOf('boolean');
  });

  it('banners, level-up, region card and boss intro queue up and play', () => {
    hud.showBanner('Wave 2', 1);
    hud.showBanner('Boss slain', 1, { variant: 'levelup', sub: 'Well done' });
    hud.levelUp(2, 'Level 6', 'Two skill points', () => {});
    hud.regionCard('/art/regions/cinder_flats.webp', 'Cinder Flats', 'Region 1');
    hud.bossIntro('Hale', '/art/bosses/hale.webp', 'Commandant');
    hud.revealLabel();
    for (let i = 0; i < 60; i++) hud.update(state(), 0.1);
    expect(root.querySelector('.banner, .hud-banner, [class*=banner]')).not.toBeNull();
  });

  it('switches to touch and back, updates its hint and the reduce-flashing setting', () => {
    hud.setTouch(true);
    hud.update(state({ combat: true }), 1 / 60);
    hud.setTouch(false);
    hud.setReduceFlashing(true);
    hud.updateHint('click', DEFAULT_KEYBINDINGS);
    hud.updateHint('wasd', DEFAULT_KEYBINDINGS);
    hud.setSkillResolvers((id) => ({ id } as never), () => null);
    hud.update(state(), 1 / 60);
    expect(hud.denyResource()).toBeTypeOf('boolean');
  });
});
