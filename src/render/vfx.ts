/**
 * Combat visual effects: pooled meshes for shapes that must read exactly (rings,
 * telegraphs, beams) and painted sprite particles (spriteFx.ts) for fire, smoke,
 * spores, frost, sparks and dust. Every effect object is reused, never freed, so
 * heavy fights don't churn the garbage collector.
 */
import * as THREE from 'three';
import {
  Collider,
  Dead,
  DelayedStrike,
  EnemyAI,
  Hazard,
  Projectile,
  StatusEffects,
  Tether,
  Transform,
  Trap,
} from '../core/components';
import type { Entity, World } from '../core/ecs';
import type { GameEvent, TelegraphShape, VfxKind } from '../core/events';
import { SpriteFx } from './spriteFx';

interface TimedFx {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  age: number;
  life: number;
  active: boolean;
  update: (fx: TimedFx, t: number) => void;
  owner?: Entity;
}

const additive = (color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

const flat = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

export class VfxSystem {
  readonly root = new THREE.Group();
  private readonly pools = new Map<string, TimedFx[]>();
  private readonly arcGeometries = new Map<number, THREE.BufferGeometry>();
  private readonly coneGeometries = new Map<number, THREE.BufferGeometry>();
  private readonly ringGeo = flat(new THREE.RingGeometry(0.86, 1, 64));
  private readonly discGeo = flat(new THREE.CircleGeometry(1, 48));
  private readonly lineGeo = flat(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));

  private readonly projectiles = new Map<Entity, THREE.Mesh>();
  private readonly projectilePool: THREE.Mesh[] = [];
  private readonly projectileGeo = new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1, 2.2);
  private readonly projectileMat = new THREE.MeshBasicMaterial({ color: '#ff7a3a', fog: false });
  /** Player shots: thin tracers, one material per colour. */
  private readonly tracerGeo = new THREE.BoxGeometry(0.07, 0.07, 0.9);
  private readonly tracerMats = new Map<string, THREE.MeshBasicMaterial>();

  private readonly grenades = new Map<Entity, THREE.Mesh>();
  private readonly grenadePool: THREE.Mesh[] = [];
  private readonly grenadeGeo = new THREE.SphereGeometry(0.16, 10, 8);
  private readonly grenadeMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false });

  private readonly tethers = new Map<Entity, THREE.Mesh>();
  private readonly tetherPool: THREE.Mesh[] = [];
  private readonly tetherGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);

  private readonly traps = new Map<Entity, THREE.Group>();
  private readonly trapPool: THREE.Group[] = [];
  private readonly trapGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.1, 12);
  private readonly trapMat = new THREE.MeshStandardMaterial({ color: '#2a2e33', metalness: 0.7, roughness: 0.4 });
  private readonly trapLightGeo = new THREE.SphereGeometry(0.07, 8, 6);

  private readonly hazards = new Map<Entity, TimedFx>();
  private readonly bubbles = new Map<Entity, THREE.Mesh>();
  private readonly bubblePool: THREE.Mesh[] = [];
  private readonly bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
  private readonly stunRings = new Map<Entity, THREE.Mesh>();
  private readonly stunPool: THREE.Mesh[] = [];
  private readonly stunGeo = new THREE.TorusGeometry(0.35, 0.05, 6, 24).rotateX(Math.PI / 2);

  private readonly sparks: Sparks;
  /** Painted sprite particles (fire, smoke, spores, frost...). */
  readonly sprites: SpriteFx;
  private time = 0;
  private frameDt = 0;

  constructor() {
    this.root.name = 'vfx';
    this.sparks = new Sparks(500);
    this.sprites = new SpriteFx(`${import.meta.env.BASE_URL}assets/vfx/atlas.webp`);
    this.root.add(this.sparks.points, this.sprites.mesh);
  }

  /** React to logic events (call once per frame with the drained queue). */
  handle(event: GameEvent): void {
    switch (event.type) {
      case 'vfx':
        this.spawnVfx(event.kind, event.x, event.z, event.radius, event.facing, event.arcDeg ?? 90);
        break;
      case 'telegraph':
        this.spawnTelegraph(event.owner, event.x, event.z, event.shape, event.duration, event.color);
        break;
      case 'damage':
        if (!event.dot && event.amount + event.absorbed > 0) {
          const color = event.toPlayer ? '#ff5544' : event.crit ? '#ffd27a' : '#ffb070';
          this.sparks.emit(event.x, event.y - 0.8, event.z, event.crit ? 16 : 8, color, event.crit ? 7 : 5);
          this.sprites.hit(event.x, event.y - 0.8, event.z, color, event.crit ? 1.4 : 0.8);
        }
        break;
      case 'death':
        if (!event.isPlayer) {
          this.sparks.emit(event.x, 0.8, event.z, 20, '#9a8a70', 4);
          this.sprites.dustRing(event.x, event.z, 0.7, '#6a5e50', 5);
        }
        break;
      default:
        break;
    }
  }

  /** Per-frame update: timed effects plus effects mirrored from ECS state. */
  update(world: World, dt: number, alpha: number): void {
    this.time += dt;
    this.frameDt = dt;
    for (const pool of this.pools.values()) {
      for (const fx of pool) {
        if (!fx.active) continue;
        fx.age += dt;
        // Telegraphs vanish early if their owner is interrupted or dies.
        if (fx.owner !== undefined) {
          const ai = world.get(fx.owner, EnemyAI);
          if (!world.isAlive(fx.owner) || world.has(fx.owner, Dead) || (ai && ai.state !== 'windup')) fx.age = fx.life;
        }
        if (fx.age >= fx.life) {
          fx.active = false;
          fx.group.visible = false;
          continue;
        }
        fx.update(fx, fx.age / fx.life);
      }
    }
    this.syncProjectiles(world, alpha);
    this.syncGrenades(world);
    this.syncTraps(world);
    this.syncTethers(world, alpha);
    this.syncHazards(world, dt);
    this.syncStatuses(world, alpha, dt);
    this.sparks.update(dt);
    this.sprites.update(dt);
  }

  // ---- Timed effects ---------------------------------------------------------

  private acquire(key: string, build: () => Omit<TimedFx, 'age' | 'life' | 'active' | 'update'>): TimedFx {
    let pool = this.pools.get(key);
    if (!pool) {
      pool = [];
      this.pools.set(key, pool);
    }
    let fx = pool.find((f) => !f.active);
    if (!fx) {
      const built = build();
      fx = { ...built, age: 0, life: 1, active: false, update: () => {} };
      this.root.add(fx.group);
      pool.push(fx);
    }
    fx.age = 0;
    fx.active = true;
    fx.owner = undefined;
    fx.group.visible = true;
    fx.group.rotation.set(0, 0, 0);
    fx.group.scale.set(1, 1, 1);
    return fx;
  }

  private ring(color: string): Omit<TimedFx, 'age' | 'life' | 'active' | 'update'> {
    const mat = additive(color);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.ringGeo, mat));
    return { group, materials: [mat] };
  }

  private spawnRing(key: string, color: string, x: number, z: number, radius: number, life: number, from = 0.2, y = 0.05): void {
    const fx = this.acquire(key, () => this.ring(color));
    fx.life = life;
    fx.group.position.set(x, y, z);
    fx.update = (f, t) => {
      const ease = 1 - (1 - t) * (1 - t);
      const r = radius * (from + (1 - from) * ease);
      f.group.scale.set(r, 1, r);
      f.materials[0]!.opacity = (1 - t) * 0.9;
    };
    fx.update(fx, 0);
  }

  private spawnPullRing(x: number, z: number, radius: number): void {
    const fx = this.acquire('ring:pull', () => this.ring('#7ec8ff'));
    fx.life = 0.35;
    fx.group.position.set(x, 0.05, z);
    fx.update = (f, t) => {
      const r = radius * (1 - 0.85 * t);
      f.group.scale.set(r, 1, r);
      f.materials[0]!.opacity = 0.9 * (1 - t * 0.6);
    };
    fx.update(fx, 0);
  }

  /** Vertical light column for the orbital strike. */
  private spawnBeam(x: number, z: number, radius: number): void {
    const fx = this.acquire('beam', () => {
      const mat = additive('#cfefff', 0.9);
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0), mat));
      return { group, materials: [mat] };
    });
    fx.life = 0.5;
    fx.group.position.set(x, 0, z);
    fx.update = (f, t) => {
      const w = radius * (1 - t * 0.7);
      f.group.scale.set(w, 40, w);
      f.materials[0]!.opacity = 0.9 * (1 - t);
    };
    fx.update(fx, 0);
  }

  private arcGeometry(arcDeg: number): THREE.BufferGeometry {
    let g = this.arcGeometries.get(arcDeg);
    if (!g) {
      const len = (arcDeg * Math.PI) / 180;
      g = flat(new THREE.RingGeometry(0.45, 1, 24, 1, Math.PI / 2 - len / 2, len));
      this.arcGeometries.set(arcDeg, g);
    }
    return g;
  }

  private coneGeometry(arcDeg: number): THREE.BufferGeometry {
    let g = this.coneGeometries.get(arcDeg);
    if (!g) {
      const len = (arcDeg * Math.PI) / 180;
      g = flat(new THREE.CircleGeometry(1, 24, Math.PI / 2 - len / 2, len));
      this.coneGeometries.set(arcDeg, g);
    }
    return g;
  }

  private spawnVfx(kind: VfxKind, x: number, z: number, radius: number, facing: number, arcDeg: number): void {
    switch (kind) {
      case 'slash':
      case 'enemySlash': {
        const color = kind === 'slash' ? '#ffb15a' : '#ff4a3a';
        const fx = this.acquire(`${kind}:${arcDeg}`, () => {
          const mat = additive(color);
          const group = new THREE.Group();
          group.add(new THREE.Mesh(this.arcGeometry(arcDeg), mat));
          return { group, materials: [mat] };
        });
        fx.life = 0.16;
        fx.group.position.set(x, 0.9, z);
        fx.group.rotation.y = facing + Math.PI;
        fx.update = (f, t) => {
          const r = radius * (0.75 + 0.25 * t);
          f.group.scale.set(r, 1, r);
          f.materials[0]!.opacity = (1 - t) * 0.45;
        };
        fx.update(fx, 0);
        this.sprites.slash(x, z, radius, facing, kind === 'slash' ? '#ffe2b8' : '#ff6a5a');
        break;
      }
      case 'flame': {
        // Flamethrower stream: a flickering orange cone and embers along it.
        const fx = this.acquire(`flame:${arcDeg}`, () => {
          const mat = additive('#ff7a1a');
          const group = new THREE.Group();
          group.add(new THREE.Mesh(this.arcGeometry(arcDeg), mat));
          return { group, materials: [mat] };
        });
        fx.life = 0.28;
        fx.group.position.set(x, 0.8, z);
        fx.group.rotation.y = facing + Math.PI;
        fx.update = (f, t) => {
          const r = radius * (0.55 + 0.45 * t);
          f.group.scale.set(r, 1, r);
          f.materials[0]!.opacity = (1 - t) * 0.15;
        };
        fx.update(fx, 0);
        this.sprites.flameCone(x, z, radius, facing, arcDeg);
        break;
      }
      case 'shockwave':
        this.spawnRing('ring:shock', '#ff9a40', x, z, radius, 0.38);
        this.sparks.emit(x, 0.2, z, 20, '#ff9a40', 9);
        this.sprites.dustRing(x, z, radius * 0.6);
        this.sprites.cracks(x, z, radius * 0.7);
        break;
      case 'leapLand':
        this.spawnRing('ring:shock', '#ff9a40', x, z, radius, 0.42);
        this.sparks.emit(x, 0.2, z, 24, '#ffb070', 10);
        this.sprites.dustRing(x, z, radius * 0.7, '#8a7a64', 12);
        this.sprites.cracks(x, z, radius * 0.8);
        break;
      case 'sporePulse':
        this.spawnRing('ring:spore', '#6bff7a', x, z, radius, 0.5);
        this.sprites.sporeBurst(x, z, radius * 0.6);
        break;
      case 'shield':
        this.spawnRing('ring:shield', '#9fd8ff', x, z, 2.2, 0.35, 0.3, 1);
        this.sprites.shield(x, z);
        break;
      case 'heal':
        this.spawnRing('ring:heal', '#7dff9a', x, z, 1.6, 0.45, 0.2, 0.1);
        this.sprites.heal(x, z);
        break;
      case 'dodge':
        this.spawnRing('ring:dodge', '#c9c2b6', x, z, 1.2, 0.3, 0.3);
        this.sprites.dustRing(x, z, 0.5, '#7a6e60', 5);
        break;
      case 'pull':
        // Inward ring: starts wide and collapses onto the caster, with lightning reaching in.
        this.spawnPullRing(x, z, radius);
        this.sparks.emit(x, 0.4, z, 20, '#7ec8ff', 6);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + this.time;
          this.sprites.arc(x + Math.sin(a) * radius, 0.4, z + Math.cos(a) * radius, x, 0.4, z, '#bfe0ff');
        }
        break;
      case 'vent':
        this.spawnRing('ring:vent', '#ff6a1a', x, z, radius, 0.5, 0.1);
        this.sparks.emit(x, 0.4, z, 30, '#ff7a1a', 12);
        this.sprites.fireVent(x, z, radius);
        break;
      case 'orbital':
        this.spawnRing('ring:orbital', '#9fd8ff', x, z, radius * 1.2, 0.6, 0.1);
        this.spawnBeam(x, z, radius * 0.45);
        this.sparks.emit(x, 0.5, z, 50, '#bfe8ff', 14);
        this.sprites.orbital(x, z, radius);
        break;
      case 'flash':
        // A crystal shatters: a blinding white-cyan burst.
        this.spawnRing('ring:flash', '#e8ffff', x, z, radius, 0.35, 0.05, 1);
        this.sparks.emit(x, 1.2, z, 30, '#bfffff', 9);
        this.sprites.flash(x, z, radius);
        break;
      case 'flare':
        // A flare lands and catches: red sparks (its light comes from the light pool).
        this.spawnRing('ring:flare', '#ff5a3a', x, z, 1.6, 0.4, 0.2, 0.6);
        this.sparks.emit(x, 0.6, z, 20, '#ff8a5a', 5);
        this.sprites.flare(x, z);
        break;
      case 'dust':
        // Grit trickling from the roof before a cave-in.
        this.spawnRing('ring:dust', '#c8b08a', x, z, radius, 1.2, 0.6, 0.25);
        this.sprites.fallingDust(x, z, radius);
        break;
      case 'coolant':
        this.spawnRing('ring:coolant', '#7ec8ff', x, z, 2.4, 0.5, 0.2, 0.3);
        this.sparks.emit(x, 1, z, 20, '#bfe8ff', 4);
        this.sprites.frostBurst(x, z, Math.max(2.4, radius));
        break;
      case 'boltHit':
        this.sparks.emit(x, 1.2, z, 10, '#ff7a3a', 4);
        this.sprites.hit(x, 1.2, z, '#ffb070', 1.1);
        break;
      case 'muzzle':
        this.sparks.emit(x, 1.2, z, 5, '#bff4ff', 3);
        this.sprites.glow(x, 1.2, z, 1.1, '#bff4ff', 0.1);
        this.sprites.hit(x, 1.2, z, '#dff8ff', 0.7);
        break;
      case 'shotHit':
        this.sparks.emit(x, 1.2, z, 8, '#9fe8ff', 4);
        this.sprites.hit(x, 1.2, z, '#bff0ff', 1);
        break;
      case 'explosion':
        this.spawnRing('ring:explode', '#ff8a2a', x, z, radius, 0.4, 0.15);
        this.sparks.emit(x, 0.4, z, 24, '#ff9a40', 9);
        this.sprites.explosion(x, z, radius);
        break;
      case 'bomblet':
        this.sparks.emit(x, 0.3, z, 8, '#ffb060', 6);
        this.sprites.explosion(x, z, radius * 0.8, { scorch: false });
        break;
      case 'trapPlace':
        this.spawnRing('ring:trap', '#ff5a4a', x, z, radius, 0.35, 0.6);
        this.sprites.rune('rune_trap_0', x, z, radius);
        break;
      case 'blink':
        this.spawnRing('ring:blink', '#5ad2ff', x, z, radius, 0.3, 0.2, 0.6);
        this.sparks.emit(x, 1, z, 12, '#5ad2ff', 4);
        this.sprites.blink(x, z, Math.max(1.2, radius));
        break;
      case 'smoke':
        this.spawnRing('ring:smoke', '#8a96a8', x, z, 3.2, 0.9, 0.2, 0.4);
        this.sprites.smokeScreen(x, z, 3);
        break;
      case 'raise':
        this.spawnRing('ring:raise', '#6bff7a', x, z, radius * 1.4, 0.6, 0.2);
        this.sparks.emit(x, 0.6, z, 16, '#8aff6a', 3.5);
        this.sprites.wisps(x, z, radius);
        break;
      case 'minionSlash':
        this.sparks.emit(x + Math.sin(facing) * 1, 1, z + Math.cos(facing) * 1, 6, '#8aff6a', 3);
        this.sprites.slash(x, z, 1.6, facing, '#9aff7a');
        break;
      case 'slam':
        this.spawnRing('ring:slam', '#6bff7a', x, z, radius, 0.45, 0.2);
        this.sparks.emit(x, 0.3, z, 24, '#6bff7a', 9);
        this.sprites.cracks(x, z, radius, '#9aff7a');
        this.sprites.dustRing(x, z, radius * 0.6, '#5a6a48', 10);
        this.sprites.sporeBurst(x, z, radius * 0.5);
        break;
      case 'corpseBurst':
        this.spawnRing('ring:corpse', '#9aff5a', x, z, radius, 0.4, 0.15);
        this.sparks.emit(x, 0.5, z, 24, '#9aff5a', 8);
        this.sprites.corpseBurst(x, z, radius);
        break;
      case 'mark':
        this.spawnRing('ring:mark', '#ff4a6a', x, z, radius, 0.5, 1, 0.08);
        this.sprites.rune('rune_mark_0', x, z, radius, 0.7);
        break;
    }
  }

  private spawnTelegraph(owner: Entity | null, x: number, z: number, shape: TelegraphShape, duration: number, color: string): void {
    const key = shape.kind === 'cone' ? `tele:cone:${shape.arcDeg}` : `tele:${shape.kind}`;
    const fx = this.acquire(key, () => {
      const geo = shape.kind === 'cone' ? this.coneGeometry(shape.arcDeg) : shape.kind === 'line' ? this.lineGeo : this.discGeo;
      const outline = additive(color, 0.18);
      const fill = additive(color, 0.35);
      const group = new THREE.Group();
      const outer = new THREE.Mesh(geo, outline);
      const inner = new THREE.Mesh(geo, fill);
      inner.position.y = 0.005;
      group.add(outer, inner);
      return { group, materials: [outline, fill] };
    });
    fx.materials.forEach((m) => m.color.set(color));
    fx.owner = owner ?? undefined;
    fx.life = duration;
    fx.group.position.set(x, 0.03, z);
    const inner = fx.group.children[1]!;
    if (shape.kind === 'line') {
      fx.group.rotation.y = shape.facing + Math.PI;
      fx.group.scale.set(shape.width, 1, shape.length);
      fx.update = (f, t) => {
        inner.scale.set(1, 1, t);
        f.materials[0]!.opacity = 0.12 + 0.12 * t;
      };
    } else {
      if (shape.kind === 'cone') fx.group.rotation.y = shape.facing + Math.PI;
      fx.group.scale.set(shape.radius, 1, shape.radius);
      // Fill grows from the centre: when it reaches the edge, the attack lands.
      fx.update = (f, t) => {
        inner.scale.set(t, 1, t);
        f.materials[0]!.opacity = 0.12 + 0.12 * t;
      };
    }
    fx.update(fx, 0);
  }

  // ---- ECS-mirrored effects ---------------------------------------------------

  private syncProjectiles(world: World, alpha: number): void {
    const seen = new Set<Entity>();
    for (const e of world.query(Projectile, Transform)) {
      seen.add(e);
      let mesh = this.projectiles.get(e);
      if (!mesh) {
        mesh = this.projectilePool.pop() ?? new THREE.Mesh(this.projectileGeo, this.projectileMat);
        const color = world.req(e, Projectile).skill?.color;
        if (color) {
          mesh.geometry = this.tracerGeo;
          mesh.material = this.tracerMat(color);
        } else {
          mesh.geometry = this.projectileGeo;
          mesh.material = this.projectileMat;
        }
        mesh.visible = true;
        this.root.add(mesh);
        this.projectiles.set(e, mesh);
      }
      const tr = world.req(e, Transform);
      mesh.position.set(
        tr.prevX + (tr.x - tr.prevX) * alpha,
        tr.prevY + (tr.y - tr.prevY) * alpha,
        tr.prevZ + (tr.z - tr.prevZ) * alpha,
      );
      mesh.rotation.y = tr.facing;
      // A glowing trail: the shot's colour for players, hot orange for enemy bolts.
      const color = world.req(e, Projectile).skill?.color;
      this.sprites.trail(`p${e}`, mesh.position.x, mesh.position.y, mesh.position.z, color ?? '#ff8a3a', this.frameDt, color ? 0.45 : 0.7);
    }
    for (const [e, mesh] of this.projectiles) {
      if (seen.has(e)) continue;
      mesh.visible = false;
      this.projectilePool.push(mesh);
      this.projectiles.delete(e);
    }
  }

  private tracerMat(color: string): THREE.MeshBasicMaterial {
    let m = this.tracerMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, fog: false });
      this.tracerMats.set(color, m);
    }
    return m;
  }

  /** Grenades fly in an arc from the thrower to where they will explode. */
  private syncGrenades(world: World): void {
    const seen = new Set<Entity>();
    for (const e of world.query(DelayedStrike, Transform)) {
      const strike = world.req(e, DelayedStrike);
      if (strike.vfx !== 'grenade') continue;
      seen.add(e);
      let mesh = this.grenades.get(e);
      if (!mesh) {
        mesh = this.grenadePool.pop() ?? new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
        mesh.visible = true;
        this.root.add(mesh);
        this.grenades.set(e, mesh);
      }
      const tr = world.req(e, Transform);
      const t = 1 - Math.max(0, strike.remaining) / strike.duration;
      const dist = Math.hypot(tr.x - strike.fromX, tr.z - strike.fromZ);
      mesh.position.set(
        strike.fromX + (tr.x - strike.fromX) * t,
        1.2 * (1 - t) + 0.15 + (1.5 + dist * 0.25) * 4 * t * (1 - t),
        strike.fromZ + (tr.z - strike.fromZ) * t,
      );
      this.sprites.trail(`g${e}`, mesh.position.x, mesh.position.y, mesh.position.z, '#ffc070', this.frameDt, 0.4);
    }
    this.release(this.grenades, seen, this.grenadePool);
  }

  /** Parasite Link: a pulsing green beam from the owner to each tethered enemy. */
  private syncTethers(world: World, alpha: number): void {
    const seen = new Set<Entity>();
    const pos = (e: Entity) => {
      const t = world.req(e, Transform);
      return new THREE.Vector3(t.prevX + (t.x - t.prevX) * alpha, 1.1, t.prevZ + (t.z - t.prevZ) * alpha);
    };
    for (const e of world.query(Tether)) {
      const t = world.req(e, Tether);
      if (!world.has(t.owner, Transform) || !world.has(t.target, Transform)) continue;
      seen.add(e);
      let mesh = this.tethers.get(e);
      if (!mesh) {
        mesh = this.tetherPool.pop() ?? new THREE.Mesh(this.tetherGeo, additive('#7dff5a', 0.8));
        mesh.visible = true;
        this.root.add(mesh);
        this.tethers.set(e, mesh);
      }
      const a = pos(t.owner);
      const b = pos(t.target);
      mesh.position.copy(a);
      mesh.lookAt(b);
      const width = 1 + 0.6 * Math.sin(this.time * 14 + e);
      mesh.scale.set(width, width, a.distanceTo(b));
    }
    this.release(this.tethers, seen, this.tetherPool);
  }

  /** Mines: a small puck with a light that blinks while arming and glows red when armed. */
  private syncTraps(world: World): void {
    const seen = new Set<Entity>();
    for (const e of world.query(Trap, Transform)) {
      seen.add(e);
      let group = this.traps.get(e);
      if (!group) {
        group = this.trapPool.pop();
        if (!group) {
          group = new THREE.Group();
          const puck = new THREE.Mesh(this.trapGeo, this.trapMat);
          puck.position.y = 0.05;
          const light = new THREE.Mesh(this.trapLightGeo, additive('#ff3a2a'));
          light.position.y = 0.13;
          group.add(puck, light);
        }
        group.visible = true;
        this.root.add(group);
        this.traps.set(e, group);
      }
      const trap = world.req(e, Trap);
      const tr = world.req(e, Transform);
      group.position.set(tr.x, 0, tr.z);
      const light = (group.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      light.opacity = trap.arming > 0 ? (Math.sin(this.time * 18) > 0 ? 0.9 : 0.15) : 0.7 + 0.3 * Math.sin(this.time * 6);
    }
    for (const [e, group] of this.traps) {
      if (seen.has(e)) continue;
      group.visible = false;
      this.trapPool.push(group);
      this.traps.delete(e);
    }
  }

  private syncHazards(world: World, dt: number): void {
    const seen = new Set<Entity>();
    for (const e of world.query(Hazard, Transform)) {
      seen.add(e);
      const hz = world.req(e, Hazard);
      const look = hazardLook(hz);
      let fx = this.hazards.get(e);
      const mine = hz.team === 'player';
      if (!fx) {
        // Enemy clouds are bright green (danger); the player's own are a paler yellow-green.
        // Elite fire and snare fields bring their own colour.
        const color = hz.color ?? (mine ? '#c8ff6a' : '#5dff6a');
        const band = hz.inner !== undefined ? Math.round((hz.inner / hz.radius) * 50) / 50 : null;
        fx = this.acquire(`hazard:${color}:${band ?? ''}`, () => {
          const mat = additive(color, 0.3);
          const ringMat = additive(hz.color ?? (mine ? '#e8ffb0' : '#9dff7a'), 0.5);
          const group = new THREE.Group();
          // Ring hazards (a collapsing floor) cover only the band outside `inner`.
          const fill = band !== null ? flat(new THREE.RingGeometry(band, 1, 64)) : this.discGeo;
          const edge = band !== null ? flat(new THREE.RingGeometry(band, band + 0.02, 64)) : this.ringGeo;
          group.add(new THREE.Mesh(fill, mat), new THREE.Mesh(edge, ringMat));
          return { group, materials: [mat, ringMat] };
        });
        fx.life = Infinity;
        fx.update = () => {};
        this.hazards.set(e, fx);
      }
      const tr = world.req(e, Transform);
      const fade = Math.min(1, hz.remaining / 0.6) * Math.min(1, (hz.duration - hz.remaining) / 0.25);
      const pulse = 1 + Math.sin(this.time * 6) * 0.04;
      fx.group.position.set(tr.x, 0.04, tr.z);
      fx.group.scale.set(hz.radius * pulse, 1, hz.radius * pulse);
      // Painted fire, gas and frost do the filling; the disc stays faint to show the exact edge.
      const painted = look !== 'plain' && hz.inner === undefined;
      fx.materials[0]!.opacity = (painted ? 0.05 : mine ? 0.1 : hz.inner !== undefined ? 0.55 : 0.22) * fade;
      fx.materials[1]!.opacity = (painted ? 0.3 : mine ? 0.35 : 0.5) * fade;
      if (painted && fade > 0.3) {
        if (look === 'fire') this.sprites.fireField(`h${e}`, tr.x, tr.z, hz.radius, dt, fade);
        else if (look === 'gas') this.sprites.sporeField(`h${e}`, tr.x, tr.z, hz.radius, dt, mine, hz.color);
        else this.sprites.chilled(`h${e}`, tr.x, 0, tr.z, hz.radius, dt * hz.radius, false);
      }
    }
    for (const [e, fx] of this.hazards) {
      if (seen.has(e)) continue;
      fx.active = false;
      fx.group.visible = false;
      this.hazards.delete(e);
    }
  }

  private syncStatuses(world: World, alpha: number, dt: number): void {
    const bubbleSeen = new Set<Entity>();
    const stunSeen = new Set<Entity>();
    for (const e of world.query(StatusEffects, Transform)) {
      if (world.has(e, Dead)) continue;
      const effects = world.req(e, StatusEffects);
      const tr = world.req(e, Transform);
      const x = tr.prevX + (tr.x - tr.prevX) * alpha;
      const y = tr.prevY + (tr.y - tr.prevY) * alpha;
      const z = tr.prevZ + (tr.z - tr.prevZ) * alpha;
      const radius = world.get(e, Collider)?.radius ?? 0.5;

      let barrier = 0;
      let stunned = false;
      for (const s of effects.list) {
        if (s.id === 'barrier') barrier += s.amount;
        if (s.id === 'stunned' || s.id === 'frozen') stunned = true;
        // Painted status effects: fire on the burning, bubbles on the poisoned, frost on the cold.
        if (s.id === 'burning') this.sprites.burning(`b${e}`, x, y, z, radius, dt);
        else if (s.id === 'poisoned') this.sprites.poisoned(`t${e}`, x, y, z, radius, dt);
        else if (s.id === 'chilled' || s.id === 'frozen') this.sprites.chilled(`c${e}`, x, y, z, radius, dt, s.id === 'frozen');
      }

      if (barrier > 0) {
        bubbleSeen.add(e);
        let bubble = this.bubbles.get(e);
        if (!bubble) {
          bubble = this.bubblePool.pop() ?? new THREE.Mesh(this.bubbleGeo, additive('#7fc8ff', 0.18));
          bubble.visible = true;
          this.root.add(bubble);
          this.bubbles.set(e, bubble);
        }
        const r = radius * 2.1;
        bubble.position.set(x, y + r * 0.75, z);
        bubble.scale.set(r, r * 1.1, r);
        (bubble.material as THREE.MeshBasicMaterial).opacity = (world.has(e, EnemyAI) ? 0.06 : 0.12) + Math.sin(this.time * 5) * 0.02;
      }

      if (stunned) {
        stunSeen.add(e);
        let ring = this.stunRings.get(e);
        if (!ring) {
          ring = this.stunPool.pop() ?? new THREE.Mesh(this.stunGeo, additive('#ffe066', 0.9));
          ring.visible = true;
          this.root.add(ring);
          this.stunRings.set(e, ring);
        }
        ring.position.set(x, y + 2.1, z);
        ring.rotation.y = this.time * 6;
      }
    }
    this.release(this.bubbles, bubbleSeen, this.bubblePool);
    this.release(this.stunRings, stunSeen, this.stunPool);
  }

  private release(map: Map<Entity, THREE.Mesh>, seen: Set<Entity>, pool: THREE.Mesh[]): void {
    for (const [e, mesh] of map) {
      if (seen.has(e)) continue;
      mesh.visible = false;
      pool.push(mesh);
      map.delete(e);
    }
  }
}

