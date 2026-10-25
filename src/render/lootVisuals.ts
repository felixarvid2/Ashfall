/**
 * Loot on the ground: a small glowing item per drop with a rarity-coloured light beam
 * (taller for rarer items) and a pop-out arc when it drops; gold piles glint.
 */
import * as THREE from 'three';
import { GroundGold, GroundItem, PlayerControlled, Resource, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { CRYSTAL_DEFS, rarityDef } from '../data/loot/db';

const POP_TIME = 0.45;

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
  private readonly gold = new Map<Entity, THREE.Mesh>();
  private readonly itemGeo = new THREE.BoxGeometry(0.42, 0.12, 0.3);
  private readonly beamGeo = new THREE.CylinderGeometry(0.08, 0.22, 1, 12, 1, true).translate(0, 0.5, 0);
  private readonly ringGeo = new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2);
  private readonly goldGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.08, 10);
  private readonly goldMat = new THREE.MeshStandardMaterial({ color: '#d9a640', emissive: '#7a5410', metalness: 0.9, roughness: 0.35 });
  private time = 0;

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
        obj = this.build(g.item.rarity, g.item.crystal ? (CRYSTAL_DEFS.get(g.item.crystal.id)?.color ?? null) : null);
        this.items.set(e, obj);
        this.root.add(obj);
      }
      const tr = world.req(e, Transform);
      const t = Math.min(1, g.age / POP_TIME);
      const body = obj.children[0]!;
      // A crystal pulled by the loot magnet (F020) rises a little as it flies in.
      const lift = g.magnet === undefined ? 0 : Math.min(0.5, g.magnet * 2.5);
      body.position.y = 0.08 + lift + Math.sin(t * Math.PI) * 1.1 + (t >= 1 ? Math.sin(this.time * 2 + e) * 0.02 : 0);
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
        mesh = new THREE.Mesh(this.goldGeo, this.goldMat);
        this.gold.set(e, mesh);
        this.root.add(mesh);
      }
      const tr = world.req(e, Transform);
      const g = world.req(e, GroundGold);
      const t = Math.min(1, g.age / POP_TIME);
      // Gold pulled by the loot magnet (F020) rises a little as it flies in.
      const lift = g.magnet === undefined ? 0 : Math.min(0.5, g.magnet * 2.5);
      mesh.position.set(tr.x, 0.05 + lift + Math.sin(t * Math.PI) * 0.8, tr.z);
      mesh.rotation.y = this.time * 1.5;
    }
    for (const [e, mesh] of this.gold) {
      if (goldSeen.has(e)) continue;
      this.root.remove(mesh);
      this.gold.delete(e);
    }
  }

  private build(rarity: Parameters<typeof rarityDef>[0], tint: string | null): THREE.Group {
    const def = rarityDef(rarity);
    const color = new THREE.Color(tint ?? def.color);
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      this.itemGeo,
      new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: color, emissiveIntensity: 0.9, roughness: 0.6 }),
    );
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
