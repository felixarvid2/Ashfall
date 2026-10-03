/**
 * npm run region:report — the measurements behind docs/regions/cinder-flats-playtest.md
 * (docs/world-and-gameplay.md §15.3). Combines the region layout with the bot's measured kill
 * rate to estimate quest and exploration times, fight spacing and Legendary drops, and checks for
 * places the player could get stuck (points of interest inside collision).
 */
import { readFileSync } from 'node:fs';
import { Rng } from '../../src/core/rng';
import { CLASSES } from '../../src/data/db';
import { INSTANCES } from '../../src/data/instances';
import { dropTable } from '../../src/data/loot/db';
import { packTemplate } from '../../src/data/packs';
import { NPCS, QUESTS } from '../../src/data/quests/db';
import { CINDER_FLATS } from '../../src/data/zones/cinderFlats';
import { ENEMY_DEFS } from '../../src/data/db';
import { rollDrops } from '../../src/systems/loot/generate';
import { generateLayout } from '../../src/world/instance';
import { PLANS } from './plans';
import { playthrough } from './playthrough';

const zone = CINDER_FLATS;
const speed = CLASSES.get('bastion')!.moveSpeed;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---- Kill rate from the bot (test arena, level 1→10) ----------------------------------
const bot = playthrough(PLANS[0]!, { maxMinutes: 8, seed: 'region' });
const botSeconds = Math.min(8 * 60, bot.levelTimes[10] ?? 8 * 60);
const killsPerSecond = bot.kills / botSeconds;

// ---- Packs ---------------------------------------------------------------------------
const avgMembers = (id: string) =>
  packTemplate(id).members.reduce((sum, m) => sum + ((m.count[0] + m.count[1]) / 2) * (m.chance ?? 1), 0);
const packClear = (id: string) => avgMembers(id) / killsPerSecond;
const distToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};

// ---- Main quest route ------------------------------------------------------------------
// Walk between each step's location; once a teleporter is discovered, travel from the nearest one.
const at = (x: number, z: number) => ({ x, z });
const npc = (id: string) => at(NPCS.get(id)!.x, NPCS.get(id)!.z);
const tp = (id: string) => {
  const t = zone.teleporters.find((x) => x.id === id)!;
  return at(t.x, t.z);
};
const route: { label: string; to: { x: number; z: number }; fight?: number; extra?: number; discover?: string }[] = [
  { label: 'Reach the road', to: at(-275, -160) },
  { label: 'Impact teleporter', to: tp('tp.impact'), discover: 'tp.impact' },
  { label: 'Outpost Ember', to: npc('benny'), discover: 'tp.ember' },
  { label: 'Hekla', to: npc('hekla') },
  { label: 'Convoy', to: at(40, 18), fight: 6, discover: 'tp.route7' },
  { label: 'Back to Hekla', to: npc('hekla') },
  { label: 'Pell', to: npc('pell') },
  { label: 'Sierra approach', to: tp('tp.sierra'), discover: 'tp.sierra' },
  // Stronghold: 3 feeders, ~3 waves, Commandant Hale.
  { label: 'Checkpoint Sierra', to: at(232, -132), extra: 3 * 25 + 3 * packClear('military') + 90 },
  { label: 'Back to Pell', to: npc('pell') },
  { label: "Meridian's Hold", to: at(54, 232), discover: 'tp.valley' },
  { label: 'Clear the dungeon', to: at(54, 232), extra: 0 },
  { label: 'Back to Pell', to: npc('pell') },
  { label: 'The Maw', to: tp('tp.maw'), discover: 'tp.maw' },
  { label: 'The First', to: at(292, 196), extra: 180 },
  { label: 'Benny', to: npc('benny') },
];

// A dungeon: rooms × (walk across + packs), plus objective and boss.
function dungeonTime(id: string): { rooms: number; seconds: number } {
  const def = INSTANCES.find((d) => d.id === id)!;
  let rooms = 0;
  let seconds = 0;
  for (let i = 0; i < 20; i++) {
    const layout = generateLayout(new Rng(`${id}-${i}`), def);
    rooms += layout.rooms.length;
    const fightRooms = layout.rooms.filter((r) => r.kind === 'main' || r.kind === 'side').length;
    const packs = fightRooms * ((def.packsPerRoom[0] + def.packsPerRoom[1]) / 2);
    // Side rooms are walked in and out again.
    const walk = layout.rooms.length * 26 * 1.6 / speed;
    const avgPack = def.packs.reduce((s, p) => s + packClear(p), 0) / def.packs.length;
    const obj = def.objective.kind === 'activate' ? def.objective.count * (def.objective.charge + 6) : def.objective.kind === 'destroy' ? def.objective.count * 12 : 0;
    seconds += walk + packs * avgPack + obj + (def.boss ? 60 : 0);
  }
  return { rooms: rooms / 20, seconds: seconds / 20 };
}
route[11]!.extra = dungeonTime('meridians_hold').seconds;

