import { describe, expect, it } from 'vitest';
import {
  Collider,
  CombatStats,
  Dead,
  Faction,
  Guardian,
  Health,
  Invulnerable,
  MinionAI,
  Mover,
  Resource,
  Sanctum,
  SkillUser,
  StatusEffects,
  Summon,
  Transform,
  makeTransform,
} from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { ENEMY_DEFS, SKILLS, enemyDef } from '../src/data/db';
import { UNIQUE_DEFS } from '../src/data/loot/db';
import { SANCTUM_MIN_INTERVAL, compileSkill } from '../src/systems/skillCompile';
import { fieldAccess } from '../src/systems/skillCompile';
import { SKILL_FIELDS } from '../src/data/effects';
import { CHEAT_DEATH_INVULNERABLE, applyAllyStatus, applyDamage, applyStatus, dealHit, hasStatus, healAlly, kill } from '../src/systems/combat';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { deathSystem } from '../src/systems/death';
import { guardianSystem, guardiansOf, sanctumSystem } from '../src/systems/lightbearer';
import { minionSystem, minionsOf } from '../src/systems/minions';
import { movementSystem } from '../src/systems/movement';
import { projectileSystem, summonSystem } from '../src/systems/projectiles';
import { resourceSystem } from '../src/systems/resource';
import { delayedStrikeSystem, effectiveCooldown, forcedMoveSystem, skillSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { learnSkills, makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [
  spatialSystem,
  skillSystem,
  minionSystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  delayedStrikeSystem,
  collisionSystem,
  projectileSystem,
  summonSystem,
  sanctumSystem,
  guardianSystem,
  resourceSystem,
  deathSystem,
];

const HIT = { knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'ranged' } as const;

function setup(skills: (string | null)[]) {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'lightbearer', 0, 0);
  learnSkills(world, player, skills);
  Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20, resourceGen: 0 });
  world.req(player, Resource).current = 100;
  return { world, ctx, player };
}

function cast(world: World, ctx: GameContext, player: Entity, slot: number, aimX: number, aimZ: number, ticks = 30) {
  world.req(player, SkillUser).request = { slot, aimX, aimZ, ttl: 0.25 };
  run(world, ctx, SYSTEMS, ticks);
}

function tough(world: World, e: Entity): Entity {
  const h = world.req(e, Health);
  h.max = h.current = 10000;
  return e;
}

