import { describe, expect, it } from 'vitest';
import { Boss, Collider, Dead, EnemyAI, Health, Hazard, Renderable, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import type { GameEvent } from '../src/core/events';
import { pickMusic, MENU_SCENE } from '../src/data/audio';
import { BOSS_SCRIPTS } from '../src/data/bosses';
import { ENEMY_DEFS } from '../src/data/db';
import { t } from '../src/data/i18n';
import { CREDIT_KEYS, LUMEN_CHOICE_FLAGS, epilogueKeys, lumenChoiceOf } from '../src/data/lumen';
import { LUMEN_HEART, THE_CORE } from '../src/data/zones/theCore';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem } from '../src/systems/projectiles';
import { statusSystem } from '../src/systems/status';
import { blastSystem } from '../src/world/interactables';
import { activeMemory, bossSystem } from '../src/systems/boss';
import { applyDamage, kill } from '../src/systems/combat';
import { createQuestRuntime } from '../src/systems/quests';
import { LUMEN_TUNING, chooseLumen, lumenCameraFocus, lumenGateSpots } from '../src/world/lumen';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from '../src/world/setPieces';
import { spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

const H = LUMEN_HEART;
const SYSTEMS = [spatialSystem, setPieceSystem, bossSystem];

function setup() {
  const world = new World();
  const zone = createZoneRuntime(THE_CORE);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [40, 50] });
  const player = spawnPlayer(world, 'bastion', H.x, H.z - 20);
  world.req(player, Health).max = world.req(player, Health).current = 1e9;
  syncSetPieces(world, zone);
  return { world, ctx, zone, player };
}

type Fight = ReturnType<typeof setup>;

/** Walk into the arena and let Lumen engage. */
function start(f: Fight) {
  run(f.world, f.ctx, SYSTEMS, 2);
  const st = f.zone.setPieces.lumen!;
  const boss = st.boss!;
  return { st, boss, b: f.world.req(boss, Boss), h: f.world.req(boss, Health) };
}

const events = (ctx: Fight['ctx']): GameEvent[] => [...ctx.events.peek()];
const defOf = (world: World, e: Entity) => world.req(e, EnemyAI).defId;

describe('Lumen: the arena', () => {
  it('stands rooted in the Heart behind a sealed ring of light columns, with the Heart music', () => {
    const f = setup();
    const { st, boss } = start(f);
    expect(st.state).toBe('fight');
    expect(defOf(f.world, boss)).toBe('lumen');
    expect(f.world.req(boss, Boss).script).toBe('lumen');
    const tr = f.world.req(boss, Transform);
    expect([tr.x, tr.z]).toEqual([H.x, H.z]);
    // Every gap between two columns is closed by their colliders.
    const spots = lumenGateSpots();
    expect(st.gates).toHaveLength(spots.length);
    const gap = Math.hypot(spots[0]!.x - spots[1]!.x, spots[0]!.z - spots[1]!.z);
    expect(gap).toBeLessThan(2 * LUMEN_TUNING.collider);
    for (const g of st.gates) expect(f.world.req(g, Collider).isStatic).toBe(true);
    expect(events(f.ctx).some((e) => e.type === 'banner' && e.key === 'bosses.lumen.intro')).toBe(true);
    const scene = { ...MENU_SCENE, phase: 'play' as const, zoneId: THE_CORE.id, bossEngaged: true };
    expect(pickMusic(scene)).toBe('music.boss_core');
  });

  it('leans the camera toward Lumen while it is fought, so the boss stays on screen', () => {
    const f = setup();
    const pt = f.world.req(f.player, Transform);
    // Before the fight: on the player.
    expect(lumenCameraFocus(f.world, f.zone, pt.x, pt.z)).toEqual({ x: pt.x, z: pt.z });
    start(f);
    const focus = lumenCameraFocus(f.world, f.zone, pt.x, pt.z);
    // 20 m away: half the way, capped; straight toward the boss, never past it.
    expect(focus.x).toBeCloseTo(pt.x);
    const lean = focus.z - pt.z;
    expect(lean).toBeCloseTo(Math.min(20 * LUMEN_TUNING.frameLean, LUMEN_TUNING.frameMax));
    expect(lean).toBeGreaterThan(3);
    expect(lean).toBeLessThanOrEqual(LUMEN_TUNING.frameMax);
  });

  it('has a string for every banner, memory and line it uses', () => {
    for (const ph of BOSS_SCRIPTS.lumen!) {
      if (ph.banner) expect(t(ph.banner), ph.banner).not.toBe(ph.banner);
      for (const m of ph.memories ?? []) {
        expect(t(m.banner), m.banner).not.toBe(m.banner);
        for (const s of m.shades) expect(ENEMY_DEFS.has(s.enemy), s.enemy).toBe(true);
      }
      if (ph.beat) expect(ph.beat.form.asset).toBe('npc.technician');
    }
    for (const k of ['bosses.lumen.speech', 'bosses.lumen.role', 'bosses.lumen.choice.listen', 'bosses.lumen.choice.fight', 'bosses.lumen.reply.listen', 'bosses.lumen.reply.fight', 'enemies.named.lumen', 'setPieces.lumen.defeated']) {
      expect(t(k), k).not.toBe(k);
    }
    // Phase 3: two to three lines of speech.
    expect(t('bosses.lumen.speech').split('\n').length).toBeGreaterThanOrEqual(2);
    expect(t('bosses.lumen.speech').split('\n').length).toBeLessThanOrEqual(3);
  });
});