let pos = at(zone.playerSpawn.x, zone.playerSpawn.z);
const discovered = new Set(['tp.ember']);
let walkSeconds = 0;
let fightSeconds = 0;
let setPieceSeconds = 0;
const nearPath = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  zone.packs.filter((p) => distToSegment(p.x, p.z, a.x, a.z, b.x, b.z) < 14);
for (const leg of route) {
  // Start from the nearest discovered teleporter if that is shorter.
  let from = pos;
  for (const id of discovered) {
    const t = tp(id);
    if (Math.hypot(t.x - leg.to.x, t.z - leg.to.z) < Math.hypot(from.x - leg.to.x, from.z - leg.to.z)) from = t;
  }
  const d = Math.hypot(leg.to.x - from.x, leg.to.z - from.z) * 1.15; // roads wind a little
  walkSeconds += d / speed;
  // Packs along the way (most of them the first time through; cleared packs respawn after 4 min).
  for (const p of nearPath(from, leg.to)) fightSeconds += packClear(p.template) * 0.7;
  setPieceSeconds += leg.extra ?? 0;
  if (leg.discover) discovered.add(leg.discover);
  pos = leg.to;
}
const mainQuestSeconds = walkSeconds + fightSeconds + setPieceSeconds;

// ---- Full exploration ------------------------------------------------------------------
// Sweeping the map with the 36 m reveal radius, plus every pack, dungeon and bunker once.
const sweep = (zone.halfSize * 2) ** 2 / (2 * 36);
const allPacks = zone.packs.reduce((s, p) => s + packClear(p.template), 0);
const instances =
  dungeonTime('meridians_hold').seconds + dungeonTime('bunker_sierra4').seconds + dungeonTime('drainage_tunnels').seconds + 6 * dungeonTime('bunker').seconds;
const exploreSeconds = sweep / speed + allPacks + instances + setPieceSeconds;

// ---- Time between fights on the roads ----------------------------------------------------
const roadGaps: number[] = [];
for (const road of zone.roads) {
  const pts = road.points;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  const onRoad = zone.packs.filter((p) => pts.some((_, i) => i < pts.length - 1 && distToSegment(p.x, p.z, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]) < 16)).length;
  if (onRoad) roadGaps.push(length / onRoad / speed);
}
const betweenFights = roadGaps.reduce((a, b) => a + b, 0) / roadGaps.length;

// ---- Legendary drops in one playthrough --------------------------------------------------
function legendaries(seed: string): number {
  const rng = new Rng(seed);
  let n = 0;
  let uid = 0;
  const level = 6;
  for (const p of zone.packs) {
    const t = packTemplate(p.template);
    for (const m of t.members) {
      if (m.chance !== undefined && !rng.chance(m.chance)) continue;
      const count = rng.int(m.count[0], m.count[1]);
      for (let i = 0; i < count; i++) {
        const def = ENEMY_DEFS.get(m.enemy)!;
        const drop = rollDrops(rng, dropTable(def.dropTable ?? `dt.${def.id}`), level, 'bastion', () => String(uid++));
        n += drop.items.filter((it) => it.rarity === 'legendary' || it.rarity === 'unique' || it.rarity === 'mythic').length;
      }
    }
    if (rng.chance(t.championChance)) n += rollDrops(rng, dropTable('dt.champion'), level, 'bastion', () => String(uid++)).items.filter((it) => it.rarity === 'legendary').length * 3;
    if (rng.chance(t.rareChance)) n += rollDrops(rng, dropTable('dt.rare_elite'), level, 'bastion', () => String(uid++)).items.filter((it) => it.rarity === 'legendary').length;
  }
  // Guaranteed: 3 dungeon caches, Sierra, The First, legendary quest rewards.
  const questLegendaries = [...QUESTS.values()].filter((q) => q.rewards.item === 'legendary').length;
  return n + 3 + 1 + 1 + questLegendaries;
}
const legendaryRuns = ['a', 'b', 'c', 'd', 'e'].map(legendaries);