/** A plain player-side ally (like a decoy): life, a collider, statuses. */
function ally(world: World, x: number, z: number, life = 200): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z));
  world.add(e, Faction, { team: 'player' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, { radius: 0.4, mass: 1, layer: 'ground', isStatic: false });
  world.add(e, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
  return e;
}

const hp = (world: World, e: Entity): number => world.req(e, Health).current;

describe('Lightbearer class', () => {
  it('starts with Censer Strike and Devotion', () => {
    const world = new World();
    const player = spawnPlayer(world, 'lightbearer', 0, 0);
    expect(world.req(player, SkillUser).slots[0]).toBe('lightbearer.censer_strike');
    const r = world.req(player, Resource);
    expect(r.kind).toBe('devotion');
    expect(r.config.onHeal).toBeGreaterThan(0);
  });
});

describe('Heal (allyArea)', () => {
  it('heals you and your allies and burns only corrupted enemies', () => {
    const { world, ctx, player } = setup(['lightbearer.heal']);
    const friend = ally(world, 3, 0, 200);
    world.req(friend, Health).current = 100;
    const far = ally(world, 20, 0, 200);
    world.req(far, Health).current = 100;
    const infected = tough(world, spawnEnemy(world, 'infected_colonist', 0, 4));
    const machine = tough(world, spawnEnemy(world, 'security_drone', 0, -4));
    expect(enemyDef('infected_colonist').family).toBe('infected');
    expect(enemyDef('security_drone').family).toBe('machine');
    const life = world.req(player, Health);
    life.current = 50;
    cast(world, ctx, player, 0, 0, 5, 30);
    expect(life.current).toBeCloseTo(50 + life.max * 0.15, 1);
    expect(hp(world, friend)).toBeCloseTo(100 + 200 * 0.15, 1); // a fraction of its own max life
    expect(hp(world, far)).toBe(100); // outside the radius
    expect(hp(world, infected)).toBeLessThan(10000);
    expect(hp(world, machine)).toBe(10000);
  });

  it('keeps the area on the caster for center "self" and costs Devotion', () => {
    const { world, ctx, player } = setup(['lightbearer.heal']);
    const r = world.req(player, Resource);
    r.current = 60;
    world.req(player, Health).current = world.req(player, Health).max; // nothing to heal: no Devotion back
    cast(world, ctx, player, 0, 0, 5, 20);
    // 35 cost, plus a little idle regeneration.
    expect(r.current).toBeLessThan(60 - 35 + 3);
    expect(r.current).toBeGreaterThanOrEqual(60 - 35);
  });
});

describe('Kyrie Eleison and Blessing', () => {
  it('Kyrie shields you and nearby allies, the amount a fraction of each one’s own life', () => {
    const { world, ctx, player } = setup(['lightbearer.kyrie_eleison']);
    const friend = ally(world, 4, 0, 400);
    cast(world, ctx, player, 0, 0, 5, 20);
    const barrier = (e: Entity) => world.req(e, StatusEffects).list.filter((s) => s.id === 'barrier').reduce((n, s) => n + s.amount, 0);
    expect(barrier(player)).toBeCloseTo(world.req(player, Health).max * 0.25, 0);
    expect(barrier(friend)).toBeCloseTo(100, 0);
  });

  it('blessed raises damage dealt and move and cast speed', () => {
    const { world, ctx, player } = setup(['lightbearer.blessing']);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 3));
    const spec = { ...HIT, coefficient: 1, damageType: 'energy' as const };
    const plain = dealHit(world, ctx, player, enemy, spec)!;
    cast(world, ctx, player, 0, 0, 5, 20);
    expect(hasStatus(world, player, 'blessed')).toBe(true);
    const blessed = dealHit(world, ctx, player, enemy, spec)!;
    expect(blessed / plain).toBeCloseTo(1.2, 2);
    expect(world.req(player, Mover).speedMul).toBeCloseTo(1.12, 3);
    // Cast speed: the same two ticks advance a cast 12 % further.
    const user = world.req(player, SkillUser);
    user.slots[1] = 'lightbearer.benediction';
    const advance = () => {
      user.cast = { skillId: 'lightbearer.benediction', elapsed: 0, fired: false, aimX: 0, aimZ: 1 };
      run(world, ctx, [skillSystem], 1);
      return user.cast!.elapsed;
    };
    const fast = advance();
    world.req(player, StatusEffects).list = [];
    expect(advance()).toBeCloseTo(fast / 1.12, 5);
  });

  it('Blessing lifts stuns and slows from allies', () => {
    const { world, ctx, player } = setup(['lightbearer.blessing']);
    const friend = ally(world, 3, 0);
    applyStatus(world, ctx, friend, { status: 'stunned', duration: 5 }, { team: 'enemy', level: 1 });
    applyStatus(world, ctx, player, { status: 'chilled', duration: 5 }, { team: 'enemy', level: 1 });
    cast(world, ctx, player, 0, 0, 5, 20);
    expect(hasStatus(world, friend, 'stunned')).toBe(false);
    expect(hasStatus(world, player, 'chilled')).toBe(false);
    expect(hasStatus(world, friend, 'blessed')).toBe(true);
  });
});

describe('Lex Aeterna', () => {
  it('judged enemies take 1.35x from every hit for 6 s and the judgment is not used up', () => {
    const { world, ctx, player } = setup(['lightbearer.lex_aeterna']);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 6));
    const spec = { ...HIT, coefficient: 1, damageType: 'energy' as const };
    const plain = dealHit(world, ctx, player, enemy, spec)!;
    cast(world, ctx, player, 0, 0, 6, 20);
    expect(hasStatus(world, enemy, 'lexAeterna')).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(dealHit(world, ctx, player, enemy, spec)! / plain).toBeCloseTo(1.35, 2);
      expect(hasStatus(world, enemy, 'lexAeterna')).toBe(true);
    }
    run(world, ctx, [statusSystem], 60 * 6);
    expect(hasStatus(world, enemy, 'lexAeterna')).toBe(false);
    expect(dealHit(world, ctx, player, enemy, spec)! / plain).toBeCloseTo(1, 2);
  });

  it('Harsh Judgment widens the burst by 1.5 and lasts 4 s longer', () => {
    const base = SKILLS.get('lightbearer.lex_aeterna')!.effect;
    const judged = compileSkill('lightbearer.lex_aeterna', 1, [
      { op: 'add', field: 'radius', value: 1.5 },
      { op: 'addApply', apply: { status: 'lexAeterna', duration: 10 } },
    ]).def.effect;
    if (base.kind !== 'cursorBurst' || judged.kind !== 'cursorBurst') throw new Error('Lex Aeterna is a cursor burst');
    expect(judged.radius).toBeCloseTo(base.radius + 1.5, 5);
    expect(Math.max(...judged.applies.map((a) => a.duration))).toBe(10);
    expect(base.coefficient).toBeGreaterThanOrEqual(0.8);
  });

  it('is not used up by damage-over-time ticks', () => {
    const { world, ctx, player } = setup(['lightbearer.lex_aeterna']);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 6));
    applyStatus(world, ctx, enemy, { status: 'lexAeterna', duration: 6 }, { team: 'player', level: 1 });
    applyStatus(world, ctx, enemy, { status: 'burning', duration: 3, dps: 20 }, { team: 'player', level: 1, attacker: player });
    run(world, ctx, [statusSystem], 60);
    expect(hp(world, enemy)).toBeLessThan(10000);
    expect(hasStatus(world, enemy, 'lexAeterna')).toBe(true);
  });

  it('the marked status still works as before', () => {
    const { world, ctx, player } = setup([]);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 6));
    const spec = { ...HIT, coefficient: 1, damageType: 'energy' as const };
    const plain = dealHit(world, ctx, player, enemy, spec)!;
    applyStatus(world, ctx, enemy, { status: 'marked', duration: 5 }, { team: 'player', level: 1 });
    expect(dealHit(world, ctx, player, enemy, spec)! / plain).toBeCloseTo(1.25, 2);
    expect(hasStatus(world, enemy, 'marked')).toBe(true); // not consumed
  });
});