describe('Lumen: phases by health', () => {
  it('follows life through four phases; the beat holds until the choice is made', () => {
    const f = setup();
    const { world, ctx, zone } = f;
    const { boss, b, h } = start(f);
    expect(b.phase).toBe(0);
    h.current = h.max * 0.75;
    run(world, ctx, SYSTEMS, 2);
    expect(b.phase).toBe(0);
    // Phase 1 -> 2: the memories begin.
    h.current = h.max * 0.65;
    run(world, ctx, SYSTEMS, 2);
    expect(b.phase).toBe(1);
    expect(b.memory).toBeDefined();
    expect(events(ctx).some((e) => e.type === 'banner' && e.key === 'bosses.lumen.phase2')).toBe(true);
    // Phase 3: a harmless shape stands before the player, Lumen cannot be hurt and nothing attacks.
    h.current = h.max * 0.35;
    run(world, ctx, SYSTEMS, 2);
    expect(b.phase).toBe(2);
    expect(b.memory).toBeUndefined();
    expect(b.damageTaken).toBe(0);
    expect(b.adds).toHaveLength(0);
    expect(b.form).toBeDefined();
    expect(world.req(b.form!, Renderable).assetId).toBe('npc.technician');
    expect(world.req(b.form!, Renderable).look).toBe('lumen');
    expect(events(ctx).filter((e) => e.type === 'beat')).toEqual([{ type: 'beat', id: 'lumen.choice' }]);
    const before = h.current;
    applyDamage(world, ctx, boss, 500, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' });
    expect(h.current).toBe(before);
    // Even at almost no life it stays in the beat.
    h.current = h.max * 0.05;
    run(world, ctx, SYSTEMS, 60 * 5);
    expect(b.phase).toBe(2);
    expect(world.query(Hazard)).toHaveLength(0);
    // The answer lets the fight go on: phase 4, core exposed (takes more damage), the shape gone.
    expect(chooseLumen(world, zone, 'fight')).toBe(true);
    run(world, ctx, SYSTEMS, 2);
    expect(b.phase).toBe(3);
    expect(b.damageTaken).toBeGreaterThan(1);
    expect(b.form).toBeUndefined();
    const left = h.current;
    applyDamage(world, ctx, boss, 100, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' });
    expect(left - h.current).toBeCloseTo(100 * b.damageTaken!, 3);
    expect(events(ctx).some((e) => e.type === 'banner' && e.key === 'bosses.lumen.phase4')).toBe(true);
  });

  it('a big hit never skips the beat', () => {
    const f = setup();
    const { b, h } = start(f);
    h.current = h.max * 0.1;
    run(f.world, f.ctx, SYSTEMS, 2);
    expect(b.phase).toBe(2);
    expect(chooseLumen(f.world, f.zone, 'listen')).toBe(true);
    run(f.world, f.ctx, SYSTEMS, 2);
    expect(b.phase).toBe(3);
  });

  it('phase 4 is a real fight: the drill sweep, fireballs, beams and tentacles run', () => {
    const f = setup();
    const { b, h } = start(f);
    h.current = h.max * 0.2;
    run(f.world, f.ctx, SYSTEMS, 2);
    chooseLumen(f.world, f.zone, 'fight');
    run(f.world, f.ctx, SYSTEMS, 2);
    const ph = BOSS_SCRIPTS.lumen![b.phase]!;
    expect(ph.sweep && ph.fireballs && ph.beams && ph.tentacles).toBeTruthy();
    run(f.world, f.ctx, SYSTEMS, 60 * 15);
    const kinds = new Set(events(f.ctx).filter((e) => e.type === 'telegraph').map((e) => (e.type === 'telegraph' ? e.shape.kind : '')));
    expect(kinds).toContain('circle');
    expect(kinds).toContain('line');
    expect(b.adds.some((a) => f.world.isAlive(a) && defOf(f.world, a) === 'lumen_tentacle')).toBe(true);
  });
});

describe('Lumen: phase 2, the memories', () => {
  it('plays ash, fire, jungle and darkness in turn, 15 s each, then loops; each brings its own shades and hazards', () => {
    const f = setup();
    const { world, ctx } = f;
    const { b, h } = start(f);
    h.current = h.max * 0.6;
    const seen: { id: string; at: number; adds: string[]; hazards: number }[] = [];
    const t0 = ctx.time;
    for (let i = 0; i < 60 * 65; i++) {
      run(world, ctx, SYSTEMS);
      h.current = h.max * 0.6;
      const id = activeMemory(world)?.id;
      if (id && seen[seen.length - 1]?.id !== id) seen.push({ id, at: ctx.time - t0, adds: [], hazards: 0 });
      const cur = seen[seen.length - 1];
      if (cur) {
        for (const a of b.adds) if (world.isAlive(a)) cur.adds.push(defOf(world, a));
        cur.hazards = Math.max(cur.hazards, world.query(Hazard).length);
      }
    }
    expect(seen.map((s) => s.id)).toEqual(['ash', 'fire', 'jungle', 'dark', 'ash']);
    seen.forEach((s, i) => expect(s.at).toBeCloseTo(i * 15, 0));
    const shades = (id: string) => [...new Set(seen.find((s) => s.id === id)!.adds)].sort();
    // Only the current memory's shades are ever around.
    expect(shades('ash')).toEqual(['shade_echo', 'shade_walker']);
    expect(shades('fire')).toEqual(['shade_hound', 'shade_smelter']);
    expect(shades('jungle')).toEqual(['mother_root', 'shade_hound', 'shade_weaver']);
    expect(shades('dark')).toEqual(['shade_drone', 'shade_sentinel']);
    // Fire and jungle lay hazards; the ash fields and the dark do not.
    expect(seen.find((s) => s.id === 'ash')!.hazards).toBe(0);
    expect(seen.find((s) => s.id === 'fire')!.hazards).toBeGreaterThan(0);
    expect(seen.find((s) => s.id === 'jungle')!.hazards).toBeGreaterThan(0);
    expect(seen.find((s) => s.id === 'dark')!.hazards).toBe(0);
    for (const k of ['ash', 'fire', 'jungle', 'dark']) expect(events(ctx).some((e) => e.type === 'banner' && e.key === `bosses.lumen.memory.${k}`)).toBe(true);
  });

  it('a switch clears the last memory’s leftovers; the player dying resets everything cleanly', () => {
    const f = setup();
    const { world, ctx, zone } = f;
    const { st, b, h } = start(f);
    h.current = h.max * 0.6;
    // Into the fire memory, with its pools down.
    for (let i = 0; i < 60 * 25 && !(activeMemory(world)?.id === 'fire' && (b.fields?.length ?? 0) > 0); i++) {
      run(world, ctx, SYSTEMS);
      h.current = h.max * 0.6;
    }
    expect(activeMemory(world)?.id).toBe('fire');
    expect(b.fields!.length).toBeGreaterThan(0);
    const pools = [...b.fields!];
    run(world, ctx, SYSTEMS, 60 * 14);
    // Jungle began: the fire's pools are gone.
    expect(activeMemory(world)?.id).toBe('jungle');
    for (const p of pools) expect(world.isAlive(p)).toBe(false);
    // The player dies: gates open, the boss is back to phase 1 with nothing left in the arena.
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(st.state).toBe('idle');
    expect(st.gates).toHaveLength(0);
    expect(b.phase).toBe(0);
    expect(b.memory).toBeUndefined();
    expect(b.engaged).toBe(false);
    expect(b.adds).toHaveLength(0);
    expect(b.fields).toHaveLength(0);
    expect(activeMemory(world)).toBeNull();
    expect(world.query(Hazard)).toHaveLength(0);
    expect(world.req(st.boss!, Health).current).toBe(world.req(st.boss!, Health).max);
    const tr = world.req(st.boss!, Transform);
    expect([tr.x, tr.z]).toEqual([H.x, H.z]);
    // And the fight can be fought again.
    run(world, ctx, SYSTEMS, 2);
    expect(st.state).toBe('fight');
    expect(st.gates.length).toBeGreaterThan(0);
    expect(world.req(st.boss!, Boss).phase).toBe(0);
  });

  it('the beat\'s shape stands in front of the player, not beside the distant boss', () => {
    const f = setup();
    const { world, ctx, player } = f;
    // Fighting from near the edge of the arena, 26 m from Lumen.
    const pt = world.req(player, Transform);
    pt.z = pt.prevZ = H.z - 26;
    const { boss, b, h } = start(f);
    h.current = h.max * 0.3;
    run(world, ctx, SYSTEMS, 2);
    expect(b.phase).toBe(2);
    const ft = world.req(b.form!, Transform);
    const bt = world.req(boss, Transform);
    expect(Math.hypot(ft.x - pt.x, ft.z - pt.z)).toBeLessThanOrEqual(6);
    expect(Math.hypot(ft.x - pt.x, ft.z - pt.z)).toBeGreaterThanOrEqual(2);
    expect(Math.hypot(ft.x - bt.x, ft.z - bt.z)).toBeLessThan(Math.hypot(pt.x - bt.x, pt.z - bt.z));
  });

  it('dying in the beat closes it: the shape is gone and the choice is asked again next time', () => {
    const f = setup();
    const { world, ctx, zone } = f;
    const { b, h } = start(f);
    h.current = h.max * 0.3;
    run(world, ctx, SYSTEMS, 2);
    expect(b.phase).toBe(2);
    const form = b.form!;
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(world.isAlive(form)).toBe(false);
    expect(b.form).toBeUndefined();
    expect(chooseLumen(world, zone, 'listen')).toBe(false);
    expect(lumenChoiceOf(zone.found)).toBeNull();
  });
});

describe('Lumen: the choice and the ending', () => {
  it('stores the choice with the character and picks the epilogue that matches', () => {
    for (const choice of ['listen', 'fight'] as const) {
      const f = setup();
      const { world, ctx, zone } = f;
      const { st, boss, h } = start(f);
      expect(chooseLumen(world, zone, choice)).toBe(false); // not waiting for one yet
      h.current = h.max * 0.3;
      run(world, ctx, SYSTEMS, 2);
      expect(chooseLumen(world, zone, choice)).toBe(true);
      expect(lumenChoiceOf(zone.found)).toBe(choice);
      expect(zone.found.has(LUMEN_CHOICE_FLAGS[choice])).toBe(true);
      expect(chooseLumen(world, zone, choice)).toBe(false); // answered
      run(world, ctx, SYSTEMS, 2);
      ctx.events.drain();
      kill(world, ctx, boss, 0);
      run(world, ctx, SYSTEMS, 2);
      expect(st.state).toBe('defeated');
      expect(st.gates).toHaveLength(0);
      expect(zone.found.has(H.id)).toBe(true);
      expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: H.id });
      expect(ctx.rewards.some((r) => r.table === 'dt.boss' && r.xp && r.rarity === 'legendary')).toBe(true);
      const ev = events(ctx).filter((e) => e.type === 'epilogue');
      expect(ev).toEqual([{ type: 'epilogue', choice }]);
      expect(t(epilogueKeys(choice).text)).toBe(t(`ending.epilogue.${choice}`));
      // Defeated stays defeated after a load.
      const f2 = createZoneRuntime(THE_CORE);
      for (const k of zone.found) f2.found.add(k);
      syncSetPieces(world, f2);
      expect(f2.setPieces.lumen!.state).toBe('defeated');
      expect(lumenChoiceOf(f2.found)).toBe(choice);
    }
  });

  it('the latest choice wins, and no choice reads as Fight', () => {
    const f = setup();
    f.zone.found.add(LUMEN_CHOICE_FLAGS.listen);
    f.zone.found.add(LUMEN_CHOICE_FLAGS.fight);
    expect(lumenChoiceOf(f.zone.found)).toBe('listen');
    expect(epilogueKeys(null)).toEqual(epilogueKeys('fight'));
    const { h } = start(f);
    h.current = h.max * 0.3;
    run(f.world, f.ctx, SYSTEMS, 2);
    chooseLumen(f.world, f.zone, 'fight');
    expect(f.zone.found.has(LUMEN_CHOICE_FLAGS.listen)).toBe(false);
    expect(lumenChoiceOf(f.zone.found)).toBe('fight');
  });

  it('has two distinct epilogues of about 80-120 words each, and short credits', () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const listen = t('ending.epilogue.listen');
    const fight = t('ending.epilogue.fight');
    expect(listen).not.toBe(fight);
    for (const text of [listen, fight]) {
      expect(words(text)).toBeGreaterThanOrEqual(80);
      expect(words(text)).toBeLessThanOrEqual(120);
    }
    expect(t(epilogueKeys('listen').title)).not.toBe(t(epilogueKeys('fight').title));
    expect(CREDIT_KEYS.length).toBeLessThanOrEqual(12);
    for (const k of CREDIT_KEYS) expect(t(k), k).not.toBe(k);
  });

  it('the dying boss takes its summons and fields with it', () => {
    const f = setup();
    const { world, ctx } = f;
    const { boss, b, h } = start(f);
    h.current = h.max * 0.6;
    for (let i = 0; i < 60 * 20; i++) {
      run(world, ctx, SYSTEMS);
      h.current = h.max * 0.6;
    }
    expect(b.adds.length).toBeGreaterThan(0);
    const adds = [...b.adds];
    kill(world, ctx, boss, 0);
    run(world, ctx, SYSTEMS, 3);
    for (const a of adds) expect(world.isAlive(a) && !world.has(a, Dead)).toBe(false);
    expect(world.query(Hazard)).toHaveLength(0);
  });
});

