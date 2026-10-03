/**
 * Startup data validation (run in dev mode and in tests): schemas plus
 * cross-references such as "every prop in a zone points at a real asset id".
 */
import manifestJson from '../../assets/manifest.json';
import { AssetManifestSchema } from './assetManifest';
import { fieldAccess } from '../systems/skillCompile';
import { CLASSES, ENCOUNTERS, ENEMY_DEFS, SKILLS, SKILL_TREES } from './db';
import type { Effect } from './effects';
import { ASPECT_DEFS, BASE_ITEMS, UNIQUE_DEFS } from './loot/db';
import en from './lang/en.json';
import { SettingsSchema } from './settings';
import { TEST_ARENA, type ArenaDef } from './zones/testArena';
import { ZONES } from './zones';
import { PACK_TEMPLATES } from './packs';
import { NPCS, QUESTS } from './quests/db';

export function validateGameData(): string[] {
  const errors: string[] = [];

  const manifest = AssetManifestSchema.safeParse(manifestJson);
  if (!manifest.success) {
    for (const issue of manifest.error.issues) errors.push(`manifest ${issue.path.join('.')}: ${issue.message}`);
    return errors;
  }
  const ids = new Set<string>();
  for (const asset of manifest.data.assets) {
    if (ids.has(asset.id)) errors.push(`manifest: duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    if (asset.status === 'optimized' && !asset.file) errors.push(`manifest: ${asset.id} is optimized but has no file`);
    if (asset.category !== 'icon' && !asset.placeholder) errors.push(`manifest: ${asset.id} needs a placeholder`);
  }

  const arenas: ArenaDef[] = [TEST_ARENA, ...ZONES];
  for (const arena of arenas) {
    for (const prop of arena.props) {
      if (!ids.has(prop.asset)) errors.push(`${arena.id}: unknown asset ${prop.asset}`);
      if (!prop.landmark && (Math.abs(prop.x) > arena.halfSize || Math.abs(prop.z) > arena.halfSize)) {
        errors.push(`${arena.id}: ${prop.asset} at (${prop.x}, ${prop.z}) is outside the arena`);
      }
    }
    for (const s of arena.scatter) if (!ids.has(s.asset)) errors.push(`${arena.id}: unknown scatter asset ${s.asset}`);
  }

  // Quests and NPCs: models, enemies and people they mention must exist.
  for (const npc of NPCS.values()) if (!ids.has(npc.asset)) errors.push(`npc ${npc.id}: unknown asset ${npc.asset}`);
  for (const q of QUESTS.values()) {
    if (q.giver && !NPCS.has(q.giver)) errors.push(`quest ${q.id}: unknown giver ${q.giver}`);
    for (const a of q.after) if (!QUESTS.has(a)) errors.push(`quest ${q.id}: unknown prerequisite ${a}`);
    const objects = q.trigger && 'object' in q.trigger ? [q.trigger.object] : [];
    for (const step of q.steps) {
      if (step.kind === 'interact') objects.push(...step.objects);
      if (step.kind === 'escort' && !ids.has(step.asset)) errors.push(`quest ${q.id}: unknown asset ${step.asset}`);
      if ((step.kind === 'talk' || step.kind === 'choice') && !NPCS.has(step.npc)) errors.push(`quest ${q.id}: unknown npc ${step.npc}`);
      if (step.kind === 'kill') {
        for (const enemy of [step.enemy, step.spawn?.enemy]) if (enemy && !ENEMY_DEFS.has(enemy)) errors.push(`quest ${q.id}: unknown enemy ${enemy}`);
      }
    }
    for (const o of objects) if (!ids.has(o.asset)) errors.push(`quest ${q.id}: unknown asset ${o.asset}`);
  }

  // Combat data (schemas are enforced when db.ts loads; these are cross-references).
  for (const cls of CLASSES.values()) {
    if (!ids.has(cls.assetId)) errors.push(`class ${cls.id}: unknown asset ${cls.assetId}`);
    for (const id of cls.actionBar) {
      if (id === null) continue;
      const def = SKILLS.get(id);
      if (!def) errors.push(`class ${cls.id}: action bar references unknown skill ${id}`);
      else if (def.classId !== cls.id) errors.push(`class ${cls.id}: skill ${id} belongs to ${def.classId}`);
    }
  }
  for (const enemy of ENEMY_DEFS.values()) {
    if (!ids.has(enemy.assetId)) errors.push(`enemy ${enemy.id}: unknown asset ${enemy.assetId}`);
    const [min, max] = enemy.preferredRange ?? [0, 0];
    if (min > max) errors.push(`enemy ${enemy.id}: preferredRange min > max`);
  }
  for (const enc of ENCOUNTERS.values()) {
    for (const wave of enc.waves) {
      for (const g of wave.groups) if (!ENEMY_DEFS.has(g.enemy)) errors.push(`${enc.id}: unknown enemy ${g.enemy}`);
    }
    if (enc.spawnRing[0] > enc.spawnRing[1]) errors.push(`${enc.id}: spawnRing min > max`);
  }
  for (const def of SKILLS.values()) {
    const [cls, name] = def.id.split('.');
    const strings = (en as { skills?: Record<string, Record<string, unknown>> }).skills;
    if (!strings?.[cls!]?.[name!]) errors.push(`lang/en.json: missing strings for skill ${def.id}`);
  }
  for (const enemy of ENEMY_DEFS.values()) {
    const names = (en as unknown as { enemies?: Record<string, unknown> }).enemies;
    if (!names?.[enemy.id]) errors.push(`lang/en.json: missing name for enemy ${enemy.id}`);
  }

  // Effects (tree, aspects, uniques) must point at real skills and fields that skill has.
  const checkEffects = (where: string, effects: readonly Effect[], classId?: string) => {
    for (const eff of effects) {
      if (eff.kind !== 'skillMod') continue;
      const def = SKILLS.get(eff.skill);
      if (!def) {
        errors.push(`${where}: unknown skill ${eff.skill}`);
        continue;
      }
      if (classId && def.classId !== classId) errors.push(`${where}: skill ${eff.skill} belongs to ${def.classId}`);
      for (const m of eff.mods) {
        if ((m.op === 'mul' || m.op === 'add' || m.op === 'set') && !fieldAccess(def, m.field)) {
          errors.push(`${where}: ${eff.skill} has no field ${m.field}`);
        }
      }
    }
  };
  const lang = (key: string) => {
    let node: unknown = en;
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== 'string') errors.push(`lang/en.json: missing ${key}`);
  };

  for (const tree of SKILL_TREES.values()) {
    const where = `tree ${tree.classId}`;
    const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
    if (nodes.size !== tree.nodes.length) errors.push(`${where}: duplicate node ids`);
    const start = nodes.get(tree.startingNode);
    if (!start || start.type !== 'skill') errors.push(`${where}: startingNode must be a skill node`);
    for (const n of tree.nodes) {
      if (n.type === 'skill') {
        const def = SKILLS.get(n.skill);
        if (!def) errors.push(`${where}: ${n.id} references unknown skill ${n.skill}`);
        else if (def.classId !== tree.classId) errors.push(`${where}: ${n.id} skill belongs to ${def.classId}`);
        continue;
      }
      if (n.type === 'enhancement' && nodes.get(n.parent)?.type !== 'skill') errors.push(`${where}: ${n.id} parent must be a skill`);
      if (n.type === 'modifier' && nodes.get(n.parent)?.type !== 'enhancement') errors.push(`${where}: ${n.id} parent must be an enhancement`);
      checkEffects(`${where} ${n.id}`, n.effects, tree.classId);
      lang(`tree.${n.id}.name`);
      lang(`tree.${n.id}.desc`);
    }
    const taught = new Set(tree.nodes.flatMap((n) => (n.type === 'skill' ? [n.skill] : [])));
    for (const def of SKILLS.values()) {
      if (def.classId === tree.classId && !taught.has(def.id)) errors.push(`${where}: skill ${def.id} is not in the tree`);
    }
  }
  for (const a of ASPECT_DEFS.values()) {
    if (a.min > a.max) errors.push(`aspect ${a.id}: min > max`);
    checkEffects(`aspect ${a.id}`, a.effects as Effect[], a.classes?.length === 1 ? a.classes[0] : undefined);
    lang(`aspects.${a.id}.name`);
    lang(`aspects.${a.id}.desc`);
  }
  for (const u of UNIQUE_DEFS.values()) {
    if (!BASE_ITEMS.has(u.base)) errors.push(`unique ${u.id}: unknown base ${u.base}`);
    for (const a of u.affixes) if (a.min > a.max) errors.push(`unique ${u.id}: ${a.stat} min > max`);
    checkEffects(`unique ${u.id}`, u.effects as Effect[], u.classes?.length === 1 ? u.classes[0] : undefined);
    for (const k of ['name', 'effect', 'flavor']) lang(`uniques.${u.id}.${k}`);
  }
  for (const b of ['basic', 'core', 'defensive', 'tactical', 'mastery', 'ultimate', 'key']) lang(`tree.branches.${b}`);

  // Zones: border gates pair up, and ids that are stored by name never repeat across zones.
  const zoneIds = new Set(ZONES.map((z) => z.id));
  const seen = new Map<string, string>();
  const unique = (kind: string, id: string, zone: string) => {
    const other = seen.get(`${kind}:${id}`);
    if (other) errors.push(`${zone}: ${kind} id ${id} is also used in ${other}`);
    seen.set(`${kind}:${id}`, zone);
  };
  const templates = new Set(PACK_TEMPLATES.map((p) => p.id));
  for (const zone of ZONES) {
    lang(`zones.${zone.key}.name`);
    for (const sz of zone.subzones) lang(`zones.${zone.key}.${sz.id}`);
    for (const h of zone.hubs) lang(`zones.${zone.key}.${h.id}`);
    for (const tp of zone.teleporters) {
      unique('teleporter', tp.id, zone.id);
      lang(`zones.teleporters.${tp.id}`);
    }
    for (const poi of zone.pois) {
      unique('poi', poi.id, zone.id);
      if (poi.kind === 'lore') {
        lang(`lore.${String(poi.data?.log)}.title`);
        lang(`lore.${String(poi.data?.log)}.body`);
      }
    }
    for (const p of zone.packs) {
      unique('pack', p.id, zone.id);
      if (!templates.has(p.template)) errors.push(`${zone.id}: unknown pack template ${p.template}`);
    }
    for (const g of zone.gates) {
      unique('gate', g.id, zone.id);
      if (!zoneIds.has(g.to.zone)) {
        errors.push(`${zone.id}: gate ${g.id} leads to unknown zone ${g.to.zone}`);
        continue;
      }
      const other = ZONES.find((z) => z.id === g.to.zone)!.gates.find((o) => o.id === g.to.gate);
      if (!other) errors.push(`${zone.id}: gate ${g.id} leads to unknown gate ${g.to.gate}`);
      else if (other.to.zone !== zone.id || other.to.gate !== g.id) errors.push(`${zone.id}: gate ${g.id} and ${other.id} do not lead to each other`);
      // Arriving must not land inside the gate's own trigger (no bounce back).
      if (Math.hypot(g.arrive.x - g.x, g.arrive.z - g.z) < g.radius + 4) errors.push(`${zone.id}: gate ${g.id} arrival point is inside its trigger`);
      if (Math.abs(g.x) > zone.halfSize || Math.abs(g.z) > zone.halfSize) errors.push(`${zone.id}: gate ${g.id} is outside the zone`);
    }
    if (zone.stash && Math.hypot(zone.stash.x, zone.stash.z) > zone.halfSize * 1.5) errors.push(`${zone.id}: stash outside the zone`);
  }
  for (const npc of NPCS.values()) if (!zoneIds.has(npc.zone)) errors.push(`npc ${npc.id}: unknown zone ${npc.zone}`);
  for (const q of QUESTS.values()) {
    if (!zoneIds.has(q.zone)) errors.push(`quest ${q.id}: unknown zone ${q.zone}`);
    for (const step of q.steps) if (step.zone && !zoneIds.has(step.zone)) errors.push(`quest ${q.id}: unknown step zone ${step.zone}`);
  }

  if (!SettingsSchema.safeParse({}).success) errors.push('settings: defaults do not validate');
  if (typeof en !== 'object') errors.push('lang/en.json: not an object');
  return errors;
}