describe('Benediction', () => {
  it('heals, protects and stuns: allies cannot die while it lasts', () => {
    const { world, ctx, player } = setup(['lightbearer.benediction']);
    const friend = ally(world, 3, 0, 100);
    world.req(friend, Health).current = 10;
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 4));
    cast(world, ctx, player, 0, 0, 5, 30);
    expect(hp(world, friend)).toBeCloseTo(10 + 100 * 0.3, 1);
    expect(hasStatus(world, player, 'benediction')).toBe(true);
    expect(hasStatus(world, friend, 'benediction')).toBe(true);
    expect(hasStatus(world, enemy, 'stunned')).toBe(true);
    expect(hp(world, enemy)).toBeLessThan(10000);
  });

  const lethal = { crit: false, damageType: 'physical', dot: false, sourceTeam: 'enemy' } as const;

  it('stops one lethal blow, is spent by it, and a second blow after the grace kills', () => {
    const { world, ctx, player } = setup([]);
    const life = world.req(player, Health);
    applyStatus(world, ctx, player, { status: 'benediction', duration: 8 }, { team: 'player', level: 1 });
    applyDamage(world, ctx, player, 1e6, lethal);
    expect(life.current).toBe(1);
    expect(world.has(player, Dead)).toBe(false);
    expect(hasStatus(world, player, 'benediction')).toBe(false); // spent
    expect(world.has(player, Invulnerable)).toBe(true);
    // 1.5 s of invulnerability: another blow does nothing...
    expect(applyDamage(world, ctx, player, 1e6, lethal)).toBeNull();
    expect(world.has(player, Dead)).toBe(false);
    // ...and after it the second lethal blow kills, though the 8 s had not run out.
    run(world, ctx, [statusSystem], Math.ceil(60 * CHEAT_DEATH_INVULNERABLE) + 5);
    expect(world.has(player, Invulnerable)).toBe(false);
    applyDamage(world, ctx, player, 1e6, lethal);
    expect(world.has(player, Dead)).toBe(true);
  });

  it('takes a fifth less from ordinary blows, and only while it lasts', () => {
    const { world, ctx, player } = setup([]);
    const life = world.req(player, Health);
    applyStatus(world, ctx, player, { status: 'benediction', duration: 8 }, { team: 'player', level: 1 });
    expect(applyDamage(world, ctx, player, 100, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'enemy' })).toBeCloseTo(80, 5);
    life.current = life.max;
    expect(hasStatus(world, player, 'benediction')).toBe(true);
    run(world, ctx, [statusSystem], 60 * 9);
    expect(hasStatus(world, player, 'benediction')).toBe(false);
    applyDamage(world, ctx, player, 1e6, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'enemy' });
    expect(world.has(player, Dead)).toBe(true);
  });
});

