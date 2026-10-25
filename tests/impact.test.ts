import { describe, expect, it } from 'vitest';
import { CombatStats, Hazard, Health, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import type { GameEvent } from '../src/core/events';
import type { Impact } from '../src/data/schemas';
import { spatialSystem } from '../src/systems/collision';
import { FEEL, critHitstop, frameFeel, hitOne, hitTakenFeel, impactArea, spawnHazards } from '../src/systems/impact';
import type { CompiledSkill } from '../src/systems/skillCompile';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

const impact = (over: Partial<Impact> = {}): Impact => ({
  coefficient: 1,
  damageType: 'physical',
  knockback: 0,
  applies: [],
  hitstopMs: 0,
  shake: 0,
  delivery: 'melee',
  lifeSteal: 0,
  corruptedMul: 1,
  ...over,
});

function setup() {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  Object.assign(world.req(player, CombatStats), { weaponDamage: 20, mainStat: 0, critChance: 0 });
  return { world, ctx, player };
}
const life = (world: World, e: number) => world.req(e, Health).current;

describe('impactArea', () => {
  it('hits every enemy in the circle and nobody outside it, never the caster', () => {
    const { world, ctx, player } = setup();
    const a = spawnEnemy(world, 'infected_colonist', 2, 0);
    const b = spawnEnemy(world, 'infected_colonist', -2, 1);
    const far = spawnEnemy(world, 'infected_colonist', 15, 0);
    run(world, ctx, [spatialSystem]);
    const maxLife = life(world, a);
    expect(impactArea(world, ctx, player, 0, 0, 4, null, impact())).toBe(2);
    expect(life(world, a)).toBeLessThan(maxLife);
    expect(life(world, b)).toBeLessThan(maxLife);
    expect(life(world, far)).toBe(maxLife);
    expect(life(world, player)).toBe(world.req(player, Health).max);
  });

  it('limits a hit to an arc in front of the facing direction', () => {
    const { world, ctx, player } = setup();
    // atan2(x, z): facing 0 looks along +z.
    const front = spawnEnemy(world, 'infected_colonist', 0, 3);
    const side = spawnEnemy(world, 'infected_colonist', 3, 0);
    const behind = spawnEnemy(world, 'infected_colonist', 0, -3);
    run(world, ctx, [spatialSystem]);
    expect(impactArea(world, ctx, player, 0, 0, 5, { facing: 0, arcDeg: 90 }, impact())).toBe(1);
    expect(life(world, front)).toBeLessThan(life(world, side));
    expect(life(world, side)).toBe(life(world, behind));
  });

  it('skips excluded targets', () => {
    const { world, ctx, player } = setup();
    const a = spawnEnemy(world, 'infected_colonist', 2, 0);
    const b = spawnEnemy(world, 'infected_colonist', -2, 0);
    run(world, ctx, [spatialSystem]);
    expect(impactArea(world, ctx, player, 0, 0, 4, null, impact(), [], undefined, [a])).toBe(1);
    expect(life(world, a)).toBe(world.req(a, Health).max);
    expect(life(world, b)).toBeLessThan(world.req(b, Health).max);
  });

  it('asks for hit-stop and shake only when something was hit', () => {
    const { world, ctx, player } = setup();
    run(world, ctx, [spatialSystem]);
    impactArea(world, ctx, player, 0, 0, 4, null, impact({ hitstopMs: 40, shake: 0.2 }));
    expect(ctx.events.peek().filter((e) => e.type === 'hitstop' || e.type === 'shake')).toHaveLength(0);
    spawnEnemy(world, 'infected_colonist', 2, 0);
    run(world, ctx, [spatialSystem]);
    impactArea(world, ctx, player, 0, 0, 4, null, impact({ hitstopMs: 40, shake: 0.2 }));
    const types = ctx.events.peek().map((e) => e.type);
    expect(types).toContain('hitstop');
    expect(types).toContain('shake');
  });
});

describe('hitOne', () => {
  it('heals the attacker by the life-steal share of the damage dealt', () => {
    const { world, ctx, player } = setup();
    const enemy = spawnEnemy(world, 'infected_colonist', 2, 0);
    const h = world.req(player, Health);
    h.current = h.max - 50;
    const dealt = hitOne(world, ctx, player, enemy, 0, 0, impact({ lifeSteal: 0.5 }))!;
    expect(dealt).toBeGreaterThan(0);
    expect(h.current).toBeCloseTo(h.max - 50 + dealt * 0.5, 5);
  });

  it('returns null when nothing was dealt (a dead target)', () => {
    const { world, ctx, player } = setup();
    const enemy = spawnEnemy(world, 'infected_colonist', 2, 0);
    world.req(enemy, Health).current = 0.5;
    hitOne(world, ctx, player, enemy, 0, 0, impact({ coefficient: 50 }));
    expect(hitOne(world, ctx, player, enemy, 0, 0, impact())).toBeNull();
  });
});

describe('spawnHazards', () => {
  it('leaves a ground hazard per skill modifier, scaled by the caster damage', () => {
    const { world, player } = setup();
    const compiled = { hazards: [{ radius: 3, duration: 4, status: 'burn', dpsCoefficient: 0.5 }] } as unknown as CompiledSkill;
    spawnHazards(world, player, 5, 6, compiled);
    const [h] = world.query(Hazard);
    expect(world.req(h!, Hazard)).toMatchObject({ team: 'player', radius: 3, remaining: 4 });
    expect(world.req(h!, Hazard).applies[0]!.dps).toBeCloseTo(10);
    expect(world.req(h!, Transform)).toMatchObject({ x: 5, z: 6 });
    spawnHazards(world, player, 0, 0, { hazards: [] } as unknown as CompiledSkill);
    expect(world.query(Hazard)).toHaveLength(1);
  });
});

describe('hit feel', () => {
  it('crits lengthen the freeze (at least 20 ms base) up to a cap', () => {
    expect(critHitstop(0)).toBeCloseTo(FEEL.critMinBaseMs * FEEL.critMul);
    expect(critHitstop(50)).toBeCloseTo(80);
    expect(critHitstop(500)).toBe(FEEL.critMaxMs);
  });

  it('a hit taken shakes in proportion to the life lost and freezes only when it is big', () => {
    expect(hitTakenFeel(1, 100)).toEqual({ trauma: 0, hitstopMs: 0 });
    expect(hitTakenFeel(10, 100)).toEqual({ trauma: 0.8 * 0.1, hitstopMs: 0 });
    expect(hitTakenFeel(50, 100)).toEqual({ trauma: FEEL.hitTakenMaxTrauma, hitstopMs: FEEL.hitTakenStopMs });
    expect(hitTakenFeel(10, 0)).toEqual({ trauma: 0, hitstopMs: 0 });
    expect(hitTakenFeel(-5, 100)).toEqual({ trauma: 0, hitstopMs: 0 });
  });

  const damage = (over: Partial<Extract<GameEvent, { type: 'damage' }>>): GameEvent => ({ type: 'damage', amount: 10, absorbed: 0, ...over }) as GameEvent;
  const death = (target: number): GameEvent => ({ type: 'death', target, isPlayer: false, family: 'infected' }) as unknown as GameEvent;

  it('an empty frame adds nothing', () => {
    expect(frameFeel([], 100)).toEqual({ hitstopMs: 0, trauma: 0, slowmoS: 0 });
  });

  it('a crit raises the skill own freeze and shakes; DoT ticks add nothing', () => {
    const feel = frameFeel([{ type: 'hitstop', ms: 30 } as GameEvent, damage({ crit: true })], 100);
    expect(feel.hitstopMs).toBeCloseTo(48);
    expect(feel.trauma).toBe(FEEL.critShake);
    expect(frameFeel([damage({ crit: true, dot: true })], 100)).toEqual({ hitstopMs: 0, trauma: 0, slowmoS: 0 });
  });

  it('a kill holds a little longer, an elite or boss kill adds a heavy shake and slow motion', () => {
    const plain = frameFeel([death(1)], 100);
    expect(plain.hitstopMs).toBe(FEEL.killExtraMs);
    expect(plain.slowmoS).toBe(0);
    const big = frameFeel([death(1)], 100, () => 'boss');
    expect(big.trauma).toBe(FEEL.bigKillTrauma);
    expect(big.slowmoS).toBe(FEEL.slowmoSeconds);
  });

  it('the player dying does not count as a kill, and a big hit taken freezes the frame', () => {
    expect(frameFeel([{ type: 'death', target: 1, isPlayer: true, family: 'infected' } as unknown as GameEvent], 100).hitstopMs).toBe(0);
    const taken = frameFeel([damage({ toPlayer: true, amount: 40 })], 100);
    expect(taken.hitstopMs).toBe(FEEL.hitTakenStopMs);
    expect(taken.trauma).toBeGreaterThan(0);
  });
});
