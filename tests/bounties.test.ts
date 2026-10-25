import { describe, expect, it } from 'vitest';
import { CombatStats, Elite, EnemyAI, Inventory, Transform } from '../src/core/components';
import { Rng } from '../src/core/rng';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { LATE_AFFIXES, LATE_AFFIX_MIN_LEVEL } from '../src/data/elites';
import { NPCS, QUESTS } from '../src/data/quests/db';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import en from '../src/data/lang/en.json';
import { kill } from '../src/systems/combat';
import { championAffixes, eliteSystem, rareAffixes, rollAffixes } from '../src/systems/elites';
import {
  choose,
  completeTalk,
  createQuestRuntime,
  offeredBy,
  questSystem,
  resetBounties,
  saveQuests,
  restoreQuests,
  spawnQuestWorld,
  startQuest,
} from '../src/systems/quests';
import { Hazard, PendingHazard } from '../src/core/components';
import { spawnInteractables } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

const bounties = [...QUESTS.values()].filter((q) => q.repeatable);
const REGIONS = ['zone.cinder_flats', 'zone.refinery_district', 'zone.hydroponic_vaults', 'zone.deep_mines', 'zone.the_core'];

function setup() {
  const world = new World();
  const zone = createZoneRuntime(CINDER_FLATS);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  ctx.endgame = { matrixXp: 0, matrixPoints: 0, nodes: [], boards: [], glyphs: [], ashShards: 0, recipes: [], materials: {} } as never;
  const player = spawnPlayer(world, 'bastion', CINDER_FLATS.playerSpawn.x, CINDER_FLATS.playerSpawn.z);
  spawnInteractables(world, zone);
  spawnQuestWorld(world, ctx);
  return { world, ctx, player, rt: ctx.quests! };
}

describe('repeatable bounties (C013)', () => {
  it('has four per region (three hunts and an escort), given by hub NPCs of that region once the campaign is done', () => {
    expect(bounties).toHaveLength(20);
    for (const zone of REGIONS) {
      const mine = bounties.filter((q) => q.zone === zone);
      expect(mine, zone).toHaveLength(4);
      expect(new Set(mine.map((q) => q.giver)).size, `${zone} givers`).toBeGreaterThanOrEqual(3);
      for (const q of mine) {
        expect(NPCS.get(q.giver!)?.zone, q.id).toBe(zone);
        expect(q.after, q.id).toHaveLength(1);
        expect(QUESTS.get(q.after[0]!)?.kind, q.id).toBe('main');
        expect(q.rewards.item, q.id).toBe('rare');
        expect(q.rewards.dust + q.rewards.shards, q.id).toBeGreaterThan(0);
        expect(q.rewards.restoration, q.id).toBe(0);
        expect(q.steps.at(-1)!.kind, q.id).toBe('talk');
      }
    }
  });

  it('D03: every region has one escort bounty on a route with reachable, sensible waypoints', () => {
    const texts = (en as unknown as { quests: { bt: Record<string, { escortName?: string; steps: Record<string, string>; talk2?: string }> } }).quests.bt;
    for (const zone of REGIONS) {
      const escorts = bounties.filter((q) => q.zone === zone && q.steps.some((st) => st.kind === 'escort'));
      expect(escorts, zone).toHaveLength(1);
      const q = escorts[0]!;
      expect(q.steps.map((st) => st.kind), q.id).toEqual(['reach', 'escort', 'talk']);
      const esc = q.steps[1]!;
      if (esc.kind !== 'escort') throw new Error('escort expected');
      const reach = q.steps[0]!;
      if (reach.kind !== 'reach') throw new Error('reach expected');
      expect([reach.x, reach.z], q.id).toEqual(esc.path[0]);
      for (let i = 1; i < esc.path.length; i++) {
        const [ax, az] = esc.path[i - 1]!;
        const [bx, bz] = esc.path[i]!;
        const len = Math.hypot(bx - ax, bz - az);
        expect(len, `${q.id} leg ${i}`).toBeGreaterThan(2);
        expect(len, `${q.id} leg ${i}`).toBeLessThan(400);
      }
      expect(texts[q.id.replace('bt.', '')]?.escortName, q.id).toBeTruthy();
      expect(texts[q.id.replace('bt.', '')]?.talk2, q.id).toBeTruthy();
    }
  });

  it('names its hunted targets', () => {
    const named = (en as unknown as { enemies: { named: Record<string, string> } }).enemies.named;
    for (const q of bounties) for (const s of q.steps) if (s.kind === 'kill' && s.spawn) expect(named[s.spawn.name.replace('enemies.named.', '')], q.id).toBeTruthy();
  });

  it('is offered after the campaign, pays dust and comes back when the region is entered again', () => {
    const { world, ctx, rt } = setup();
    expect(offeredBy(rt, 'hekla').map((q) => q.id)).not.toContain('bt.cf_drones');
    rt.done.set('mq.the_first', '');
    expect(offeredBy(rt, 'hekla').map((q) => q.id)).toContain('bt.cf_drones');

    expect(startQuest(world, ctx, 'bt.cf_drones')).toBe(true);
    run(world, ctx, [questSystem], 1);
    for (let i = 0; i < 10; i++) {
      kill(world, ctx, spawnEnemy(world, i === 3 ? 'infected_colonist' : 'security_drone', 0, 0), 0);
      run(world, ctx, [questSystem], 1);
    }
    // 9 drones (the colonist does not count).
    expect(rt.active.get('bt.cf_drones')).toMatchObject({ step: 0, progress: 9 });
    kill(world, ctx, spawnEnemy(world, 'security_drone', 0, 0), 0);
    run(world, ctx, [questSystem], 1);
    expect(rt.active.get('bt.cf_drones')!.step).toBe(1);

    expect(completeTalk(world, ctx, 'bt.cf_drones')).toBe(true);
    expect(rt.done.has('bt.cf_drones')).toBe(true);
    expect(ctx.endgame!.materials['lumen_dust']).toBe(QUESTS.get('bt.cf_drones')!.rewards.dust);
    expect(ctx.rewards.some((r) => r.rarity === 'rare')).toBe(true);
    expect(offeredBy(rt, 'hekla').map((q) => q.id)).not.toContain('bt.cf_drones');

    // Other regions' bounties stay done; this region's come back.
    rt.done.set('bt.rd_smelters', '');
    expect(resetBounties(rt, 'zone.cinder_flats')).toEqual(['bt.cf_drones']);
    expect(rt.done.has('bt.rd_smelters')).toBe(true);
    expect(offeredBy(rt, 'hekla').map((q) => q.id)).toContain('bt.cf_drones');
  });

  it('keeps a bounty that is still in progress, and survives a save', () => {
    const { world, ctx, rt } = setup();
    rt.done.set('mq.the_first', '');
    startQuest(world, ctx, 'bt.cf_salvage');
    expect(resetBounties(rt, 'zone.cinder_flats')).toEqual([]);
    restoreQuests(world, ctx, saveQuests(rt));
    expect(rt.active.has('bt.cf_salvage')).toBe(true);
  });
});