describe('Sanctum (Magnus Exorcismus, Sanctuary)', () => {
  /** Run and count the pulses the (single) sanctum fires over its life. */
  function pulses(world: World, ctx: GameContext, ticks: number): number {
    let max = 0;
    for (let i = 0; i < ticks; i++) {
      run(world, ctx, SYSTEMS, 1);
      for (const e of world.query(Sanctum)) max = Math.max(max, world.req(e, Sanctum).pulses);
    }
    return max;
  }

  it('Magnus Exorcismus pulses six times at the cursor and strikes what stands in it', () => {
    const { world, ctx, player } = setup(['lightbearer.magnus_exorcismus']);
    const inside = tough(world, spawnEnemy(world, 'infected_colonist', 8, 0));
    const outside = tough(world, spawnEnemy(world, 'infected_colonist', 8, 12));
    cast(world, ctx, player, 0, 8, 0, 20);
    const sanctum = world.query(Sanctum)[0]!;
    expect(world.req(sanctum, Transform).x).toBeCloseTo(8, 3);
    expect(pulses(world, ctx, 60 * 6)).toBe(6);
    expect(hp(world, inside)).toBeLessThan(10000 - 50);
    expect(hp(world, outside)).toBe(10000);
    expect(world.query(Sanctum)).toHaveLength(0); // gone after fading
  });

  it('clamps a far cursor to its range', () => {
    const { world, ctx, player } = setup(['lightbearer.magnus_exorcismus']);
    cast(world, ctx, player, 0, 30, 0, 20);
    expect(world.req(world.query(Sanctum)[0]!, Transform).x).toBeCloseTo(12, 3);
  });

  it('Sanctuary mends allies standing in it every second for seven pulses', () => {
    const { world, ctx, player } = setup(['lightbearer.sanctuary']);
    const friend = ally(world, 3, 0, 1000);
    world.req(friend, Health).current = 100;
    const outside = ally(world, 9, 0, 1000);
    world.req(outside, Health).current = 100;
    const life = world.req(player, Health);
    life.current = 10;
    cast(world, ctx, player, 0, 0, 5, 5);
    expect(pulses(world, ctx, 60 * 9)).toBe(7);
    expect(hp(world, friend)).toBeCloseTo(100 + 7 * 1000 * 0.04, 0);
    expect(hp(world, outside)).toBe(100);
    expect(life.current).toBeCloseTo(10 + 7 * life.max * 0.04, 0);
  });

  it('ends if its caster dies', () => {
    const { world, ctx, player } = setup(['lightbearer.sanctuary']);
    cast(world, ctx, player, 0, 0, 5, 20);
    expect(world.query(Sanctum)).toHaveLength(1);
    kill(world, ctx, player, 0);
    run(world, ctx, SYSTEMS, 2);
    expect(world.query(Sanctum)).toHaveLength(0);
  });
});

describe('Guardian Light', () => {
  function castGuardianLight(world: World, ctx: GameContext, player: Entity): void {
    world.req(player, Resource).current = 100;
    cast(world, ctx, player, 0, 0, 5, 70);
  }

  it('calls up a hovering light on your side that is a summon, not a corpse', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    const [g] = guardiansOf(world, player);
    expect(g).toBeDefined();
    expect(world.req(g!, Faction).team).toBe('player');
    expect(world.req(g!, Health).max).toBeCloseTo(world.req(player, Health).max * 0.4, 3);
    expect(world.req(g!, Summon).kind).toBe('summon');
    expect(world.req(g!, MinionAI).ranged).toBe(true);
    expect(world.req(g!, Collider).isStatic).toBe(false);
    expect(world.req(g!, Transform).y).toBeGreaterThan(1);
    // Its offence follows the owner's.
    expect(world.req(g!, CombatStats).weaponDamage).toBe(14);
  });

  it('keeps at most maxGuardians and replaces the oldest', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    const first = guardiansOf(world, player)[0]!;
    castGuardianLight(world, ctx, player);
    expect(guardiansOf(world, player)).toHaveLength(2);
    castGuardianLight(world, ctx, player);
    const alive = guardiansOf(world, player);
    expect(alive).toHaveLength(2);
    expect(alive).not.toContain(first);
  });

  it('does not count toward the Raise Corpse cap', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    castGuardianLight(world, ctx, player);
    expect(guardiansOf(world, player)).toHaveLength(2);
    expect(minionsOf(world, player)).toHaveLength(0);
  });

  it('expires after its duration', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    expect(guardiansOf(world, player)).toHaveLength(1);
    run(world, ctx, SYSTEMS, 60 * 26);
    expect(guardiansOf(world, player)).toHaveLength(0);
    run(world, ctx, SYSTEMS, 60);
    expect(world.query(Guardian)).toHaveLength(0);
  });

  it('shoots enemies in range, harder at the corrupted', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    const infected = tough(world, spawnEnemy(world, 'infected_colonist', 6, 0));
    run(world, ctx, SYSTEMS, 150);
    expect(hp(world, infected)).toBeLessThan(10000);
  });

  it('mends allies near it on its interval, as the owner’s healing', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    const life = world.req(player, Health);
    life.current = 50;
    const before = life.current;
    const devotion = world.req(player, Resource);
    devotion.current = 0;
    devotion.config = { ...devotion.config, idleRate: 0 };
    run(world, ctx, SYSTEMS, 60 * 4);
    expect(life.current).toBeGreaterThan(before);
    expect(devotion.current).toBeGreaterThan(0);
  });

  it('dies with its owner', () => {
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    castGuardianLight(world, ctx, player);
    kill(world, ctx, player, 0);
    run(world, ctx, SYSTEMS, 5);
    expect(guardiansOf(world, player)).toHaveLength(0);
  });
});

