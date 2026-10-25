// @vitest-environment happy-dom
/** The character panel against a real DOM, fed by a real player entity (C06). */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CombatStats, DerivedStats, Health, Inventory, Progression, Resource, SkillUser } from '../src/core/components';
import { World } from '../src/core/ecs';
import { spawnPlayer } from '../src/world/spawn';
import { panelStack } from '../src/ui/panelStack';
import { CharacterPanel, type CharacterSnapshot } from '../src/ui/characterPanel';

let root: HTMLElement;
let snapshot: CharacterSnapshot;
let panel: CharacterPanel;

const stackRoot = document.createElement('div');
stackRoot.id = 'ui';
document.body.append(stackRoot);

beforeAll(() => panelStack.init(stackRoot));

beforeEach(() => {
  stackRoot.replaceChildren();
  root = stackRoot;
  const world = new World();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const resource = world.req(player, Resource);
  snapshot = {
    className: 'Bastion',
    name: 'Vex',
    classId: world.req(player, SkillUser).classId,
    progression: world.req(player, Progression),
    combat: world.req(player, CombatStats),
    derived: world.req(player, DerivedStats),
    health: world.req(player, Health),
    resourceMax: resource.max,
    resource: { kind: resource.kind, current: resource.current, max: resource.max },
    gold: world.req(player, Inventory).gold,
    gearPower: 120,
    bag: { used: 3, max: 24 },
    portraitUrl: null,
  };
  panel = new CharacterPanel(root, () => snapshot);
});

describe('character panel', () => {
  it('stays empty until opened, then shows the card and the four sections', () => {
    expect(panel.open).toBe(false);
    panel.refresh();
    panel.toggle();
    expect(panel.open).toBe(true);
    expect(root.querySelector('.char-card-name')?.textContent).toBe('Vex');
    expect(root.querySelectorAll('.char-section').length).toBeGreaterThanOrEqual(4);
    expect(root.querySelectorAll('.char-rows > *').length).toBeGreaterThan(10);
  });

  it('follows the numbers: a level-up and new gold show on the next refresh', () => {
    panel.toggle();
    snapshot = { ...snapshot, gold: 98765, progression: { ...snapshot.progression, level: 7 } };
    panel.refresh();
    expect(root.querySelector('.char-card-gold')?.textContent).toContain('98');
    expect(root.querySelector('.char-card')?.textContent).toContain('7');
  });

  it('sections collapse and expand, and stat rows open an explanation without throwing', () => {
    panel.toggle();
    const head = root.querySelector<HTMLButtonElement>('.char-section-head')!;
    const expanded = head.getAttribute('aria-expanded');
    head.click();
    expect(head.getAttribute('aria-expanded')).not.toBe(expanded);
    head.click();
    for (const row of root.querySelectorAll<HTMLElement>('.char-row')) row.click();
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) button.click();
  });

  it('shows the feats list when the snapshot has feats, and wears a title', () => {
    const worn: (string | null)[] = [];
    root.replaceChildren();
    snapshot = {
      ...snapshot,
      feats: [
        { id: 'f1', name: 'First blood', description: 'Kill 1', icon: null, value: 1, goal: 1, done: true, title: 'the Bold', worn: false },
        { id: 'f2', name: 'Slayer', description: 'Kill 100', icon: null, value: 10, goal: 100, done: false, title: null, worn: false },
      ],
    };
    const p = new CharacterPanel(root, () => snapshot, { wearTitle: (id) => worn.push(id) });
    p.toggle();
    expect(root.textContent).toContain('First blood');
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) button.click();
    expect(root.textContent).toContain('Slayer');
  });
});
