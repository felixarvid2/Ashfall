/**
 * The Choir's song made visible (docs/regions/the-core.md): a faint violet ring on the ground around each living
 * singer, and a beam from the singer to every enemy it currently empowers. Purely a view of ECS state: a singer is
 * an enemy whose def has `choir`, an empowered enemy carries the `empowered` status.
 */
import * as THREE from 'three';
import { Dead, EnemyAI, StatusEffects, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { CHOIR } from '../data/core';
import { enemyDef } from '../data/db';

const MAX_BEAMS = 96;
const MAX_RINGS = 12;

export class ChoirLinks {
  private readonly root = new THREE.Group();
  private readonly beams: THREE.LineSegments;
  private readonly positions = new Float32Array(MAX_BEAMS * 6);
  private readonly rings: THREE.Mesh[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Object3D) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.beams = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#d6b0ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 4;
    this.root.add(this.beams);
    const ringGeo = new THREE.RingGeometry(CHOIR.radius - 0.2, CHOIR.radius, 72).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#b48cff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      ring.visible = false;
      ring.position.y = 0.06;
      ring.renderOrder = 2;
      this.rings.push(ring);
      this.root.add(ring);
    }
    scene.add(this.root);
  }

  /** `objects` are the renderer's models; `time` is the renderer's clock (s). */
  update(world: World, objects: ReadonlyMap<Entity, THREE.Object3D>, time: number): void {
    const singers: Entity[] = [];
    for (const e of world.query(EnemyAI, Transform)) {
      if (!world.has(e, Dead) && enemyDef(world.req(e, EnemyAI).defId).choir && objects.has(e)) singers.push(e);
    }
    let n = 0;
    if (singers.length) {
      for (const e of world.query(EnemyAI, StatusEffects, Transform)) {
        if (n >= MAX_BEAMS || world.has(e, Dead) || !world.req(e, StatusEffects).list.some((s) => s.id === 'empowered')) continue;
        const target = objects.get(e);
        if (!target) continue;
        // Link it to the nearest singer.
        let best: THREE.Object3D | null = null;
        let bestD = Infinity;
        for (const s of singers) {
          const o = objects.get(s)!;
          const d = o.position.distanceToSquared(target.position);
          if (d < bestD) {
            bestD = d;
            best = o;
          }
        }
        if (!best) continue;
        this.positions.set([best.position.x, best.position.y + 1.8, best.position.z], n * 6);
        this.tmp.copy(target.position);
        this.positions.set([this.tmp.x, this.tmp.y + 0.9, this.tmp.z], n * 6 + 3);
        n++;
      }
    }
    this.beams.geometry.setDrawRange(0, n * 2);
    (this.beams.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.beams.visible = n > 0;
    (this.beams.material as THREE.LineBasicMaterial).opacity = 0.5 + 0.25 * Math.sin(time * 6);
    this.rings.forEach((ring, i) => {
      const s = singers[i];
      ring.visible = s !== undefined;
      if (s === undefined) return;
      const o = objects.get(s)!;
      ring.position.set(o.position.x, 0.06, o.position.z);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.1 * Math.sin(time * 2 + i);
    });
  }
}
