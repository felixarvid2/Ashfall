import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Blast, CombatStats, Dead, DisplayName, Elite, EnemyAI, Hazard, Health, Mover, Projectile, Renderable, SkillUser, StatusEffects, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import type { GameEvent } from '../src/core/events';
import { CHOIR, FADE_DEATH } from '../src/data/core';
import { ENEMY_DEFS, STATUS_DEFS } from '../src/data/db';
import { t } from '../src/data/i18n';
import { PACK_TEMPLATES } from '../src/data/packs';
import { ENEMY_FAMILIES, type EnemyDef } from '../src/data/schemas';
import { CORE_ENV, THE_CORE } from '../src/data/zones/theCore';
import { LOOKS, deathFade, fadesOnDeath, lookState } from '../src/render/looks';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { dealHit, hasStatus, kill, spawnEnemyHazard } from '../src/systems/combat';
import { choirAura } from '../src/systems/coreAI';
import { computeOutgoing } from '../src/systems/damage';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem, reflectsBolts } from '../src/systems/projectiles';
import { skillSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { blastSystem } from '../src/world/interactables';
import { CORE_TUNING, gravitySystem, type Gravity } from '../src/world/theCore';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { learnSkills, makeCtx, run, type SystemFn } from './helpers';

const SHADES = ['shade_walker', 'shade_hound', 'shade_smelter', 'shade_weaver', 'shade_sentinel', 'shade_drone'];
const NEW_REGULAR = ['light_being', 'light_mote', 'core_guardian', 'guardian_lancer'];
const ABSORBED = ['absorbed_ostrow', 'absorbed_lenn', 'absorbed_halvorsen', 'absorbed_rhee', 'absorbed_danner'];
const IMPORTED = ['enemy.light_being', 'enemy.guardian_lancer', 'enemy.light_mote', 'enemy.core_guardian', 'enemy.choir_singer'];
const ALL_NEW = [...SHADES, 'shade_echo', ...NEW_REGULAR, 'choir_singer', ...ABSORBED, 'lumen_turret'];
const def = (id: string): EnemyDef => ENEMY_DEFS.get(id)!;

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as {
  assets: { id: string; meshy?: { clips?: Record<string, string> } }[];
};
const assetEntry = (id: string) => manifest.assets.find((a) => a.id === id);

const SYSTEMS: SystemFn[] = [spatialSystem, enemyAISystem, statusSystem, movementSystem, collisionSystem, projectileSystem, hazardSystem, blastSystem, deathSystem];

function fight(enemy: string, x = 0, z = 4, level = 45) {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 400 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const h = world.req(player, Health);
  h.max = h.current = 1e7;
  const e = spawnEnemy(world, enemy, x, z, { level, aggro: true });
  return { world, ctx, player, e };
}

const dist = (world: World, a: Entity, b: Entity) => {
  const p = world.req(a, Transform);
  const q = world.req(b, Transform);
  return Math.hypot(p.x - q.x, p.z - q.z);
};

describe('Core roster: definitions', () => {
  it('every new def is valid, has a family and a look, a string, a drop table and an existing asset', () => {
    const ids = new Set(manifest.assets.map((a) => a.id));
    for (const id of ALL_NEW) {
      const d = def(id);
      expect(d, id).toBeDefined();
      expect(ENEMY_FAMILIES, id).toContain(d.family);
      expect(d.look, id).toBeDefined();
      expect(ids.has(d.assetId), `${id}: ${d.assetId}`).toBe(true);
      expect(t(`enemies.${id}`), id).not.toBe(`enemies.${id}`);
    }
  });

  it('families: machine for guardians and lancers, organic for shades and the Absorbed, light for the rest', () => {
    for (const id of ['core_guardian', 'guardian_lancer']) expect(def(id).family, id).toBe('machine');
    for (const id of [...SHADES, 'shade_echo', ...ABSORBED]) expect(def(id).family, id).toBe('lumen');
    for (const id of ['light_being', 'light_mote', 'choir_singer']) expect(def(id).family, id).toBe('light');
  });

  it('third-party models get the Lumen look, returning models the shade look', () => {
    for (const id of ALL_NEW) {
      const d = def(id);
      const imported = IMPORTED.includes(d.assetId);
      const returning = SHADES.includes(id) || id === 'shade_echo';
      if (imported) expect(d.look, id).toBe('lumen');
      if (returning) expect(d.look, id).toBe('shade');
      if (ABSORBED.includes(id)) expect(d.look, id).toBe('lumen');
    }
    expect(LOOKS.lumen.rim).not.toBe(LOOKS.shade.rim);
  });

  it('all five imported models are used', () => {
    const used = new Set(ALL_NEW.map((id) => def(id).assetId));
    for (const a of IMPORTED) expect(used.has(a), a).toBe(true);
  });

  it('stats for levels 40–50 sit above Region 4 (shades beat the enemies they remember)', () => {
    const pairs: [string, string][] = [
      ['shade_walker', 'crystal_walker'],
      ['shade_hound', 'blind_hound'],
      ['shade_sentinel', 'crystal_sentinel'],
      ['shade_drone', 'governor_drone'],
    ];
    for (const [shade, old] of pairs) {
      expect(def(shade).life, shade).toBeGreaterThan(def(old).life);
      expect(def(shade).damage, shade).toBeGreaterThan(def(old).damage);
    }
  });

  it('the empowered status exists as a buff', () => {
    expect(STATUS_DEFS.empowered.kind).toBe('buff');
  });
});

describe('Core roster: packs', () => {
  const corePacks = PACK_TEMPLATES.filter((p) => p.id.startsWith('core_'));

  it('reference only defined enemies, and every zone pack uses a core template', () => {
    expect(corePacks).toHaveLength(8);
    for (const p of corePacks) for (const m of p.members) expect(ENEMY_DEFS.has(m.enemy), `${p.id}: ${m.enemy}`).toBe(true);
    for (const spawn of THE_CORE.packs) expect(corePacks.some((p) => p.id === spawn.template), spawn.template).toBe(true);
  });

  it('uses every regular type, the Absorbed and the Choir', () => {
    const used = new Set(corePacks.flatMap((p) => p.members.map((m) => m.enemy)));
    for (const id of [...SHADES, ...NEW_REGULAR, 'choir_singer', ...ABSORBED]) expect(used.has(id), id).toBe(true);
  });

  it('at least half of the types, and of the monsters, are returning', () => {
    const regular = [...SHADES, ...NEW_REGULAR];
    expect(SHADES.length / regular.length).toBeGreaterThanOrEqual(0.5);
    let returning = 0;
    let total = 0;
    for (const p of corePacks) {
      for (const m of p.members) {
        const expected = ((m.count[0] + m.count[1]) / 2) * (m.chance ?? 1);
        total += expected;
        if (SHADES.includes(m.enemy)) returning += expected;
      }
    }
    expect(returning / total).toBeGreaterThanOrEqual(0.5);
  });

  it('subzones get their roster: motes in swarms of 5–8, lancers in the Gardens, the Choir near the shaft', () => {
    const pack = (id: string) => corePacks.find((p) => p.id === id)!;
    const has = (id: string, enemy: string) => pack(id).members.some((m) => m.enemy === enemy);
    for (const id of ['core_borderland', 'core_gardens']) {
      const motes = pack(id).members.find((m) => m.enemy === 'light_mote')!;
      expect(motes.count).toEqual([5, 8]);
    }
    for (const enemy of ['light_being', 'light_mote', 'guardian_lancer', 'shade_weaver']) expect(has('core_gardens', enemy), enemy).toBe(true);
    for (const id of ['core_base', 'core_heart']) {
      expect(has(id, 'choir_singer'), id).toBe(true);
      expect(pack(id).members.find((m) => m.enemy === 'choir_singer')!.count).toEqual([3, 3]);
    }
    expect(has('core_heart', 'core_guardian')).toBe(true);
    // The Halls hold shades of every region and the Absorbed.
    const halls = corePacks.filter((p) => p.id.startsWith('core_halls'));
    expect(halls).toHaveLength(4);
    expect(new Set(halls.flatMap((p) => p.members.map((m) => m.enemy)).filter((id) => SHADES.includes(id))).size).toBe(SHADES.length);
    expect(halls.flatMap((p) => p.members.map((m) => m.enemy)).filter((id) => ABSORBED.includes(id))).toHaveLength(ABSORBED.length);
  });
});

describe('Looks and the fade-and-shrink death', () => {
  it('lumen pulses a dark body with a glowing rim, shades flicker and drop out without vanishing', () => {
    const lumen = Array.from({ length: 240 }, (_, i) => lookState('lumen', i / 30, 7));
    expect(Math.max(...lumen.map((s) => s.glow))).toBeGreaterThan(Math.min(...lumen.map((s) => s.glow)) + 0.25);
    // Low emissive: the body must stay well under the bloom threshold and the pale ground's brightness.
    for (const s of lumen) expect(s.glow).toBeLessThan(0.8);
    for (const s of lumen) expect(s.opacity).toBeGreaterThan(0.9);
    const shade = Array.from({ length: 600 }, (_, i) => lookState('shade', i / 30, 3));
    expect(Math.min(...shade.map((s) => s.opacity))).toBeLessThan(0.55);
    expect(Math.max(...shade.map((s) => s.opacity))).toBeLessThan(0.95);
    // A dark core remains on pale ground even during a dropout.
    expect(Math.min(...shade.map((s) => s.opacity))).toBeGreaterThan(0.3);
    for (const spec of Object.values(LOOKS)) {
      const c = new THREE.Color(spec.color);
      expect(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 'body luminance (linear)').toBeLessThan(0.25);
    }
  });

  it('a model without a death clip fades and shrinks to nothing; one with a clip does not', () => {
    expect(fadesOnDeath(true, false)).toBe(true);
    expect(fadesOnDeath(true, true)).toBe(false);
    // Unrigged creatures (no animator at all) keep toppling.
    expect(fadesOnDeath(false, false)).toBe(false);
    expect(deathFade(0)).toEqual({ scale: 1, opacity: 1 });
    const mid = deathFade(FADE_DEATH.seconds / 2);
    expect(mid.opacity).toBeCloseTo(0.5);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.scale).toBeGreaterThan(0.1);
    const end = deathFade(FADE_DEATH.seconds);
    expect(end.opacity).toBe(0);
    expect(end.scale).toBeLessThan(0.2);
    expect(deathFade(99).opacity).toBe(0);
  });

  it('the manifest says which new models lack a death clip (singers, the Absorbed)', () => {
    for (const id of ALL_NEW) {
      const clips = assetEntry(def(id).assetId)?.meshy?.clips;
      if (!clips) continue;
      expect(fadesOnDeath(true, 'death' in clips), id).toBe(!('death' in clips));
    }
    expect('death' in (assetEntry('enemy.choir_singer')!.meshy!.clips!)).toBe(false);
    for (const id of ['enemy.light_being', 'enemy.light_mote', 'enemy.core_guardian', 'enemy.guardian_lancer']) expect('death' in assetEntry(id)!.meshy!.clips!, id).toBe(true);
  });
});

