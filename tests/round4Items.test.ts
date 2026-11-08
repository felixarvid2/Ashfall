// @vitest-environment happy-dom
/** C16 set bonus tooltips (set rules and the tooltip block) and C13 the pickup log. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { registerLanguage, t } from '../src/data/i18n';
import { ITEM_SETS, setOfItem, setProgress, type ItemSetDef } from '../src/data/loot/sets';
import type { Item } from '../src/data/loot/schemas';
import { generateItem } from '../src/systems/loot/generate';
import { renderItemTooltip } from '../src/ui/itemTooltip';
import { LOG_FADE, LOG_LIFE, LOG_MAX, PickupLog } from '../src/ui/pickupLog';

const rng = new Rng('r4-items');
const uniq = (id: string, n: number): Item => ({ ...generateItem(rng, { itemPower: 100, classId: 'bastion', uid: `u${n}`, rarity: 'rare' }), unique: id, rarity: 'unique' });

const SET: ItemSetDef = {
  id: 'testset',
  pieces: ['spore_mantle', 'thornwoven_band', 'memory_lens'],
  bonuses: [
    { pieces: 2, text: 'testset.b2' },
    { pieces: 3, text: 'testset.b3' },
  ],
};

describe('set rules (C16)', () => {
  it('the game has a set table, sets use unique ids and thresholds fit their size', () => {
    for (const s of ITEM_SETS) {
      expect(s.pieces.length).toBeGreaterThan(1);
      for (const b of s.bonuses) expect(b.pieces).toBeLessThanOrEqual(s.pieces.length);
    }
  });

  it('finds a piece\'s set and counts each worn piece once', () => {
    expect(setOfItem(uniq('spore_mantle', 1), [SET])).toBe(SET);
    expect(setOfItem(uniq('prospectors_lamp', 2), [SET])).toBeUndefined();
    const p = setProgress(SET, [uniq('spore_mantle', 3), uniq('spore_mantle', 4), uniq('memory_lens', 5)]);
    expect(p.wornCount).toBe(2);
    expect(p.bonuses.map((b) => b.active)).toEqual([true, false]);
    expect(p.pieces.map((x) => x.worn)).toEqual([true, false, true]);
  });
});

describe('set tooltip block (C16)', () => {
  registerLanguage('en', {
    sets: { testset: { name: 'Test Set' } },
    testset: { b2: 'Two piece bonus', b3: 'Three piece bonus' },
  } as never);

  it('lists the pieces worn, the thresholds and which are active', () => {
    const mantle = uniq('spore_mantle', 10);
    const tip = renderItemTooltip(mantle, 'bastion', { worn: [uniq('memory_lens', 11)], sets: [SET] });
    const block = tip.querySelector('[data-testid=item-tip-set]')!;
    expect(block).toBeTruthy();
    expect(block.querySelector('.item-tip-set-title')!.textContent).toContain('1/3');
    expect(block.querySelectorAll('.set-piece')).toHaveLength(3);
    expect(block.querySelectorAll('.set-piece.worn')).toHaveLength(1);
    expect(block.querySelector('.set-piece.current')!.textContent).toContain(t('uniques.spore_mantle.name'));
    const bonuses = [...block.querySelectorAll('.set-bonus')];
    expect(bonuses).toHaveLength(2);
    expect(bonuses.some((b) => b.classList.contains('active'))).toBe(false);
    const worn = renderItemTooltip(mantle, 'bastion', { worn: [mantle, uniq('memory_lens', 12)], sets: [SET] });
    expect(worn.querySelectorAll('.set-bonus.active')).toHaveLength(1);
  });

  it('shows nothing for an item that is in no set', () => {
    const tip = renderItemTooltip(uniq('prospectors_lamp', 13), 'bastion', { worn: [], sets: [SET] });
    expect(tip.querySelector('[data-testid=item-tip-set]')).toBeNull();
  });
});

describe('pickup log (C13)', () => {
  const make = () => {
    const root = document.createElement('div');
    return { root, log: new PickupLog(root) };
  };

  it('is a labelled live region at the bottom left', () => {
    const { log } = make();
    expect(log.element.getAttribute('role')).toBe('log');
    expect(log.element.getAttribute('aria-live')).toBe('polite');
    expect(log.element.getAttribute('aria-label')).toBeTruthy();
  });

  it('adds up gold into one line and counts repeated items', () => {
    const { log } = make();
    log.gold(10);
    log.gold(15);
    expect(log.count).toBe(1);
    expect(log.element.textContent).toBe('+25 gold');
    log.item('Combat Helm', 'rare');
    log.item('Combat Helm', 'rare');
    expect(log.count).toBe(2);
    expect(log.element.textContent).toContain('Combat Helm x2');
    expect(log.element.querySelector<HTMLElement>('[data-rarity=rare]')).toBeTruthy();
  });

  it('keeps at most five lines and fades them out over time', () => {
    const { log } = make();
    for (let i = 0; i < 8; i++) log.item(`Item ${i}`, 'magic');
    expect(log.count).toBe(LOG_MAX);
    expect(log.element.textContent).not.toContain('Item 0');
    log.update(LOG_LIFE + LOG_FADE / 2);
    expect(Number(log.element.querySelector<HTMLElement>('.pickup-line')!.style.opacity)).toBeLessThan(1);
    log.update(LOG_FADE);
    expect(log.count).toBe(0);
  });
});
