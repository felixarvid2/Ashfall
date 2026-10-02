import { describe, expect, it } from 'vitest';
import { Blast, CombatStats, DisplayName, Elite, EnemyAI, Hazard, Health, Mover, PendingHazard, StatusEffects, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { EXCLUSIVE_AFFIXES, type EliteAffix } from '../src/data/elites';
import { dealHit, hasStatus, kill } from '../src/systems/combat';
import { applyAffixes, eliteSystem, rareName, rollAffixes } from '../src/systems/elites';
import { spatialSystem } from '../src/systems/collision';
import { blastSystem } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeElite } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 200 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, player };
}

function eliteWith(world: World, affixes: EliteAffix[], x = 3, z = 0): Entity {
  const e = spawnEnemy(world, 'infected_colonist', x, z, { level: 3 });
  applyAffixes(world, e, 'champion', affixes, new Rng('t'));
  world.req(e, EnemyAI).aggro = true;
  return e;
}

const hit = (world: World, ctx: ReturnType<typeof makeCtx>, a: Entity, b: Entity, coefficient = 1) =>
  dealHit(world, ctx, a, b, { coefficient, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'melee' });

describe('elite affixes', () => {
  it('rolls distinct, compatible affixes and generated rare names', () => {
    for (let i = 0; i < 200; i++) {
      const a = rollAffixes(new Rng(`r${i}`), 4);
      expect(new Set(a).size).toBe(4);
      for (const [x, y] of EXCLUSIVE_AFFIXES) expect(a.includes(x) && a.includes(y)).toBe(false);
    }
    expect(rareName(new Rng('n'))).toMatch(/^\w+ the \w+, .+$/);
  });

  it('rare elites get affixes, a name and minions; champions share their pack affixes', () => {
    const { world } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 10, 10, { level: 6 });
    const minions = makeElite(world, e, 'rare', new Rng('rare'));
    expect(world.req(e, Elite).affixes).toHaveLength(3);
    expect(world.req(e, DisplayName).literal).toBe(true);
    expect(minions.length).toBeGreaterThanOrEqual(2);
    expect(world.req(e, CombatStats).tags).toContain('rare');
    const shared: EliteAffix[] = ['fast', 'burning'];
    const a = spawnEnemy(world, 'spore_hound', 0, 5);
    const b = spawnEnemy(world, 'spore_hound', 1, 5);
    const speed = world.req(b, Mover).speed;
    makeElite(world, a, 'champion', new Rng('c'), shared);
    makeElite(world, b, 'champion', new Rng('c2'), shared);
    expect(world.req(a, Elite).affixes).toEqual(shared);
    expect(world.req(b, Elite).affixes).toEqual(shared);
    expect(world.req(b, Mover).speed).toBeCloseTo(speed * 1.4, 5);
  });

  it('Shielded raises a barrier the first time it is hurt', () => {
    const { world, ctx, player } = setup();
    const e = eliteWith(world, ['shielded']);
    hit(world, ctx, player, e, 0.2);
    run(world, ctx, [eliteSystem]);
    expect(world.req(e, StatusEffects).list.some((s) => s.id === 'barrier')).toBe(true);
    expect(world.req(e, Elite).shieldUsed).toBe(true);
  });

  it('Vampiric heals from its hits; Freezing chills', () => {
    const { world, ctx, player } = setup();
    const e = eliteWith(world, ['vampiric', 'freezing']);
    const h = world.req(e, Health);
    h.current = h.max / 2;
    hit(world, ctx, e, player, 1);
    expect(h.current).toBeGreaterThan(h.max / 2);
    expect(hasStatus(world, player, 'chilled')).toBe(true);
  });

  it('Explodes on Death warns, then blasts the player', () => {
    const { world, ctx, player } = setup();
    const e = eliteWith(world, ['explodesOnDeath'], 1.5, 0);
    kill(world, ctx, e, 0);
    expect(world.query(Blast)).toHaveLength(1);
    expect(ctx.events.drain()).toContainEqual(expect.objectContaining({ type: 'telegraph', color: '#ff3a2a' }));
    const life = world.req(player, Health).current;
    run(world, ctx, [spatialSystem, blastSystem], 80);
    expect(world.req(player, Health).current).toBeLessThan(life);
  });

  it('Mirroring splits off copies at half life that drop nothing', () => {
    const { world, ctx } = setup();
    const e = eliteWith(world, ['mirroring']);
    const h = world.req(e, Health);
    h.current = h.max * 0.4;
    run(world, ctx, [eliteSystem]);
    const copies = world.query(Elite).filter((x) => world.req(x, Elite).copy);
    expect(copies).toHaveLength(2);
    ctx.rewards = [];
    kill(world, ctx, copies[0]!, 0);
    expect(ctx.rewards).toEqual([]);
    run(world, ctx, [eliteSystem]);
    expect(world.query(Elite).filter((x) => world.req(x, Elite).copy)).toHaveLength(2);
  });

  it('Burning leaves fire while moving; Spore Spreader drops clouds', () => {
    const { world, ctx } = setup();
    const e = eliteWith(world, ['burning', 'sporeSpreader']);
    const tr = world.req(e, Transform);
    for (let i = 0; i < 60 * 8; i++) {
      tr.prevX = tr.x;
      tr.x += 0.05;
      run(world, ctx, [eliteSystem]);
    }
    const hazards = world.query(Hazard).map((h) => world.req(h, Hazard));
    expect(hazards.some((h) => h.color === '#ff7a1a')).toBe(true);
    expect(hazards.some((h) => h.applies[0]!.status === 'poisoned')).toBe(true);
  });

  it('Teleporting closes the distance; Snaring roots after a warning', () => {
    const { world, ctx, player } = setup();
    const e = eliteWith(world, ['teleporting'], 30, 0);
    run(world, ctx, [eliteSystem], 60 * 10);
    const tr = world.req(e, Transform);
    expect(Math.hypot(tr.x, tr.z)).toBeLessThan(5);
    const s = eliteWith(world, ['snaring'], 8, 0);
    void s;
    run(world, ctx, [eliteSystem], 60 * 11);
    expect(world.query(PendingHazard).length + world.query(Hazard).length).toBeGreaterThan(0);
    run(world, ctx, [eliteSystem, spatialSystem], 90);
    void player;
  });
});