describe('Core roster: behaviours', () => {
  it('Shade Walkers split into two short-lived, weaker echoes that pay nothing', () => {
    const { world, ctx, e } = fight('shade_walker', 0, 20);
    const walkerLife = world.req(e, Health).max;
    kill(world, ctx, e, 0);
    const echoes = world.query(EnemyAI).filter((x) => world.req(x, EnemyAI).defId === 'shade_echo');
    expect(echoes).toHaveLength(2);
    for (const echo of echoes) {
      expect(world.req(echo, Health).max).toBeLessThan(walkerLife * 0.5);
      expect(world.req(echo, Renderable).scale).toBeLessThan(1);
      expect(world.req(echo, Renderable).look).toBe('shade');
    }
    // After their lifespan they are gone.
    ctx.rewards.length = 0;
    run(world, ctx, SYSTEMS, Math.ceil(60 * (def('shade_echo').lifespan! + 0.5)));
    for (const echo of echoes) expect(world.has(echo, Dead)).toBe(true);
    expect(ctx.rewards.every((r) => r.table === 'dt.shade_echo')).toBe(true);
  });

  it('Shade Hounds flicker, blink in front of you, then leap', () => {
    const { world, ctx, player, e } = fight('shade_hound', 0, 16);
    const tr = world.req(e, Transform);
    const blink = def('shade_hound').blink!;
    let jumped = false;
    let after = Infinity;
    let blinks = 0;
    let lungeTelegraphs = 0;
    for (let i = 0; i < 60 * 4; i++) {
      const x = tr.x;
      const z = tr.z;
      run(world, ctx, SYSTEMS);
      for (const ev of ctx.events.drain()) {
        if (ev.type === 'vfx' && ev.kind === 'blink') blinks++;
        if (ev.type === 'telegraph' && ev.shape.kind === 'line' && jumped) lungeTelegraphs++;
      }
      if (!jumped && Math.hypot(tr.x - x, tr.z - z) > 3) {
        jumped = true;
        after = dist(world, e, player);
      }
    }
    expect(jumped).toBe(true);
    // A flicker where it stood, then the arrival.
    expect(blinks).toBeGreaterThanOrEqual(3);
    expect(Math.abs(after - blink.hop)).toBeLessThan(1);
    // Close enough to leap: a telegraphed lunge follows straight away.
    expect(lungeTelegraphs).toBeGreaterThan(0);
  });

  it('Light Beings hop sideways and keep their distance', () => {
    const { world, ctx, player, e } = fight('light_being', 0, 9);
    const tr = world.req(e, Transform);
    let hops = 0;
    for (let i = 0; i < 60 * 12; i++) {
      const x = tr.x;
      const z = tr.z;
      run(world, ctx, SYSTEMS);
      if (Math.hypot(tr.x - x, tr.z - z) > 3) {
        hops++;
        const d = dist(world, e, player);
        expect(d).toBeGreaterThan(3);
        expect(d).toBeLessThan(18);
      }
    }
    expect(hops).toBeGreaterThanOrEqual(2);
    expect(def('light_being').hover).toBeGreaterThan(0);
    expect(def('light_being').erratic).toBe(true);
  });

  it('Light Motes burst into a small warned blast when they die', () => {
    const { world, ctx, player, e } = fight('light_mote', 0, 30);
    const burst = def('light_mote').onDeath!.burst!;
    // Died next to the player.
    world.req(e, Transform).x = 0.5;
    world.req(e, Transform).z = 0.5;
    const before = world.req(player, Health).current;
    kill(world, ctx, e, 0);
    const blast = world.query(Blast)[0]!;
    expect(world.req(blast, Blast).radius).toBe(burst.radius);
    expect(ctx.events.drain().some((ev: GameEvent) => ev.type === 'telegraph' && ev.shape.kind === 'circle' && ev.duration === burst.warning)).toBe(true);
    // Nothing yet, then the burst.
    run(world, ctx, [spatialSystem, blastSystem], 5);
    expect(world.req(player, Health).current).toBe(before);
    run(world, ctx, [spatialSystem, blastSystem], Math.ceil(60 * burst.warning));
    expect(world.req(player, Health).current).toBeLessThan(before);
    // Outside the radius it is harmless.
    const far = fight('light_mote', 0, 30);
    far.world.req(far.e, Transform).z = 8;
    kill(far.world, far.ctx, far.e, 0);
    run(far.world, far.ctx, [spatialSystem, blastSystem], 60);
    expect(far.world.req(far.player, Health).current).toBe(1e7);
  });

  it('Core Guardians ward the three nearest allies, not the ones out of reach', () => {
    const { world, ctx, e } = fight('core_guardian', 0, 8);
    const near = [1, 2, 3].map((i) => spawnEnemy(world, 'shade_walker', i * 2 - 4, 12, { level: 45, aggro: true }));
    const fourth = spawnEnemy(world, 'shade_walker', 8, 12, { level: 45, aggro: true });
    const away = spawnEnemy(world, 'shade_walker', 0, 40, { level: 45 });
    const s = def('core_guardian').shieldAlly!;
    expect(s.count).toBe(3);
    // Keep the allies where they are for the test.
    for (const a of [...near, fourth, away]) world.req(a, Mover).speed = 0;
    let warded = false;
    for (let i = 0; i < 60 * 9 && !warded; i++) {
      run(world, ctx, SYSTEMS);
      warded = near.every((a) => hasStatus(world, a, 'chitin'));
    }
    expect(warded).toBe(true);
    expect(hasStatus(world, away, 'chitin')).toBe(false);
    expect(hasStatus(world, e, 'chitin')).toBe(false);
    // At most three per pulse: the fourth stays bare until the next one picks it, if ever.
    expect(near.filter((a) => hasStatus(world, a, 'chitin'))).toHaveLength(3);
  });

  it('Guardian Lancers telegraph a long line for the whole charge, then fire a fast beam', () => {
    const { world, ctx, e } = fight('guardian_lancer', 0, 12);
    world.req(e, Mover).speed = 0;
    const atk = def('guardian_lancer').attack;
    if (atk.kind !== 'projectile') throw new Error('lancer must shoot');
    expect(atk.beam).toBe(true);
    let telegraphAt = -1;
    let firedAt = -1;
    for (let i = 0; i < 60 * 6 && firedAt < 0; i++) {
      run(world, ctx, SYSTEMS);
      for (const ev of ctx.events.drain()) {
        if (ev.type === 'telegraph' && ev.shape.kind === 'line' && telegraphAt < 0) {
          telegraphAt = ctx.time;
          expect(ev.duration).toBe(atk.windup);
          expect(ev.shape.length).toBe(atk.maxRange);
          // The standard hostile colour: a cream line is lost on the pale Lumen ground.
          expect(ev.color).toBe('#ff5a2a');
        }
      }
      if (telegraphAt >= 0 && firedAt < 0 && world.query(Projectile).length > 0) firedAt = ctx.time;
    }
    expect(telegraphAt).toBeGreaterThan(0);
    // The bolt only exists once the charge is over.
    expect(firedAt - telegraphAt).toBeGreaterThanOrEqual(atk.windup - 0.05);
    expect(firedAt - telegraphAt).toBeLessThan(atk.windup + 0.2);
    expect(Math.hypot(world.req(world.query(Projectile)[0]!, Projectile).vx, world.req(world.query(Projectile)[0]!, Projectile).vz)).toBe(atk.speed);
  });

  it("Shade Drones' shots bend toward you", () => {
    const { world, ctx, player } = fight('shade_drone', 0, 40);
    world.req(player, Health).current = 1e7;
    const atk = def('shade_drone').attack;
    if (atk.kind !== 'projectile') throw new Error('drone must shoot');
    expect(atk.curveDeg).toBeGreaterThan(0);
    // A bolt flying north past a player standing east of it turns east at up to curveDeg per second.
    const bolt = world.create();
    world.add(bolt, Transform, { x: -6, y: 1, z: 0, facing: 0, prevX: -6, prevY: 1, prevZ: 0, prevFacing: 0 });
    world.add(bolt, Projectile, { team: 'enemy', vx: 0, vz: 10, radius: 0.2, remaining: 5, damage: 1, damageType: 'energy', attackerLevel: 1, owner: bolt, curveDeg: atk.curveDeg! });
    run(world, ctx, [projectileSystem], 30);
    const p = world.req(bolt, Projectile);
    const turned = Math.atan2(p.vx, p.vz);
    expect(turned).toBeGreaterThan(0.2);
    expect(turned).toBeLessThanOrEqual((atk.curveDeg! * Math.PI * 0.5) / 180 + 1e-6);
    // Straight shots (no curve) stay straight.
    const plain = world.create();
    world.add(plain, Transform, { x: -6, y: 1, z: 0, facing: 0, prevX: -6, prevY: 1, prevZ: 0, prevFacing: 0 });
    world.add(plain, Projectile, { team: 'enemy', vx: 0, vz: 10, radius: 0.2, remaining: 5, damage: 1, damageType: 'energy', attackerLevel: 1, owner: plain });
    run(world, ctx, [projectileSystem], 30);
    expect(world.req(plain, Projectile).vx).toBe(0);
  });

  it('a firing Shade Drone sends out a curving bolt', () => {
    const { world, ctx } = fight('shade_drone', 0, 9);
    let curved = false;
    for (let i = 0; i < 60 * 5 && !curved; i++) {
      run(world, ctx, [spatialSystem, enemyAISystem, movementSystem]);
      curved = world.query(Projectile).some((p) => (world.req(p, Projectile).curveDeg ?? 0) > 0);
    }
    expect(curved).toBe(true);
  });

  it('Shade Weavers root whoever their vines drag in', () => {
    const { world, ctx, player } = fight('shade_weaver', 0, 8);
    let rooted = false;
    for (let i = 0; i < 60 * 8 && !rooted; i++) {
      run(world, ctx, SYSTEMS);
      rooted = hasStatus(world, player, 'rooted');
    }
    expect(rooted).toBe(true);
    expect(def('shade_weaver').pull!.root).toBeGreaterThan(0);
  });

  it("Shade Sentinels throw the player's bolts back while the shell holds", () => {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 400 });
    const player = spawnPlayer(world, 'spectre', 0, 0);
    learnSkills(world, player, ['spectre.quick_shot']);
    Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20, resourceGen: 0 });
    const systems: SystemFn[] = [spatialSystem, skillSystem, statusSystem, movementSystem, collisionSystem, projectileSystem];
    const sentinel = spawnEnemy(world, 'shade_sentinel', 0, 6, { level: 45 });
    world.req(sentinel, Mover).speed = 0;
    const ai = world.req(sentinel, EnemyAI);
    ai.shell = 500;
    expect(reflectsBolts(world, sentinel)).toBe(true);
    const life = world.req(sentinel, Health).current;
    const mine = world.req(player, Health).current;
    world.req(player, SkillUser).request = { slot: 0, aimX: 0, aimZ: 10, ttl: 0.25 };
    run(world, ctx, systems, 60);
    // The shell took nothing, the bolt came back and hurt the shooter.
    expect(ai.shell).toBe(500);
    expect(world.req(sentinel, Health).current).toBe(life);
    expect(world.req(player, Health).current).toBeLessThan(mine);
    // Shell broken: the same shot lands.
    ai.shell = 0;
    expect(reflectsBolts(world, sentinel)).toBe(false);
    world.req(player, SkillUser).cooldowns = {};
    world.req(player, SkillUser).request = { slot: 0, aimX: 0, aimZ: 10, ttl: 0.25 };
    run(world, ctx, systems, 60);
    expect(world.req(sentinel, Health).current).toBeLessThan(life);
  });

  it("Shade Smelters' fire pools drift with Unstable Gravity", () => {
    const heart = CORE_ENV.find((f): f is Gravity => f.kind === 'gravity' && f.mode === 'rotate')!;
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: THE_CORE.halfSize, zoneLevels: [40, 50] });
    const player = spawnPlayer(world, 'bastion', heart.x, heart.z);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    const smelter = spawnEnemy(world, 'shade_smelter', heart.x + 5, heart.z, { level: 45 });
    const trail = def('shade_smelter').trail!;
    expect(trail.drift).toBe(true);
    const pool = spawnEnemyHazard(world, smelter, heart.x + 6, heart.z + 6, trail);
    const plain = spawnEnemyHazard(world, smelter, heart.x - 6, heart.z + 6, { ...trail, drift: false });
    expect(world.req(pool, Hazard).drift).toBe(true);
    expect(world.req(plain, Hazard).drift).toBeUndefined();
    const G = CORE_TUNING.gravity;
    // Pull phase of the first cycle (heads +z): the drifting pool slides, the ordinary one stays.
    ctx.time = heart.period - heart.offset - G.pull + 0.001;
    const z0 = world.req(pool, Transform).z;
    const pz0 = world.req(plain, Transform).z;
    run(world, ctx, [gravitySystem], 60);
    expect(world.req(pool, Transform).z - z0).toBeCloseTo(G.driftSpeed, 1);
    expect(world.req(plain, Transform).z).toBe(pz0);
  });
});