// ---- Stuck checks: points of interest inside collision -----------------------------------
const colliders: { x: number; z: number; r: number }[] = [];
for (const prop of zone.props) {
  const rot = prop.rot ?? 0;
  const scale = prop.scale ?? 1;
  if (prop.collider) colliders.push({ x: prop.x, z: prop.z, r: prop.collider });
  for (const c of prop.colliders ?? []) {
    colliders.push({ x: prop.x + (c.x * Math.cos(rot) + c.z * Math.sin(rot)) * scale, z: prop.z + (-c.x * Math.sin(rot) + c.z * Math.cos(rot)) * scale, r: c.r * scale });
  }
}
const blocked = (x: number, z: number, margin: number) => colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + margin);
const stuck: string[] = [];
for (const p of zone.pois) if (blocked(p.x, p.z, 0.6)) stuck.push(`POI ${p.id} at (${Math.round(p.x)}, ${Math.round(p.z)})`);
for (const t of zone.teleporters) if (blocked(t.x, t.z, 1)) stuck.push(`teleporter ${t.id}`);
for (const n of NPCS.values()) if (blocked(n.x, n.z, 0.6)) stuck.push(`NPC ${n.id}`);
for (const q of QUESTS.values()) {
  for (const s of q.steps) {
    if (s.kind === 'interact') for (const o of s.objects) if (blocked(o.x, o.z, 0.6)) stuck.push(`${q.id} object ${o.id}`);
    if (s.kind === 'reach' && Math.abs(s.x) > zone.halfSize - 4) stuck.push(`${q.id} reach point outside the map`);
  }
}

// ---- Meshy credits -------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(new URL('../../assets/manifest.json', import.meta.url), 'utf8')) as { assets: { id: string; meshy?: { creditsSpent?: number } }[] };
const region1 = ['enemy.spore_hound', 'enemy.sergeant', 'boss.the_first', 'npc.cook', 'npc.blacksmith', 'npc.technician', 'prop.meridian_freighter', 'prop.elevator_foundation', 'prop.refinery_silhouette', 'prop.escape_pod', 'prop.fuel_station', 'prop.teleporter', 'prop.stim_pylon', 'prop.echo_relic', 'prop.signal_tower', 'prop.supply_chest', 'prop.spore_feeder', 'prop.spore_nest', 'prop.generator', 'prop.explosive_barrel', 'prop.water_tanker', 'icon.keycard', 'icon.lore_log', 'icon.echo_relic'];
const credits = manifest.assets.filter((a) => region1.includes(a.id)).reduce((s, a) => s + (a.meshy?.creditsSpent ?? 0), 0);
const srcText = readFileSync(new URL('../../src/data/zones/cinderFlats.ts', import.meta.url), 'utf8');
const reused = manifest.assets.filter((a) => !region1.includes(a.id) && !a.id.startsWith('icon.') && !a.id.startsWith('char.') && srcText.includes(a.id)).length;

console.log(`# Cinder Flats measurements (estimates from layout + bot kill rate)\n`);
console.log(`Bot kill rate (test arena, ${PLANS[0]!.name}): ${killsPerSecond.toFixed(2)} kills/s, ${bot.deaths} deaths to level ${bot.reached}`);
console.log(`Main quests: ${mmss(mainQuestSeconds)} (walk ${mmss(walkSeconds)}, fights ${mmss(fightSeconds)}, stronghold/dungeon/boss ${mmss(setPieceSeconds)})`);
console.log(`Full exploration: ${mmss(exploreSeconds)} (sweep ${mmss(sweep / speed)}, all ${zone.packs.length} packs ${mmss(allPacks)}, 3 dungeons + 6 bunkers ${mmss(instances)})`);
console.log(`Meridian's Hold: ~${dungeonTime('meridians_hold').rooms.toFixed(1)} rooms, ${mmss(dungeonTime('meridians_hold').seconds)}`);
console.log(`Average time between fights on the roads: ${betweenFights.toFixed(1)} s of walking`);
console.log(`Legendary (or better) items in one playthrough: ${legendaryRuns.join(', ')} (5 runs; mean ${(legendaryRuns.reduce((a, b) => a + b, 0) / legendaryRuns.length).toFixed(1)})`);
console.log(`Possible stuck spots: ${stuck.length ? stuck.join('; ') : 'none found'}`);
console.log(`Meshy: ${credits} credits on ${region1.length} new Region 1 assets; ${reused} earlier assets reused in the layout`);