describe('Lumen: a whole fight with every system running', () => {
  it('stays sane through all four phases, hurts the player, and ends in the epilogue event', () => {
    const f = setup();
    const { world, ctx, zone, player } = f;
    const all = [spatialSystem, setPieceSystem, enemyAISystem, bossSystem, statusSystem, movementSystem, collisionSystem, projectileSystem, hazardSystem, blastSystem, deathSystem];
    const { st, boss, b, h } = start(f);
    const ph = world.req(player, Health);
    const stage = (frac: number, seconds: number) => {
      for (let i = 0; i < 60 * seconds; i++) {
        h.current = Math.max(h.current, h.max * frac);
        if (b.phase === 2 && !b.beatDone) break;
        run(world, ctx, all);
      }
    };
    stage(0.95, 15);
    expect(b.phase).toBe(0);
    h.current = h.max * 0.6;
    run(world, ctx, all, 60 * 35);
    expect(b.phase).toBe(1);
    h.current = h.max * 0.3;
    run(world, ctx, all, 60 * 5);
    expect(b.phase).toBe(2);
    expect(chooseLumen(world, zone, 'listen')).toBe(true);
    run(world, ctx, all, 60 * 20);
    expect(b.phase).toBe(3);
    const tr = world.req(boss, Transform);
    expect(Number.isFinite(tr.x) && Number.isFinite(tr.z)).toBe(true);
    expect([tr.x, tr.z]).toEqual([H.x, H.z]);
    expect(ph.current).toBeLessThan(ph.max);
    expect(st.state).toBe('fight');
    ctx.events.drain();
    kill(world, ctx, boss, 0);
    run(world, ctx, all, 3);
    expect(st.state).toBe('defeated');
    expect(events(ctx).filter((e) => e.type === 'epilogue')).toEqual([{ type: 'epilogue', choice: 'listen' }]);
  });
});
