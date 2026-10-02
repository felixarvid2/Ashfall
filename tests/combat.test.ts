import { describe, expect, it } from 'vitest';
import {
  CombatStats,
  Dead,
  EnemyAI,
  Hazard,
  Health,
  Invulnerable,
  Resource,
  StatusEffects,
} from '../src/core/components';
import { World } from '../src/core/ecs';
import { applyDamage, applyStatus, dealHit, hasStatus } from '../src/systems/combat';
import { deathSystem } from '../src/systems/death';
import { hazardSystem } from '../src/systems/projectiles';
import { resourceSystem } from '../src/systems/resource';
import { statusSystem } from '../src/systems/status';
import { spatialSystem } from '../src/systems/collision';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const enemy = spawnEnemy(world, 'infected_colonist', 2, 0);
  return { world, ctx, player, enemy };
}

const opts = { crit: false, damageType: 'physical' as const, dot: false, sourceTeam: 'enemy' as const };

describe('applyDamage', () => {
  it('reduces life and emits a damage event', () => {
    const { world, ctx, enemy } = setup();
    applyDamage(world, ctx, enemy, 10, opts);
    expect(world.req(enemy, Health).current).toBe(35);
    expect(ctx.events.peek().some((e) => e.type === 'damage' && e.amount === 10)).toBe(true);
  });

  it('barrier absorbs damage before life', () => {
    const { world, ctx, player } = setup();
    applyStatus(world, ctx, player, { status: 'barrier', duration: 5, amount: 30 }, { team: 'player', level: 1 });
    applyDamage(world, ctx, player, 50, opts);
    expect(world.req(player, Health).current).toBe(220 - 20);
    expect(hasStatus(world, player, 'barrier')).toBe(false); // used up
  });

  it('invulnerable and dead targets take nothing', () => {
    const { world, ctx, player, enemy } = setup();
    world.add(player, Invulnerable, { remaining: 1 });
    expect(applyDamage(world, ctx, player, 50, opts)).toBeNull();
    expect(world.req(player, Health).current).toBe(220);
    applyDamage(world, ctx, enemy, 999, opts);
    expect(applyDamage(world, ctx, enemy, 5, opts)).toBeNull();
  });

  it('god mode protects only the player', () => {
    const { world, ctx, player } = setup();
    ctx.debug.godMode = true;
    applyDamage(world, ctx, player, 500, opts);
    expect(world.req(player, Health).current).toBe(220);
    expect(world.has(player, Dead)).toBe(false);
  });

  it('kills at zero life, counts the kill and removes the corpse later', () => {
    const { world, ctx, enemy } = setup();
    applyDamage(world, ctx, enemy, 100, opts);
    expect(world.has(enemy, Dead)).toBe(true);
    expect(ctx.stats.kills).toBe(1);
    expect(ctx.events.peek().some((e) => e.type === 'death' && e.target === enemy)).toBe(true);
    run(world, ctx, [deathSystem], 60 * 3);
    expect(world.isAlive(enemy)).toBe(false);
  });

  it('taking damage builds Bastion heat', () => {
    const { world, ctx, player } = setup();
    applyDamage(world, ctx, player, 22, opts); // 10% of 220 life
    expect(world.req(player, Resource).current).toBeCloseTo(6); // 0.6 per 1%
  });

  it('damaging an idle enemy aggroes it', () => {
    const { world, ctx, enemy } = setup();
    expect(world.req(enemy, EnemyAI).aggro).toBe(false);
    applyDamage(world, ctx, enemy, 1, opts);
    expect(world.req(enemy, EnemyAI).aggro).toBe(true);
  });
});

describe('dealHit', () => {
  it('uses attacker stats and the target armor', () => {
    const { world, ctx, player, enemy } = setup();
    world.req(player, CombatStats).critChance = 0;
    const dealt = dealHit(world, ctx, player, enemy, {
      coefficient: 1,
      damageType: 'physical',
      knockback: 0,
      fromX: 0,
      fromZ: 0,
      applies: [],
      range: 'melee',
    });
    // 14 weapon × 1.02 main stat × (1 − 20 / (20 + 65)) armor
    expect(dealt).toBeCloseTo(14 * 1.02 * (1 - 20 / 85));
  });

  it('vulnerable targets take 20% more', () => {
    const { world, ctx, player, enemy } = setup();
    world.req(player, CombatStats).critChance = 0;
    const hit = { coefficient: 1, damageType: 'heat' as const, knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'melee' as const };
    const normal = dealHit(world, ctx, player, enemy, hit)!;
    applyStatus(world, ctx, enemy, { status: 'vulnerable', duration: 3 }, { team: 'player', level: 1 });
    const vuln = dealHit(world, ctx, player, enemy, hit)!;
    expect(vuln / normal).toBeCloseTo(1.2);
  });
});

