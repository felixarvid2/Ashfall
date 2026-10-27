/**
 * Loot on the ground: a small item cache per drop (a Lumen crystal for crystals) with a rarity-coloured light beam
 * (taller for rarer items) and a pop-out arc when it drops; gold is a pile of coins. The models are Blender-made
 * (src/data/loot/lootModels.ts); until one has loaded, or without an AssetLibrary, the old box and disc stand in.
 */
import * as THREE from 'three';
import { GroundGold, GroundItem, PlayerControlled, Resource, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { LOOT_MODELS } from '../data/loot/lootModels';
import type { AssetLibrary } from './assets';

const POP_TIME = 0.45;

/** Where a model's base sits above the ground, and how much to scale it (the old box and disc were about this size). */
const MODEL_FIT = {
  item: { base: 0.02, scale: 1.1 },
  crystal: { base: 0.02, scale: 1.1 },
  gold: { base: 0.01, scale: 1.35 },
};
/** The cache's trim material is the one painted this grey (builders_npcs_loot.loot_cache): it takes the rarity colour. */
const TRIM_MATERIAL = 'painted_metalc8c8c8';

/** Beams are quiet by default: dim for magic and rare, shorter, and fainter near the hero and in a fight (A038). */
export const BEAM = {
  /** Opacity for magic and rare, and for legendary and better. */
  alpha: 0.5,
  alphaHigh: 0.9,
  /** Magic and rare beams are this share of their data height; width never changes. */
  shortHeight: 0.4,
  /** Within `nearRadius` metres of the hero (fully) or in combat, opacity is multiplied by `nearFactor`; it ramps back by `nearRadius + nearRamp`. */
  nearRadius: 3,
  nearRamp: 2,
  nearFactor: 0.3,
  /** Seconds since the hero last fought that still count as in combat. */
  combatWindow: 4,
};

/** Height and target opacity of a beam for its rarity, the distance to the hero and the combat state. */
export function beamLook(rarity: string, dataHeight: number, dist: number, inCombat: boolean): { height: number; opacity: number } {
  const high = rarity === 'legendary' || rarity === 'unique' || rarity === 'mythic';
  const height = high ? dataHeight : dataHeight * BEAM.shortHeight;
  const ramp = Math.min(1, Math.max(0, (dist - BEAM.nearRadius) / BEAM.nearRamp));
  const near = inCombat ? BEAM.nearFactor : BEAM.nearFactor + (1 - BEAM.nearFactor) * ramp;
  return { height, opacity: (high ? BEAM.alphaHigh : BEAM.alpha) * near };
}

export class LootVisuals {
  readonly root = new THREE.Group();
  private readonly items = new Map<Entity, THREE.Group>();
  private readonly gold = new Map<Entity, THREE.Group>();
  private readonly itemGeo = new THREE.BoxGeometry(0.42, 0.12, 0.3);
  private readonly beamGeo = new THREE.CylinderGeometry(0.08, 0.22, 1, 12, 1, true).translate(0, 0.5, 0);
  private readonly ringGeo = new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2);
  private readonly goldGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.08, 10);
  private readonly goldMat = new THREE.MeshStandardMaterial({ color: '#d9a640', emissive: '#7a5410', metalness: 0.9, roughness: 0.35 });
  /** One cloned material per rarity colour (cache trim) and per crystal colour, shared by every drop of it. */
  private readonly retinted = new Map<string, THREE.Material>();
  private time = 0;

  constructor(private readonly assets?: AssetLibrary) {}

  update(world: World, dt: number): void {
    this.time += dt;
    const seen = new Set<Entity>();
    const hero = world.first(PlayerControlled, Transform);
    const heroPos = hero === undefined ? null : world.req(hero, Transform);
    const inCombat = hero !== undefined && (world.get(hero, Resource)?.sinceCombat ?? Infinity) < BEAM.combatWindow;
    for (const e of world.query(GroundItem, Transform)) {
      seen.add(e);
      const g = world.req(e, GroundItem);
      let obj = this.items.get(e);
      if (!obj) {
        obj = this.build(g.item.rarity, g.item.crystal ? (CRYSTAL_DEFS.get(g.item.crystal.id)?.color ?? null) : null, !!g.item.crystal);
        this.items.set(e, obj);
        this.root.add(obj);
      }
      this.upgradeModel(obj);
      const tr = world.req(e, Transform);
      const t = Math.min(1, g.age / POP_TIME);
      const body = obj.children[0]!;
      // A crystal pulled by the loot magnet (F020) rises a little as it flies in.
      const lift = g.magnet === undefined ? 0 : Math.min(0.5, g.magnet * 2.5);
      body.position.y = (obj.userData.base as number) + lift + Math.sin(t * Math.PI) * 1.1 + (t >= 1 ? Math.sin(this.time * 2 + e) * 0.02 : 0);
      body.rotation.y = tr.facing + (t < 1 ? t * 8 : 0);
      obj.position.set(tr.x, 0, tr.z);
      const beam = obj.children[1];
      if (beam) {
        const look = beamLook(g.item.rarity, beam.userData.height as number, heroPos ? Math.hypot(tr.x - heroPos.x, tr.z - heroPos.z) : Infinity, inCombat);
        // Ease the opacity so a fight starting or the hero walking by fades the beam instead of popping it.
        const mat = (beam as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity += (look.opacity - mat.opacity) * Math.min(1, dt * 5);
        beam.scale.y = look.height * Math.min(1, t * 1.5) * (0.92 + Math.sin(this.time * 3 + e) * 0.08);
      }
    }
    for (const [e, obj] of this.items) {
      if (seen.has(e)) continue;
      this.root.remove(obj);
      this.items.delete(e);
    }

    const goldSeen = new Set<Entity>();
    for (const e of world.query(GroundGold, Transform)) {
      goldSeen.add(e);
      let mesh = this.gold.get(e);
      if (!mesh) {
        mesh = this.buildGold();
        this.gold.set(e, mesh);
        this.root.add(mesh);
      }
      this.upgradeModel(mesh);
      const tr = world.req(e, Transform);
      const g = world.req(e, GroundGold);
      const t = Math.min(1, g.age / POP_TIME);
      // Gold pulled by the loot magnet (F020) rises a little as it flies in.
      const lift = g.magnet === undefined ? 0 : Math.min(0.5, g.magnet * 2.5);
      mesh.position.set(tr.x, MODEL_FIT.gold.base + lift + Math.sin(t * Math.PI) * 0.8, tr.z);
      mesh.rotation.y = this.time * 1.5;
    }
    for (const [e, mesh] of this.gold) {
      if (goldSeen.has(e)) continue;
      this.root.remove(mesh);
      this.gold.delete(e);
    }
  }

  /** A body that is the model when it is loaded and the old stand-in shape until then (`upgradeModel` swaps it in). */
  private body(kind: keyof typeof LOOT_MODELS, tint: string | null, rarity: string | null, fallback: () => THREE.Object3D): THREE.Group {
    const holder = new THREE.Group();
    holder.userData = { kind, tint, rarity, standIn: true, base: MODEL_FIT[kind].base };
    holder.add(fallback());
    return holder;
  }

  /** Replace the stand-in with the model once the library has it. */
  private upgradeModel(obj: THREE.Object3D): void {
    const holder = obj.userData.standIn === undefined ? obj.children[0]! : obj;
    if (!holder.userData.standIn || !this.assets) return;
    const kind = holder.userData.kind as keyof typeof LOOT_MODELS;
    const id = LOOT_MODELS[kind];
    if (!this.assets.has(id) || !this.assets.hasModel(id)) return;
    holder.userData.standIn = false;
    holder.clear();
    const model = this.assets.create(id);
    model.scale.setScalar(MODEL_FIT[kind].scale);
    this.retint(model, kind, holder.userData.tint as string | null, holder.userData.rarity as string | null);
    holder.add(model);
  }

  private retint(model: THREE.Object3D, kind: keyof typeof LOOT_MODELS, tint: string | null, rarity: string | null): void {
    const color = kind === 'item' ? (tint ?? rarityDef(rarity as Parameters<typeof rarityDef>[0]).color) : tint;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const name = mesh.material.name;
      const trim = kind === 'item' && name === TRIM_MATERIAL;
      const crystal = kind === 'crystal' && color !== null && name.startsWith('lumen_crystal');
      if (kind === 'gold') {
        mesh.material = this.retinted.get('gold:' + name) ?? this.cache('gold:' + name, mesh.material as THREE.MeshStandardMaterial, (m) => {
          m.emissive.set('#7a5410');
          m.emissiveIntensity = 0.6;
        });
      } else if ((trim || crystal) && color) {
        mesh.material = this.cache(`${kind}:${color}`, mesh.material as THREE.MeshStandardMaterial, (m) => {
          m.color.set(color);
          m.emissive.set(color);
          m.emissiveIntensity = trim ? 0.9 : 1.4;
        });
      }
    });
  }

  private cache(key: string, source: THREE.MeshStandardMaterial, tweak: (m: THREE.MeshStandardMaterial) => void): THREE.Material {
    let m = this.retinted.get(key);
    if (!m) {
      const clone = source.clone();
      tweak(clone);
      this.retinted.set(key, (m = clone));
    }
    return m;
  }

  private buildGold(): THREE.Group {
    return this.body('gold', null, null, () => new THREE.Mesh(this.goldGeo, this.goldMat));
  }

  private build(rarity: Parameters<typeof rarityDef>[0], tint: string | null, crystal: boolean): THREE.Group {
    const def = rarityDef(rarity);
    const color = new THREE.Color(tint ?? def.color);
    const group = new THREE.Group();
    const body = this.body(crystal ? 'crystal' : 'item', tint, rarity, () => new THREE.Mesh(
      this.itemGeo,
      new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: color, emissiveIntensity: 0.9, roughness: 0.6 }),
    ));
    group.userData.base = body.userData.base;
    group.add(body);
    if (def.beam > 0) {
      const beam = new THREE.Mesh(
        this.beamGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      beam.userData.height = def.beam;
      group.add(beam);
    }
    const ring = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    ring.position.y = 0.02;
    group.add(ring);
    return group;
  }
}
