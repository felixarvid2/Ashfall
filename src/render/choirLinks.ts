/**
 * The Choir's song made visible (docs/regions/the-core.md): a violet ring on the ground around each living
 * singer, and a beam (a thin violet tube with a gold core, solid rather than additive so it shows on the pale
 * Lumen ground) from the singer to every enemy it currently empowers. Purely a view of ECS state: a singer is
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
  /** Beam tubes (unit height along Y, instanced): violet sheath and a thinner gold core. */
  private readonly sheath: THREE.InstancedMesh;
  private readonly core: THREE.InstancedMesh;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rings: THREE.Mesh[] = [];

  constructor(scene: THREE.Object3D) {
    const tube = (radius: number, color: string, opacity: number, order: number): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }),
        MAX_BEAMS,
      );
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      mesh.count = 0;
      this.root.add(mesh);
      return mesh;
    };
    this.sheath = tube(0.055, '#7a3cff', 0.85, 4);
    this.core = tube(0.022, '#ffe49a', 0.95, 5);
    const ringGeo = new THREE.RingGeometry(CHOIR.radius - 0.35, CHOIR.radius, 72).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#7a3cff', transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
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
        this.from.set(best.position.x, best.position.y + 1.8, best.position.z);
        this.to.set(target.position.x, target.position.y + 0.9, target.position.z);
        this.dir.subVectors(this.to, this.from);
        const len = this.dir.length();
        if (len < 0.01) continue;
        this.quat.setFromUnitVectors(this.up, this.dir.multiplyScalar(1 / len));
        this.scale.set(1, len, 1);
        this.matrix.compose(this.from.add(this.to).multiplyScalar(0.5), this.quat, this.scale);
        this.sheath.setMatrixAt(n, this.matrix);
        this.core.setMatrixAt(n, this.matrix);
        n++;
      }
    }
    for (const mesh of [this.sheath, this.core]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = n > 0;
    }
    (this.sheath.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.2 * Math.sin(time * 6);
    this.rings.forEach((ring, i) => {
      const s = singers[i];
      ring.visible = s !== undefined;
      if (s === undefined) return;
      const o = objects.get(s)!;
      ring.position.set(o.position.x, 0.06, o.position.z);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.34 + 0.1 * Math.sin(time * 2 + i);
    });
  }
}