/** How a ground hazard is painted: by what it does to whoever stands in it. */
function hazardLook(hz: Hazard): 'fire' | 'gas' | 'frost' | 'plain' {
  const ids = hz.applies.map((a) => a.status);
  if (ids.includes('burning')) return 'fire';
  if (ids.includes('poisoned')) return 'gas';
  if (ids.includes('chilled') || ids.includes('frozen')) return 'frost';
  return 'plain';
}

/** Tiny CPU particle system for hit sparks (one draw call). */
class Sparks {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private next = 0;
  private readonly color = new THREE.Color();

  constructor(private readonly count: number) {
    this.pos = new Float32Array(count * 3).fill(-1000);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.14,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, n: number, color: string, speed: number): void {
    this.color.set(color);
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.count;
      // Visual-only randomness.
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.9;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos[k * 3] = x;
      this.pos[k * 3 + 1] = y;
      this.pos[k * 3 + 2] = z;
      this.vel[k * 3] = Math.cos(a) * s;
      this.vel[k * 3 + 1] = up * s * 0.8;
      this.vel[k * 3 + 2] = Math.sin(a) * s;
      this.life[k] = 0.35 + Math.random() * 0.3;
      this.col[k * 3] = this.color.r;
      this.col[k * 3 + 1] = this.color.g;
      this.col[k * 3 + 2] = this.color.b;
    }
  }

  update(dt: number): void {
    for (let k = 0; k < this.count; k++) {
      if (this.life[k]! <= 0) continue;
      this.life[k]! -= dt;
      if (this.life[k]! <= 0) {
        this.pos[k * 3 + 1] = -1000;
        continue;
      }
      this.vel[k * 3 + 1]! -= 18 * dt;
      this.pos[k * 3]! += this.vel[k * 3]! * dt;
      this.pos[k * 3 + 1] = Math.max(0.02, this.pos[k * 3 + 1]! + this.vel[k * 3 + 1]! * dt);
      this.pos[k * 3 + 2]! += this.vel[k * 3 + 2]! * dt;
      // Fade by darkening (additive blending makes black invisible).
      const f = Math.min(1, this.life[k]! / 0.25);
      this.col[k * 3]! *= 0.9 + 0.1 * f;
      this.col[k * 3 + 1]! *= 0.9 + 0.1 * f;
      this.col[k * 3 + 2]! *= 0.9 + 0.1 * f;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.color!.needsUpdate = true;
  }
}