describe('Devotion', () => {
  function quietPlayer() {
    const { world, ctx, player } = setup([]);
    const r = world.req(player, Resource);
    r.current = 0;
    r.config = { ...r.config, onHeal: 0.5 };
    return { world, ctx, player, r, life: world.req(player, Health) };
  }

  it('grows with the life actually healed, not the overheal', () => {
    const { world, ctx, player, r, life } = quietPlayer();
    life.current = life.max - 10;
    const healed = healAlly(world, ctx, player, player, 1000);
    expect(healed).toBeCloseTo(10, 5);
    expect(r.current).toBeCloseTo((10 / life.max) * 100 * 0.5, 5);
    healAlly(world, ctx, player, player, 1000); // already full: nothing
    expect(r.current).toBeCloseTo((10 / life.max) * 100 * 0.5, 5);
  });

  it('counts healing an ally for the healer', () => {
    const { world, ctx, player, r } = quietPlayer();
    const friend = ally(world, 3, 0, 200);
    world.req(friend, Health).current = 100;
    healAlly(world, ctx, player, friend, 50); // 25 % of the friend's life
    expect(r.current).toBeCloseTo(12.5, 5);
  });

  it('counts a barrier by its amount', () => {
    const { world, ctx, player, r, life } = quietPlayer();
    applyAllyStatus(world, ctx, player, player, { status: 'barrier', duration: 6, lifeFraction: 0.25 });
    expect(r.current).toBeCloseTo(25 * 0.5, 5);
    const friend = ally(world, 3, 0, 200);
    r.current = 0;
    applyAllyStatus(world, ctx, player, friend, { status: 'barrier', duration: 6, lifeFraction: 0.25 });
    expect(r.current).toBeCloseTo(12.5, 5);
    void life;
  });

  it('Heal refills Devotion by the life it mends', () => {
    const { world, ctx, player } = setup(['lightbearer.heal']);
    const r = world.req(player, Resource);
    r.config = { ...r.config, idleRate: 0 };
    r.current = 50;
    const life = world.req(player, Health);
    life.current = life.max * 0.5;
    cast(world, ctx, player, 0, 0, 5, 20);
    // -35 cost, +0.5 per percent of max life healed (15 %).
    expect(r.current).toBeCloseTo(50 - 35 + 15 * 0.5, 3);
  });
});

describe('corruptedMul', () => {
  it('multiplies damage against infected and lumen enemies only', () => {
    const { world, ctx, player } = setup([]);
    const lumen = [...ENEMY_DEFS.values()].find((d) => d.family === 'lumen' && d.evasion === 0 && d.reflect === 0);
    expect(lumen).toBeDefined();
    const targets = {
      infected: tough(world, spawnEnemy(world, 'infected_colonist', 0, 4)),
      lumen: tough(world, spawnEnemy(world, lumen!.id, 4, 0)),
      machine: tough(world, spawnEnemy(world, 'security_drone', -4, 0)),
    };
    const spec = { ...HIT, coefficient: 1, damageType: 'physical' as const };
    const base = Object.fromEntries(Object.entries(targets).map(([k, e]) => [k, dealHit(world, ctx, player, e, spec)!]));
    const boosted = Object.fromEntries(Object.entries(targets).map(([k, e]) => [k, dealHit(world, ctx, player, e, { ...spec, corruptedMul: 1.5 })!]));
    expect(boosted.infected! / base.infected!).toBeCloseTo(1.5, 2);
    expect(boosted.lumen! / base.lumen!).toBeCloseTo(1.5, 2);
    expect(boosted.machine! / base.machine!).toBeCloseTo(1, 2);
  });

  it('Censer Strike hits the corrupted harder than other enemies', () => {
    const { world, ctx, player } = setup(['lightbearer.censer_strike']);
    const infected = tough(world, spawnEnemy(world, 'infected_colonist', 0, 1.6));
    cast(world, ctx, player, 0, 0, 3, 20);
    const dealtInfected = 10000 - hp(world, infected);
    expect(dealtInfected).toBeGreaterThan(0);
    // The same swing on a machine with the same armour and resistances would deal 1/1.2 as much.
    const probe = tough(world, spawnEnemy(world, 'infected_colonist', 30, 30));
    const censer = SKILLS.get('lightbearer.censer_strike')!.effect;
    const censerCoefficient = censer.kind === 'meleeArc' ? censer.coefficient : 0;
    const plain = dealHit(world, ctx, player, probe, { ...HIT, coefficient: censerCoefficient, damageType: 'physical' })!;
    expect(dealtInfected / plain).toBeCloseTo(1.2, 1);
  });
});