describe('choice quests in the Deep Mines and the Core (C015)', () => {
  it.each([
    ['sq.foremans_ledger', 'zone.deep_mines', 'tam', 'share', ['share', 'keep']],
    ['sq.last_letters', 'zone.the_core', 'wren', 'keep', ['burn', 'keep']],
  ])('%s has two options with different rewards and a follow-up NPC', (id, zone, follower, option, options) => {
    const q = QUESTS.get(id)!;
    expect(q.zone).toBe(zone);
    const choice = q.steps.at(-1)!;
    expect(choice.kind).toBe('choice');
    if (choice.kind !== 'choice') return;
    expect(choice.options.map((o) => o.id)).toEqual(options);
    expect(choice.options.some((o) => o.item)).toBe(true);
    expect(choice.options.some((o) => o.gold > 0 && !o.item)).toBe(true);
    expect(NPCS.get(follower)?.choice).toEqual({ quest: id, option });
    const text = (en as unknown as { quests: { sq: Record<string, Record<string, Record<string, string>>> } }).quests.sq[id.slice(3)]!;
    const key = `choice${q.steps.length - 1}`;
    for (const o of options) {
      expect(text[key]![o], o).toBeTruthy();
      expect(text['result']![o], o).toBeTruthy();
    }
    expect(text[key]!['prompt']).toBeTruthy();
  });

  it('the choice is paid and remembered', () => {
    const { world, ctx, rt, player } = setup();
    rt.active.set('sq.foremans_ledger', { step: 2, progress: 0 });
    const gold = world.req(player, Inventory).gold;
    expect(choose(world, ctx, 'sq.foremans_ledger', 'share')).toBe(true);
    expect(rt.done.get('sq.foremans_ledger')).toBe('share');
    expect(world.req(player, Inventory).gold).toBe(gold + 900 + 300);
  });
});

describe('Force Wall and Laser Grid (C019)', () => {
  it('only roll from the Vaults on (monster level 20), never earlier', () => {
    const early = new Set<string>();
    const late = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const a of rollAffixes(new Rng(`e${i}`), 3, LATE_AFFIX_MIN_LEVEL - 1)) early.add(a);
      for (const a of rollAffixes(new Rng(`l${i}`), 3, LATE_AFFIX_MIN_LEVEL)) late.add(a);
      for (const a of championAffixes(new Rng(`c${i}`), 12)) expect(LATE_AFFIXES).not.toContain(a);
      for (const a of rareAffixes(new Rng(`r${i}`), 15)) expect(LATE_AFFIXES).not.toContain(a);
    }
    for (const a of LATE_AFFIXES) {
      expect(early.has(a), a).toBe(false);
      expect(late.has(a), a).toBe(true);
    }
  });

  it('Force Wall lays a warned line of hazards across the player', () => {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 200 });
    spawnPlayer(world, 'bastion', 0, 0);
    const e = spawnEnemy(world, 'infected_colonist', 10, 0, { level: 30 });
    world.add(e, Elite, { kind: 'rare', affixes: ['forceWall'], timers: {}, shieldUsed: false, mirrored: false, copy: false });
    world.req(e, EnemyAI).aggro = true;
    run(world, ctx, [eliteSystem], 60 * 14);
    expect(world.query(PendingHazard).length + world.query(Hazard).length).toBeGreaterThanOrEqual(5);
    expect(ctx.events.drain().some((ev) => ev.type === 'telegraph' && ev.shape.kind === 'line')).toBe(true);
    void CombatStats;
    void Transform;
  });

  it('Laser Grid crosses two beams under the player', () => {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 200 });
    spawnPlayer(world, 'bastion', 0, 0);
    const e = spawnEnemy(world, 'infected_colonist', 10, 0, { level: 30 });
    world.add(e, Elite, { kind: 'rare', affixes: ['laserGrid'], timers: {}, shieldUsed: false, mirrored: false, copy: false });
    world.req(e, EnemyAI).aggro = true;
    run(world, ctx, [eliteSystem], 60 * 13);
    const lines = ctx.events.drain().filter((ev) => ev.type === 'telegraph' && ev.shape.kind === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(world.query(PendingHazard).length + world.query(Hazard).length).toBeGreaterThanOrEqual(10);
  });
});