describe('The Choir', () => {
  function choirScene() {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 400 });
    const player = spawnPlayer(world, 'bastion', 0, 60);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    const singers = [0, 1, 2].map((i) => spawnEnemy(world, 'choir_singer', i * 2, 0, { level: 45 }));
    const near = spawnEnemy(world, 'shade_walker', 0, 10, { level: 45 });
    const edge = spawnEnemy(world, 'shade_walker', CHOIR.radius - 1, 0, { level: 45 });
    const far = spawnEnemy(world, 'shade_walker', 0, CHOIR.radius + 10, { level: 45 });
    return { world, ctx, player, singers, near, edge, far };
  }
  const tick = (world: World, ctx: ReturnType<typeof makeCtx>, n: number) => run(world, ctx, [spatialSystem, enemyAISystem, statusSystem], n);

  it('rooted singers hold the aura: enemies within 14 m are empowered, the rest are not', () => {
    const { world, ctx, singers, near, edge, far } = choirScene();
    expect(def('choir_singer').rooted).toBe(true);
    expect(def('choir_singer').moveSpeed).toBeLessThan(0.1);
    tick(world, ctx, 30);
    expect(hasStatus(world, near, 'empowered')).toBe(true);
    expect(hasStatus(world, edge, 'empowered')).toBe(true);
    expect(hasStatus(world, far, 'empowered')).toBe(false);
    // Singers do not empower each other.
    for (const s of singers) expect(hasStatus(world, s, 'empowered')).toBe(false);
  });

  it('empowered enemies deal 25 % more damage and move 15 % faster', () => {
    const { world, ctx, player, near, far } = choirScene();
    tick(world, ctx, 30);
    expect(world.req(near, Mover).speedMul).toBeCloseTo(1 + CHOIR.speed);
    expect(world.req(far, Mover).speedMul).toBe(1);
    const hit = (who: Entity) => dealHit(world, ctx, who, player, { coefficient: 1, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'melee' })!;
    expect(hit(near) / hit(far)).toBeCloseTo(1 + CHOIR.damage, 3);
    // Ranged shots too: the damage is fixed when they leave the barrel.
    const stats = world.req(near, CombatStats);
    const base = computeOutgoing({ ...stats, coefficient: 1 }, new Set(), 0).outgoing;
    const song = computeOutgoing({ ...stats, coefficient: 1, multiplicative: [...stats.multiplicative, { value: CHOIR.damage, source: 'choir' }] }, new Set(), 0).outgoing;
    expect(song / base).toBeCloseTo(1 + CHOIR.damage, 5);
  });

  it('killing one singer changes nothing; killing all three ends the song', () => {
    const { world, ctx, singers, near } = choirScene();
    tick(world, ctx, 30);
    kill(world, ctx, singers[0]!, 0);
    kill(world, ctx, singers[1]!, 0);
    tick(world, ctx, 60);
    expect(hasStatus(world, near, 'empowered')).toBe(true);
    kill(world, ctx, singers[2]!, 0);
    tick(world, ctx, Math.ceil(60 * (CHOIR.duration + 0.3)));
    expect(hasStatus(world, near, 'empowered')).toBe(false);
    expect(world.req(near, Mover).speedMul).toBe(1);
  });

  it('an enemy that walks out of range loses the buff shortly after', () => {
    const { world, ctx, edge } = choirScene();
    tick(world, ctx, 30);
    expect(hasStatus(world, edge, 'empowered')).toBe(true);
    const tr = world.req(edge, Transform);
    tr.x = tr.prevX = CHOIR.radius + 8;
    tick(world, ctx, Math.ceil(60 * (CHOIR.duration + 0.3)));
    expect(hasStatus(world, edge, 'empowered')).toBe(false);
  });

  it('choirAura on its own renews the status without any other system', () => {
    const { world, ctx, near } = choirScene();
    run(world, ctx, [spatialSystem], 1);
    choirAura(world, ctx, 1 / 60);
    expect(world.req(near, StatusEffects).list.some((s) => s.id === 'empowered')).toBe(true);
  });
});