describe('statuses', () => {
  it('refresh-type DoTs keep one instance; stacking DoTs stack up to the cap', () => {
    const { world, ctx, enemy } = setup();
    const src = { team: 'player' as const, level: 1 };
    for (let i = 0; i < 3; i++) applyStatus(world, ctx, enemy, { status: 'burning', duration: 3, dps: 5 }, src);
    for (let i = 0; i < 8; i++) applyStatus(world, ctx, enemy, { status: 'poisoned', duration: 3, dps: 2 }, src);
    const list = world.req(enemy, StatusEffects).list;
    expect(list.filter((s) => s.id === 'burning')).toHaveLength(1);
    expect(list.filter((s) => s.id === 'poisoned')).toHaveLength(5);
  });

  it('DoT deals its damage over the duration and then expires', () => {
    const { world, ctx, enemy } = setup();
    // Heat damage, colonist has no heat resistance: 4 dps × 2 s = 8.
    applyStatus(world, ctx, enemy, { status: 'burning', duration: 2, dps: 4 }, { team: 'player', level: 1 });
    run(world, ctx, [statusSystem], 60 * 3);
    expect(world.req(enemy, Health).current).toBeCloseTo(45 - 8, 1);
    expect(hasStatus(world, enemy, 'burning')).toBe(false);
  });

  it('coefficient DoTs scale with the attacker', () => {
    const { world, ctx, player, enemy } = setup();
    applyStatus(world, ctx, enemy, { status: 'burning', duration: 3, coefficient: 0.9 }, { team: 'player', level: 1, attacker: player });
    const burn = world.req(enemy, StatusEffects).list.find((s) => s.id === 'burning')!;
    expect(burn.dps * 3).toBeCloseTo(14 * 0.9 * 1.02);
  });

  it('stun disables acting and movement, then wears off', () => {
    const { world, ctx, enemy } = setup();
    applyStatus(world, ctx, enemy, { status: 'stunned', duration: 0.5 }, { team: 'player', level: 1 });
    run(world, ctx, [statusSystem], 1);
    expect(world.req(enemy, StatusEffects).canAct).toBe(false);
    run(world, ctx, [statusSystem], 40);
    expect(world.req(enemy, StatusEffects).canAct).toBe(true);
  });

  it('stun interrupts an enemy wind-up', () => {
    const { world, ctx, enemy } = setup();
    const ai = world.req(enemy, EnemyAI);
    ai.state = 'windup';
    applyStatus(world, ctx, enemy, { status: 'stunned', duration: 1 }, { team: 'player', level: 1 });
    expect(ai.state).toBe('recover');
  });

  it('barrier from life fraction scales with max life', () => {
    const { world, ctx, player } = setup();
    applyStatus(world, ctx, player, { status: 'barrier', duration: 6, lifeFraction: 0.35 }, { team: 'player', level: 1 });
    expect(world.req(player, StatusEffects).list[0]!.amount).toBeCloseTo(77);
  });
});

describe('spore carrier death cloud', () => {
  it('leaves a hazard that poisons the player standing in it', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const carrier = spawnEnemy(world, 'spore_carrier', 1, 0);
    applyDamage(world, ctx, carrier, 999, opts);
    expect(world.query(Hazard)).toHaveLength(1);
    run(world, ctx, [spatialSystem, hazardSystem, statusSystem], 60 * 2);
    expect(world.req(player, Health).current).toBeLessThan(220);
    run(world, ctx, [spatialSystem, hazardSystem, statusSystem], 60 * 4);
    expect(world.query(Hazard)).toHaveLength(0);
  });
});

describe('heat resource', () => {
  it('decays when out of combat', () => {
    const { world, ctx, player } = setup();
    const heat = world.req(player, Resource);
    heat.current = 50;
    heat.sinceCombat = 0;
    run(world, ctx, [resourceSystem], 60 * 2); // within the 2.5 s delay
    expect(heat.current).toBe(50);
    run(world, ctx, [resourceSystem], 60 * 2);
    expect(heat.current).toBeLessThan(50);
  });

  it('overheats after staying at max past the grace period', () => {
    const { world, ctx, player } = setup();
    const heat = world.req(player, Resource);
    const life = world.req(player, Health);
    heat.current = 100;
    // Keep the player "in combat" so heat does not decay.
    const keepHot = () => {
      heat.sinceCombat = 0;
      heat.current = 100;
    };
    for (let i = 0; i < 80; i++) {
      keepHot();
      run(world, ctx, [resourceSystem], 1);
    }
    expect(life.current).toBe(220); // 1.33 s < 1.5 s grace
    for (let i = 0; i < 120; i++) {
      keepHot();
      run(world, ctx, [resourceSystem], 1);
    }
    expect(life.current).toBeLessThan(220);
    expect(ctx.events.peek().some((e) => e.type === 'overheat')).toBe(true);
  });
});