describe('skill support for the tree', () => {
  const bonus = { value: 0.5, when: 'corrupted' as const };

  it('a corrupted condition boosts damage against infected and lumen enemies only', () => {
    const { world, ctx, player } = setup([]);
    const infected = tough(world, spawnEnemy(world, 'infected_colonist', 0, 4));
    const machine = tough(world, spawnEnemy(world, 'security_drone', 4, 0));
    const spec = { ...HIT, coefficient: 1, damageType: 'energy' as const };
    const plain = { infected: dealHit(world, ctx, player, infected, spec)!, machine: dealHit(world, ctx, player, machine, spec)! };
    world.req(player, CombatStats).additive.push(bonus);
    expect(dealHit(world, ctx, player, infected, spec)! / plain.infected).toBeCloseTo(1.5, 2);
    expect(dealHit(world, ctx, player, machine, spec)! / plain.machine).toBeCloseTo(1, 2);
  });

  it('modifiers reach maxGuardians, allyHealFraction and the nested coefficients', () => {
    expect(SKILL_FIELDS).toContain('maxGuardians');
    expect(SKILL_FIELDS).toContain('allyHealFraction');
    const g = compileSkill('lightbearer.guardian_light', 1, [{ op: 'add', field: 'maxGuardians', value: 1 }]);
    expect(g.def.effect.kind === 'guardian' && g.def.effect.maxGuardians).toBe(3);
    const sanct = SKILLS.get('lightbearer.sanctuary')!;
    expect(fieldAccess(structuredClone(sanct), 'allyHealFraction')!.get()).toBe(0.04);
    expect(fieldAccess(structuredClone(sanct), 'heal')!.get()).toBe(0.04); // op "heal" reaches it too
    const base = (id: string) => {
      const e = structuredClone(SKILLS.get(id)!.effect);
      return e.kind === 'sanctum' ? e.impact!.coefficient : e.kind === 'guardian' ? e.bolt.coefficient : e.kind === 'allyArea' ? e.enemyImpact!.coefficient : 0;
    };
    for (const id of ['lightbearer.magnus_exorcismus', 'lightbearer.guardian_light', 'lightbearer.heal']) {
      const ranked = compileSkill(id, 3, []).def.effect;
      const c = ranked.kind === 'sanctum' ? ranked.impact!.coefficient : ranked.kind === 'guardian' ? ranked.bolt.coefficient : ranked.kind === 'allyArea' ? ranked.enemyImpact!.coefficient : 0;
      expect(c, id).toBeCloseTo(base(id) * 1.2, 5); // rank scaling reaches the nested coefficient
      const mod = compileSkill(id, 1, [{ op: 'mul', field: 'coefficient', value: 1 }]).def.effect;
      const m = mod.kind === 'sanctum' ? mod.impact!.coefficient : mod.kind === 'guardian' ? mod.bolt.coefficient : mod.kind === 'allyArea' ? mod.enemyImpact!.coefficient : 0;
      expect(m, id).toBeCloseTo(base(id) * 2, 5);
    }
  });

  it('addApply goes to allies or enemies by the status, and to the guardian bolt', () => {
    const add = (id: string, status: 'blessed' | 'vulnerable') => compileSkill(id, 1, [{ op: 'addApply', apply: { status, duration: 4 } }]).def.effect;
    const sanct = add('lightbearer.sanctuary', 'blessed');
    expect(sanct.kind === 'sanctum' && sanct.allyApplies.map((a) => a.status)).toEqual(['blessed']);
    const sanctEnemy = add('lightbearer.sanctuary', 'vulnerable');
    expect(sanctEnemy.kind === 'sanctum' && sanctEnemy.impact!.applies.map((a) => a.status)).toEqual(['vulnerable']);
    const area = add('lightbearer.benediction', 'blessed');
    expect(area.kind === 'allyArea' && area.applies.map((a) => a.status)).toEqual(['benediction', 'blessed']);
    const areaEnemy = add('lightbearer.benediction', 'vulnerable');
    expect(areaEnemy.kind === 'allyArea' && areaEnemy.enemyImpact!.applies.map((a) => a.status)).toEqual(['stunned', 'vulnerable']);
    const guardian = add('lightbearer.guardian_light', 'vulnerable');
    expect(guardian.kind === 'guardian' && guardian.bolt.applies.map((a) => a.status)).toEqual(['vulnerable']);
  });

  it('a barrier cast on an ally uses the caster’s Barrier bonus', () => {
    const { world, ctx, player } = setup([]);
    world.req(player, CombatStats).barrierBonus = 0.5;
    const friend = ally(world, 3, 0, 200);
    applyAllyStatus(world, ctx, player, friend, { status: 'barrier', duration: 6, lifeFraction: 0.25 });
    expect(world.req(friend, StatusEffects).list[0]!.amount).toBeCloseTo(50 * 1.5, 5);
  });

  it('resourceGen scales the Devotion that healing gives', () => {
    const { world, ctx, player } = setup([]);
    const r = world.req(player, Resource);
    r.config = { ...r.config, onHeal: 0.5 };
    world.req(player, CombatStats).resourceGen = 0.2;
    r.current = 0;
    const friend = ally(world, 3, 0, 200);
    world.req(friend, Health).current = 100;
    healAlly(world, ctx, player, friend, 50);
    expect(r.current).toBeCloseTo(12.5 * 1.2, 5);
  });
});

