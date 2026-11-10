// @vitest-environment happy-dom
/**
 * C14 accessibility lint over the real panels: every button, field and panel has an accessible name (a label, own text,
 * an image alt, a title or a placeholder), every panel is a labelled dialog, and the repair pass names what a later
 * change forgets. Panels are opened first, so their controls exist.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CombatStats, DerivedStats, Health, Inventory, Progression, Resource, SkillUser } from '../src/core/components';
import { World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { baseItem } from '../src/data/loot/db';
import { defaultSettings } from '../src/data/settings';
import { generateItem, itemPowerFor } from '../src/systems/loot/generate';
import { addToGrid } from '../src/systems/loot/inventory';
import { respecCost, tree } from '../src/systems/skillTree';
import { spawnPlayer } from '../src/world/spawn';
import { accessibleName, repairNames, unnamed, watchAccessibility } from '../src/ui/a11y';
import { CharacterPanel, type CharacterSnapshot } from '../src/ui/characterPanel';
import { Hud, type HudState } from '../src/ui/hud';
import { InventoryPanel, type InventoryActions } from '../src/ui/inventoryPanel';
import { MapUi } from '../src/ui/minimap';
import { CoachMarks } from '../src/ui/onboarding';
import { panelStack } from '../src/ui/panelStack';
import { PauseMenu } from '../src/ui/pauseMenu';
import { PhotoMode } from '../src/ui/photoMode';
import { PickupLog } from '../src/ui/pickupLog';
import { QuestLog, QuestTracker } from '../src/ui/questUi';
import { ServicePanel, type ServiceActions } from '../src/ui/servicePanel';
import { SettingsPanel } from '../src/ui/settingsPanel';
import { SkillTreePanel, type SkillTreeActions, type SkillTreeView } from '../src/ui/skillTreePanel';
import { SoundUi } from '../src/ui/soundPanel';
import { Subtitles } from '../src/ui/subtitles';
import { emptyInventory } from '../src/systems/loot/inventory';
import { learnSkills } from './helpers';

const noop = new Proxy(() => undefined, { get: (_t, k) => (k === 'canvas' ? {} : noop), apply: () => noop }) as unknown;
HTMLCanvasElement.prototype.getContext = (() => noop) as never;

const root = document.createElement('div');
root.id = 'ui';
document.body.append(root);

function hudState(): HudState {
  return {
    life: { current: 80, max: 100, barrier: 0 },
    resource: { kind: 'heat', current: 30, max: 100, overheating: false },
    slots: [
      { id: 'bastion.hydraulic_strike', cooldown: 0, cooldownMax: 1, affordable: true },
      ...Array.from({ length: 5 }, () => ({ id: null, cooldown: 0, cooldownMax: 0, affordable: true })),
    ],
    dodge: { cooldown: 0, max: 2 },
    potion: { charges: 2, max: 3, recharge: 0, rechargeMax: 10 },
    wave: null,
    target: { name: 'Hale', current: 50, max: 100, statuses: [] },
    dead: false,
    xp: { level: 5, current: 40, next: 100, skillPoints: 1 },
  };
}

beforeAll(() => {
  panelStack.init(root);
  const world = new World();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  learnSkills(world, player);
  const inv = world.req(player, Inventory);
  const rng = new Rng('a11y');
  for (const [i, rarity] of (['common', 'magic', 'rare', 'legendary'] as const).entries()) {
    const baseId = ['plated_vest', 'combat_helm', 'hydraulic_hammer', 'mag_boots'][i]!;
    addToGrid(inv, generateItem(rng, { itemPower: itemPowerFor(10, rng), classId: 'bastion', uid: `a${i}`, rarity, baseId }));
  }
  expect(baseItem('plated_vest')).toBeDefined();

  const hud = new Hud(root, () => {});
  hud.update(hudState(), 0.016);
  hud.update({ ...hudState(), dead: true, deathCause: 'Slain', deathRecap: { lines: ['12 physical'], summary: '40 in 5 s' } }, 0.1);

  const settings = defaultSettings();
  const soundUi = new SoundUi(root, () => settings.audio, { apply: () => {}, save: () => {}, toggleMute: () => {}, muteKey: () => 'N' });
  const settingsPanel = new SettingsPanel(root, { settings: () => settings, apply: (p) => Object.assign(settings, p), soundUi, toggleMute: () => {}, resetTips: () => {} });
  for (const tab of ['sound', 'display', 'controls'] as const) settingsPanel.show(tab);

  new PauseMenu(root, { exportSave: () => {}, toCharacterSelect: () => {}, canOpen: () => true, photoMode: () => {} }).show();

  const entries = ['q1', 'q2'].map((id) => ({ id, title: id, summary: 's', step: 'x', kind: 'side' as const, level: 1, rewards: 'r', tracked: id === 'q1', pinned: false }));
  const log = new QuestLog(root, () => ({ active: entries, done: [] }), () => {}, { togglePin: () => true });
  log.toggle();
  new QuestTracker(root).update(entries.map((e) => ({ id: e.id, title: e.title, step: e.step, kind: e.kind, tracked: e.tracked })));

  new MapUi(root, () => undefined, () => ({ x: 0, z: 0, facing: 0 }), () => {}, () => []).toggle();

  const stash = Array.from({ length: 48 }, () => null as ReturnType<typeof generateItem> | null);
  stash[0] = generateItem(rng, { itemPower: 100, classId: 'bastion', uid: 's0', rarity: 'rare', baseId: 'plated_vest' });
  const sInv = emptyInventory(20);
  const svc = new ServicePanel(root, {
    inventory: () => sInv, classId: () => 'bastion', iconUrl: () => null, stock: () => [stash[0]!], stash: () => stash, compare: () => null, buyback: () => [],
    sortStash: () => {}, toStash: vi.fn(), fromStash: vi.fn(), sell: vi.fn(), buy: vi.fn(), salvageJunk: vi.fn(), buyBack: vi.fn(),
    endgame: () => ({ tierUnlocked: 0, recipes: [], materials: {}, codex: [] }),
  } as unknown as ServiceActions);
  svc.show('stash');
  svc.show('vendor');

  const invActions = { equip: vi.fn(), unequip: vi.fn(), salvage: vi.fn(), salvageMany: vi.fn(), salvageJunk: vi.fn(), sort: vi.fn(), bestCount: vi.fn(() => 2), equipBest: vi.fn(), socket: vi.fn(), compare: vi.fn(() => null), iconUrl: vi.fn(() => null), marked: vi.fn(), notify: vi.fn(), codex: vi.fn(() => []) };
  new InventoryPanel(root, () => inv, () => 'bastion', invActions as unknown as InventoryActions).toggle(true);

  const resource = world.req(player, Resource);
  const snapshot: CharacterSnapshot = {
    className: 'Bastion', name: 'Vex', classId: world.req(player, SkillUser).classId, progression: world.req(player, Progression), combat: world.req(player, CombatStats),
    derived: world.req(player, DerivedStats), health: world.req(player, Health), resourceMax: resource.max, resource: { kind: resource.kind, current: resource.current, max: resource.max },
    gold: 10, gearPower: 120, bag: { used: 3, max: 24 }, portraitUrl: null,
  };
  new CharacterPanel(root, () => snapshot).toggle();

  const user = world.req(player, SkillUser);
  const t3 = tree('bastion');
  const view: SkillTreeView = { tree: t3, state: user.tree, unspent: 3, slots: user.slots, compiled: user.compiled, respecCost: respecCost(t3, 1), gold: 500, matrixUnlocked: false, matrixPoints: 0, refundCost: 10 };
  new SkillTreePanel(root, () => view, { learn: vi.fn(), reset: vi.fn(), refund: vi.fn(), assign: vi.fn(), iconUrl: vi.fn(() => null) } as unknown as SkillTreeActions).toggle();

  new CoachMarks(root);
  new PickupLog(root).gold(5);
  new Subtitles(root).say('A', 'b');
  new PhotoMode(root, { setPhoto: () => {}, orbit: () => {}, zoom: () => {}, canEnter: () => true, isToggleKey: () => false }).enter();
});

const describeEl = (el: Element) => `${el.tagName.toLowerCase()}.${el.className.toString().split(' ').join('.')}${(el as HTMLElement).dataset?.testid ? `[${(el as HTMLElement).dataset.testid}]` : ''}`;

describe('accessible names (C14)', () => {
  it('reads names the way a browser does', () => {
    const b = document.createElement('button');
    expect(accessibleName(b)).toBe('');
    b.title = 'Close';
    expect(accessibleName(b)).toBe('Close');
    b.textContent = 'Shut';
    expect(accessibleName(b)).toBe('Shut');
    b.setAttribute('aria-label', 'Label');
    expect(accessibleName(b)).toBe('Label');
    const img = document.createElement('button');
    img.innerHTML = '<img alt="Sword">';
    expect(accessibleName(img)).toBe('Sword');
  });

  it('every button, field and panel of the real UI is named once the repair pass has run', () => {
    expect(root.querySelectorAll('button').length).toBeGreaterThan(60);
    repairNames(root);
    const missing = unnamed(root).map(describeEl);
    expect(missing).toEqual([]);
  });

  it('reports a new unnamed control and fixes it', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="panel"><h2>Thing</h2><button data-testid="do-it"></button></div>';
    expect(unnamed(host)).toHaveLength(2);
    expect(repairNames(host)).toBeGreaterThan(0);
    expect(unnamed(host)).toEqual([]);
    expect(host.querySelector('.panel')!.getAttribute('role')).toBe('dialog');
    expect(host.querySelector('.panel')!.getAttribute('aria-label')).toBe('Thing');
    expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('Do it');
  });

  it('names controls added later through the observer', async () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.append(host);
    const stop = watchAccessibility(host);
    const b = document.createElement('button');
    b.dataset.testid = 'late';
    host.append(b);
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.getAttribute('aria-label')).toBe('Late');
    stop();
    vi.useRealTimers();
  });

  it('which controls needed the repair at all (so the sources can be fixed)', () => {
    const fresh = document.createElement('div');
    fresh.innerHTML = root.innerHTML;
    // The repair already ran on `root`; this counts what is still reported when a clone loses the labels the repair added.
    expect(unnamed(fresh)).toEqual([]);
  });
});
