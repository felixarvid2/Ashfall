/**
 * Loot on the ground: a small glowing item per drop with a rarity-coloured light beam
 * (taller for rarer items) and a pop-out arc when it drops; gold piles glint.
 */
import * as THREE from 'three';
import { GroundGold, GroundItem, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { CRYSTAL_DEFS, rarityDef } from '../data/loot/db';

const POP_TIME = 0.45;

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
      body.position.y = 0.08 + Math.sin(t * Math.PI) * 1.1 + (t >= 1 ? Math.sin(this.time * 2 + e) * 0.02 : 0);
      body.rotation.y = tr.facing + (t < 1 ? t * 8 : 0);
      obj.position.set(tr.x, 0, tr.z);
      const beam = obj.children[1];
      if (beam) beam.scale.y = (beam.userData.height as number) * Math.min(1, t * 1.5) * (0.92 + Math.sin(this.time * 3 + e) * 0.08);
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
      mesh.position.set(tr.x, 0.05 + Math.sin(t * Math.PI) * 0.8, tr.z);
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
          opacity: 0.35,
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