describe('balance pass (G001-G008)', () => {
  const effectOf = (id: string, mods: Parameters<typeof compileSkill>[2] = []) => compileSkill(id, 1, mods).def.effect;

  it('Magnus Exorcismus never pulses faster than the floor, however many interval mods stack', () => {
    const e = effectOf('lightbearer.magnus_exorcismus', [
      { op: 'mul', field: 'interval', value: -0.2 },
      { op: 'mul', field: 'interval', value: -0.3 },
      { op: 'mul', field: 'interval', value: -0.3 },
    ]);
    expect(e.kind === 'sanctum' && e.interval).toBeGreaterThanOrEqual(SANCTUM_MIN_INTERVAL);
    expect(e.kind === 'sanctum' && e.interval).toBe(SANCTUM_MIN_INTERVAL);
    // The Rapid node plus the zealot passive alone leave it above the floor, and still faster than the base.
    const rapid = effectOf('lightbearer.magnus_exorcismus', [{ op: 'mul', field: 'interval', value: -0.4 }]);
    expect(rapid.kind === 'sanctum' && rapid.interval).toBeCloseTo(0.48, 5);
  });

  it('keeps two Magnus sigils at most: the third cast removes the oldest', () => {
    const { world, ctx, player } = setup(['lightbearer.magnus_exorcismus']);
    const user = world.req(player, SkillUser);
    const born: Entity[] = [];
    for (let i = 0; i < 4; i++) {
      world.req(player, Resource).current = 100;
      user.cooldowns['lightbearer.magnus_exorcismus'] = 0;
      cast(world, ctx, player, 0, 4 + i, 0, 45); // four casts in three seconds
      born.push(...world.query(Sanctum).filter((e) => !born.includes(e)));
      expect(world.query(Sanctum).length).toBeLessThanOrEqual(2);
    }
    const live = world.query(Sanctum).filter((e) => world.req(e, Sanctum).remaining > 0);
    expect(live).toHaveLength(2);
    expect(live).not.toContain(born[0]);
  });

  it('a second Sanctuary replaces the first: one zone, and the same healing per second', () => {
    const { world, ctx, player } = setup(['lightbearer.sanctuary']);
    const friend = ally(world, 3, 0, 1000);
    world.req(friend, Health).current = 100;
    const user = world.req(player, SkillUser);
    cast(world, ctx, player, 0, 0, 5, 40);
    user.cooldowns['lightbearer.sanctuary'] = 0;
    cast(world, ctx, player, 0, 0, 5, 40);
    expect(world.query(Sanctum)).toHaveLength(1);
    const before = hp(world, friend);
    let pulsesSeen = 0;
    const sanctum = world.query(Sanctum)[0]!;
    const start = world.req(sanctum, Sanctum).pulses;
    run(world, ctx, SYSTEMS, 60 * 3);
    pulsesSeen = world.req(sanctum, Sanctum).pulses - start;
    expect(hp(world, friend) - before).toBeCloseTo(pulsesSeen * 1000 * 0.04, 0); // one zone's worth, not two
  });

  it('Sanctuary duration bonuses (Halo, enhancement, Hallowed) stop at 2.5x', () => {
    const e = effectOf('lightbearer.sanctuary', [
      { op: 'mul', field: 'duration', value: 1 },
      { op: 'mul', field: 'duration', value: 0.3 },
      { op: 'mul', field: 'duration', value: 0.4 },
    ]);
    expect(e.kind === 'sanctum' && e.duration).toBeLessThanOrEqual(17.5);
    expect(e.kind === 'sanctum' && e.duration).toBeCloseTo(17.5, 5);
    const plain = effectOf('lightbearer.sanctuary', [{ op: 'mul', field: 'duration', value: 0.3 }]);
    expect(plain.kind === 'sanctum' && plain.duration).toBeCloseTo(9.1, 5); // below the cap: untouched
  });

  it('D01: Halo of the Penitent keeps Sanctuary up at most 35 % of the time (was 47 %)', () => {
    const halo = UNIQUE_DEFS.get('halo_of_the_penitent')!;
    const mods = halo.effects.flatMap((e) => (e.kind === 'skillMod' && e.skill === 'lightbearer.sanctuary' ? e.mods : []));
    const c = compileSkill('lightbearer.sanctuary', 1, mods as Parameters<typeof compileSkill>[2]).def;
    expect(c.effect.kind).toBe('sanctum');
    const duration = c.effect.kind === 'sanctum' ? c.effect.duration : 0;
    expect(duration / effectiveCooldown(c, 0)).toBeLessThanOrEqual(0.351);
    expect(duration / effectiveCooldown(c, 0)).toBeGreaterThan(0.25); // still a strong item, not a nerf to nothing
  });

  it('Benediction cannot come back sooner than 30 s, whatever the reductions', () => {
    const c = compileSkill('lightbearer.benediction', 1, [{ op: 'mul', field: 'cooldown', value: -0.7 }]).def;
    expect(c.cooldown).toBeCloseTo(18, 5);
    expect(effectiveCooldown(c, 0.5)).toBeGreaterThanOrEqual(30);
    // And the cooldown a real cast starts is the floored one.
    const { world, ctx, player } = setup(['lightbearer.benediction']);
    world.req(player, CombatStats).cooldownReduction = 0.5;
    cast(world, ctx, player, 0, 0, 5, 30);
    expect(world.req(player, SkillUser).cooldowns['lightbearer.benediction']).toBeGreaterThan(28);
    // Unreduced skills are unchanged.
    expect(effectiveCooldown({ cooldown: 14 }, 0.5)).toBeCloseTo(7, 5);
  });

  it('Lightbearer damage keeps a base: the corrupted bonus is under 2x on every skill', () => {
    const muls: number[] = [];
    for (const [id, def] of SKILLS) {
      if (!id.startsWith('lightbearer.')) continue;
      const e = def.effect;
      if (e.kind === 'meleeArc' || e.kind === 'projectile') muls.push(e.corruptedMul);
      if (e.kind === 'sanctum' && e.impact) muls.push(e.impact.corruptedMul);
      if (e.kind === 'guardian') muls.push(e.bolt.corruptedMul);
    }
    expect(Math.max(...muls)).toBeLessThanOrEqual(1.6);
  });

  it('Holy Light is a real basic attack', () => {
    const hl = SKILLS.get('lightbearer.holy_light')!;
    const e = hl.effect;
    if (e.kind !== 'projectile') throw new Error('Holy Light is a projectile');
    const perSecond = e.coefficient / (hl.castTime + hl.recovery);
    expect(perSecond).toBeGreaterThanOrEqual(2.1);
    expect(perSecond).toBeLessThan(2.71); // still under Quick Shot
    expect(e.homing).toBeDefined();
  });

  it('Heal costs enough that it is not free sustain', () => {
    const heal = SKILLS.get('lightbearer.heal')!;
    expect(heal.resourceCost).toBe(35);
    expect(heal.cooldown).toBe(2.5);
    const gain = (id: string) => SKILLS.get(id)!.resourceGain;
    expect(gain('lightbearer.holy_light')).toBe(3);
    expect(gain('lightbearer.censer_strike')).toBe(4);
  });

  it('Guardian Light bolts burst in 1.5 m and hit a group', () => {
    const g = effectOf('lightbearer.guardian_light');
    expect(g.kind === 'guardian' && g.explodeRadius).toBe(1.5);
    expect(g.kind === 'guardian' && g.bolt.coefficient).toBeCloseTo(0.7, 5);
    expect(g.kind === 'guardian' && g.attackCooldown).toBeCloseTo(0.8, 5);
    const { world, ctx, player } = setup(['lightbearer.guardian_light']);
    world.req(player, Resource).current = 100;
    cast(world, ctx, player, 0, 0, 5, 70);
    const target = tough(world, spawnEnemy(world, 'infected_colonist', 6, 0));
    const neighbour = tough(world, spawnEnemy(world, 'infected_colonist', 6.8, 0.8));
    const far = tough(world, spawnEnemy(world, 'infected_colonist', 6, 9));
    run(world, ctx, SYSTEMS, 240);
    expect(hp(world, target)).toBeLessThan(10000);
    expect(hp(world, neighbour)).toBeLessThan(10000); // splash
    expect(hp(world, far)).toBe(10000);
  });
});