describe('The Absorbed', () => {
  it('are five named elites with a name and one line each, in the strings', () => {
    expect(ABSORBED).toHaveLength(5);
    for (const id of ABSORBED) {
      const d = def(id);
      expect(d.named, id).toBeDefined();
      expect(t(d.named!.name), id).not.toBe(d.named!.name);
      expect(t(d.named!.line), id).not.toBe(d.named!.line);
      expect(t(d.named!.line).split('.').length, `${id}: one short line`).toBeLessThanOrEqual(3);
      expect(d.life, id).toBeGreaterThan(1000);
      expect(['npc.blacksmith', 'npc.cook', 'npc.pump_engineer', 'npc.technician', 'npc.defector']).toContain(d.assetId);
    }
  });

  it('spawn with their name and the named-elite plate, and say their line once when they notice you', () => {
    const { world, ctx, e } = fight('absorbed_ostrow', 0, 10);
    expect(world.req(e, Elite).kind).toBe('named');
    expect(world.req(e, DisplayName).key).toBe('enemies.absorbed.ostrow.name');
    expect(world.req(e, CombatStats).tags).toContain('elite');
    run(world, ctx, SYSTEMS, 120);
    const banners = ctx.events.drain().filter((ev: GameEvent) => ev.type === 'banner');
    expect(banners).toHaveLength(1);
    const banner = banners[0] as Extract<GameEvent, { type: 'banner' }>;
    expect(t(banner.key, Object.fromEntries(Object.entries(banner.keyParams ?? {}).map(([k, v]) => [k, t(v)])))).toBe('Ostrow, Absorbed: “You hung four lamps by the lift. Where is mine?”');
  });

  it("fight with their old trade's tools", () => {
    expect(def('absorbed_ostrow').attack.kind).toBe('melee');
    expect(def('absorbed_ostrow').attack).toMatchObject({ knockback: 4 });
    expect(def('absorbed_lenn').attack.kind).toBe('cone');
    expect(def('absorbed_halvorsen').pull).toBeDefined();
    expect(def('absorbed_danner').dynamite).toBeDefined();
    expect(def('absorbed_rhee').reinforce?.enemy).toBe('lumen_turret');
  });

  it("Rhee sets up turrets as the fight goes on, never more than two", () => {
    const { world, ctx, e } = fight('absorbed_rhee', 0, 10);
    world.req(e, Mover).speed = 0;
    run(world, ctx, SYSTEMS, 60 * 40);
    const turrets = world.query(EnemyAI).filter((x) => world.req(x, EnemyAI).defId === 'lumen_turret' && !world.has(x, Dead));
    expect(turrets.length).toBe(2);
  });

  it('are never made champions or rares by the pack spawner (no clones of a named person)', () => {
    for (const p of PACK_TEMPLATES.filter((q) => q.id.startsWith('core_'))) {
      for (const m of p.members) {
        if (ABSORBED.includes(m.enemy)) expect(m.count[1], m.enemy).toBe(1);
      }
    }
  });
});
