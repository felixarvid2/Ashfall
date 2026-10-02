/**
 * Owns the Three.js renderer, scene and camera, and mirrors ECS state into the
 * scene each frame. Game logic never imports this module.
 */
import * as THREE from 'three';
import type { Entity, World } from '../core/ecs';
import { CombatStats, Dead, EnemyAI, ForcedMove, MinionAI, Mover, Renderable, SkillUser, StatusEffects, Transform, Turret } from '../core/components';
import type { GameEvent } from '../core/events';
import { STATUS_DEFS, enemyDef, skill } from '../data/db';
import { CharacterAnimator, type PlayRequest } from './animator';
import { Rng } from '../core/rng';
import type { ArenaDef } from '../data/zones/testArena';
import { scatterInstances } from '../world/arena';
import { angleDelta } from '../systems/movement';
import { AshFall } from './ash';
import { AssetLibrary, type TintSlot } from './assets';
import { CameraRig } from './camera';
import { VfxSystem } from './vfx';
import { LootVisuals } from './lootVisuals';
import { PostFx, type GraphicsQuality } from './postfx';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly assets = new AssetLibrary();
  private readonly ash = new AshFall();
  readonly vfx = new VfxSystem();
  readonly loot = new LootVisuals();
  private readonly postfx: PostFx;
  private readonly objects = new Map<Entity, THREE.Object3D>();
  /** Seconds of white hit-flash left per entity. */
  private readonly flashes = new Map<Entity, number>();
  private readonly animators = new Map<Entity, CharacterAnimator>();
  /** Last time each entity played its hit reaction (seconds), to avoid stutter under constant hits. */
  private readonly lastHitAnim = new Map<Entity, number>();
  /** Simulation speed (0 during hit-stop) so animations freeze with the world. */
  animationTimeScale = 1;
  private readonly tint = new THREE.Color();
  private time = 0;
  screenShake = true;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly moon: THREE.DirectionalLight;
  /** Warm light that travels with the player (the classic ARPG "light radius"). */
  private readonly playerLight = new THREE.PointLight('#ffd2a1', 0, 0, 2);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly projected = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Post-processing renders several passes per frame; count them all for the debug stats.
    this.renderer.info.autoReset = false;

    this.rig = new CameraRig(1);
    this.postfx = new PostFx(this.renderer, this.scene, this.rig.camera);
    this.moon = new THREE.DirectionalLight();
    this.scene.add(this.ash.points, this.vfx.root, this.loot.root);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Static environment: lights, fog, ground, instanced scatter. */
  buildArena(arena: ArenaDef): void {
    const s = this.scene;
    s.background = new THREE.Color(arena.fog.color);
    s.fog = new THREE.FogExp2(arena.fog.color, arena.fog.density);
    s.add(new THREE.AmbientLight(arena.ambient.color, arena.ambient.intensity));
    s.add(new THREE.HemisphereLight('#4a5466', '#2a2018', arena.ambient.intensity * 1.6));
    const pl = arena.playerLight;
    this.playerLight.color.set(pl.color);
    this.playerLight.intensity = pl.intensity;
    this.playerLight.distance = pl.distance;
    s.add(this.playerLight);

    this.moon.color.set(arena.moon.color);
    this.moon.intensity = arena.moon.intensity;
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -22;
    sc.right = sc.top = 22;
    sc.near = 1;
    sc.far = 80;
    this.moon.shadow.bias = -0.0005;
    s.add(this.moon, this.moon.target);

    const size = arena.halfSize * 2 + 40;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), color: 0x8a847c, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // Roads (open-world zones): flat dark ribbons along each polyline.
    const roads = (arena as { roads?: { width: number; points: [number, number][] }[] }).roads ?? [];
    if (roads.length) {
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x57504a, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
      for (const road of roads) s.add(roadMesh(road.points, road.width, roadMat));
    }

    const glowTexture = makeGlowTexture();
    // Lights come from a small pool moved to the lamps nearest the camera (hundreds of real point
    // lights would make every material's shader far too expensive).
    this.lightSpots = [];
    for (const prop of arena.props) {
      if (!prop.light) continue;
      const light = { x: prop.x, z: prop.z, ...prop.light };
      this.lightSpots.push(light);
      // A soft additive sprite makes the lamp itself read as a light source (and blooms).
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: prop.light.color,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          fog: false,
        }),
      );
      glow.position.set(prop.x, prop.light.height, prop.z);
      glow.scale.setScalar(prop.asset === 'prop.lumen_growth' ? 1.2 : 1.1);
      glow.material.opacity = prop.asset === 'prop.lumen_growth' ? 0.35 : 0.9;
      s.add(glow);
    }

    // Scatter is split into square chunks so frustum culling (and the shadow pass) skip the
    // parts of a big region that are off screen.
    const CHUNK = 48;
    arena.scatter.forEach((def, index) => {
      const { geometry, material } = this.assets.instancingParts(def.asset);
      const chunks = new Map<string, ReturnType<typeof scatterInstances>>();
      for (const inst of scatterInstances(arena, index)) {
        const key = `${Math.floor(inst.x / CHUNK)},${Math.floor(inst.z / CHUNK)}`;
        let list = chunks.get(key);
        if (!list) chunks.set(key, (list = []));
        list.push(inst);
      }
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (const instances of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
        instances.forEach((inst, i) => {
          q.setFromAxisAngle(up, inst.rot);
          m.compose(new THREE.Vector3(inst.x, -0.05, inst.z), q, new THREE.Vector3(inst.scale, inst.scale * 0.8, inst.scale));
          mesh.setMatrixAt(i, m);
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        s.add(mesh);
      }
    });
  }

  private lightSpots: { x: number; z: number; color: string; intensity: number; distance: number; height: number }[] = [];
  private readonly lightPool: THREE.PointLight[] = [];
  private lightTimer = 0;

  /** Move the pooled point lights to the lamps nearest the focus point. */
  private updateLightPool(fx: number, fz: number, dt: number): void {
    if (this.lightPool.length === 0) {
      for (let i = 0; i < LIGHT_POOL; i++) {
        const l = new THREE.PointLight('#ffffff', 0, 10, 2);
        this.lightPool.push(l);
        this.scene.add(l);
      }
    }
    this.lightTimer -= dt;
    if (this.lightTimer > 0) return;
    this.lightTimer = 0.2;
    const nearest = this.lightSpots
      .map((l) => ({ l, d: (l.x - fx) ** 2 + (l.z - fz) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHT_POOL);
    this.lightPool.forEach((light, i) => {
      const spot = nearest[i]?.l;
      if (!spot) {
        light.intensity = 0;
        return;
      }
      light.color.set(spot.color);
      light.intensity = spot.intensity;
      light.distance = spot.distance;
      light.position.set(spot.x, spot.height, spot.z);
    });
  }

  /** Point on the ground under the cursor, or null if the ray misses. */
  pickGround(ndcX: number, ndcY: number): { x: number; z: number } | null {
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, this.hit);
    return point ? { x: point.x, z: point.z } : null;
  }

  /** Feed logic events to effects and the camera. */
  handleEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      this.vfx.handle(event);
      if (event.type === 'damage' && !event.dot) this.flashes.set(event.target, 0.1);
      if (event.type === 'shake' && this.screenShake) this.rig.addTrauma(event.trauma);
    }
  }

  /** Mirror ECS → scene, interpolating between the last two ticks by `alpha`. */
  sync(world: World, alpha: number, frameDt: number): void {
    this.time += frameDt;
    const seen = new Set<Entity>();
    for (const e of world.query(Transform, Renderable)) {
      seen.add(e);
      const tr = world.req(e, Transform);
      let obj = this.objects.get(e);
      if (!obj) {
        const r = world.req(e, Renderable);
        // Characters get their own material so they can flash and tint.
        obj = this.assets.create(r.assetId, world.has(e, StatusEffects));
        obj.scale.setScalar(r.scale ?? 1);
        if (r.landmark) {
          // Landmarks read as dark silhouettes through the fog from anywhere in the region.
          obj.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m && 'fog' in m) {
              const own = m.clone() as THREE.MeshStandardMaterial;
              own.fog = false;
              if (own.color) own.color.multiplyScalar(0.35);
              (o as THREE.Mesh).material = own;
            }
          });
        }
        this.objects.set(e, obj);
        this.scene.add(obj);
        const clips = this.assets.clips(r.assetId);
        if (clips.size > 0) this.animators.set(e, new CharacterAnimator(obj, clips));
      }
      // Cull far-away static props (the fog hides them anyway); characters and landmarks stay.
      const r = world.req(e, Renderable);
      if (!r.landmark && !world.has(e, Mover)) {
        const f = this.rig.focusPoint;
        const visible = (tr.x - f.x) ** 2 + (tr.z - f.z) ** 2 < CULL_DISTANCE * CULL_DISTANCE;
        obj.visible = visible;
        if (!visible) continue;
      }
      obj.position.set(
        tr.prevX + (tr.x - tr.prevX) * alpha,
        tr.prevY + (tr.y - tr.prevY) * alpha,
        tr.prevZ + (tr.z - tr.prevZ) * alpha,
      );
      obj.rotation.y = tr.prevFacing + angleDelta(tr.prevFacing, tr.facing) * alpha;
      // Hovering machines bob gently (procedural animation, brief §9.4).
      if (tr.y > 0.5 && world.has(e, EnemyAI)) obj.position.y += Math.sin(this.time * 3 + e) * 0.08;

      const turret = world.get(e, Turret);
      if (turret) {
        // Wrath of Lumen: rises out of the ground, sways, and squashes on each slam.
        const age = (obj.userData.age = ((obj.userData.age as number | undefined) ?? 0) + frameDt);
        const rise = Math.min(1, age / 0.5);
        if (obj.userData.slamSeq !== turret.slamSeq) {
          obj.userData.slamSeq = turret.slamSeq;
          obj.userData.slamAt = age;
        }
        const since = age - ((obj.userData.slamAt as number | undefined) ?? -10);
        const squash = since < 0.35 ? 1 - 0.25 * Math.sin((since / 0.35) * Math.PI) : 1;
        const base = world.req(e, Renderable).scale ?? 1;
        obj.scale.set(base * (2 - squash), base * squash * rise, base * (2 - squash));
        obj.position.y -= (1 - rise) * 2;
        obj.rotation.z = Math.sin(this.time * 1.7 + e) * 0.05;
      }

      const animator = this.animators.get(e);
      if (animator) {
        animator.play(this.animationFor(world, e, animator));
        animator.update(frameDt * this.animationTimeScale);
      }

      const dead = world.get(e, Dead);
      // Bodies sink into the ash during their last second (corpses linger for Xenomant skills).
      const sinkAt = dead ? Math.max(dead.removeAfter - 1, Math.min(1.6, dead.removeAfter)) : 0;
      if (dead && animator?.has('death')) {
        // The death clip handles the fall; just sink the body afterwards.
        if (dead.elapsed > sinkAt) obj.position.y -= (dead.elapsed - sinkAt) * 0.8;
      } else if (dead) {
        // Topple over, then sink into the ash.
        const fall = Math.min(1, dead.elapsed / 0.3);
        obj.rotation.set(0, dead.fallDir, 0);
        obj.rotateX((Math.PI / 2) * fall * 0.95);
        if (dead.elapsed > sinkAt) obj.position.y -= (dead.elapsed - sinkAt) * 0.8;
      } else if (obj.rotation.x !== 0) {
        obj.rotation.x = 0;
        obj.rotation.z = 0;
      }
      this.applyTint(world, e, obj, frameDt);
    }
    for (const [e, obj] of this.objects) {
      if (!seen.has(e)) {
        this.scene.remove(obj);
        this.objects.delete(e);
        this.flashes.delete(e);
        this.animators.delete(e);
        this.lastHitAnim.delete(e);
      }
    }
    this.vfx.update(world, frameDt, alpha);
    this.loot.update(world, frameDt);
  }

  /** Pick the animation for what the entity is doing this frame. */
  private animationFor(world: World, e: Entity, animator: CharacterAnimator): PlayRequest {
    if (world.has(e, Dead)) return { state: 'death', loop: false, token: 'death' };

    const user = world.get(e, SkillUser);
    const fm = world.get(e, ForcedMove);
    if (fm && fm.height > 0) return { state: 'cast', loop: false, fit: fm.duration, token: fm };
    if (user?.cast) {
      const def = skill(user.cast.skillId);
      const state = def.anim ?? (def.category === 'basic' ? 'attack' : 'cast');
      const speed = 1 + (world.get(e, CombatStats)?.attackSpeed ?? 0);
      return { state, loop: false, fit: (def.castTime + def.recovery) / speed, token: user.cast };
    }
    const minion = world.get(e, MinionAI);
    if (minion && (minion.state === 'windup' || minion.state === 'recover')) {
      return { state: 'attack', loop: false, fit: minion.windup + 0.3, token: minion.attackSeq };
    }
    const ai = world.get(e, EnemyAI);
    if (ai && (ai.state === 'windup' || ai.state === 'recover')) {
      const def = enemyDef(ai.defId);
      const atk = def.attack;
      const fit = atk.windup + (atk.kind === 'melee' ? atk.recovery : 0.3);
      return { state: atk.kind === 'buffAllies' ? 'cast' : 'attack', loop: false, fit, token: ai.attackSeq };
    }

    const flash = this.flashes.get(e) ?? 0;
    const lastHit = this.lastHitAnim.get(e) ?? -10;
    if (flash > 0.05 && this.time - lastHit > 0.8 && animator.has('hit')) {
      this.lastHitAnim.set(e, this.time);
      return { state: 'hit', loop: false, fit: 0.45, token: this.time };
    }
    if (animator.state === 'hit' && this.time - lastHit < 0.45) return { state: 'hit', loop: false, token: lastHit };

    const mover = world.get(e, Mover);
    const speed = mover ? Math.hypot(mover.vx, mover.vz) * mover.speedMul : 0;
    if (speed > 0.2 && mover) {
      const ratio = speed / mover.speed;
      return { state: 'run', loop: true, speed: THREE.MathUtils.clamp(ratio * 1.1, 0.6, 1.6) };
    }
    return { state: 'idle', loop: true, speed: 1 };
  }

  /** Hit flash and status colours via the materials' emissive channel. */
  private applyTint(world: World, e: Entity, obj: THREE.Object3D, dt: number): void {
    const slots = obj.userData.tint as TintSlot[] | undefined;
    if (!slots || slots.length === 0) return;
    let flash = this.flashes.get(e) ?? 0;
    if (flash > 0) {
      flash -= dt;
      this.flashes.set(e, flash);
    }
    const effects = world.get(e, StatusEffects);
    const priority = ['burning', 'poisoned', 'chilled', 'frozen', 'marked', 'vulnerable'] as const;
    const active = effects && !world.has(e, Dead) ? priority.find((id) => effects.list.some((s) => s.id === id)) : undefined;
    if (active) this.tint.set(STATUS_DEFS[active].color);
    // Holograms (decoys) and stealthed characters are drawn see-through.
    const hologram = world.get(e, Renderable)?.hologram ?? false;
    const glow = world.has(e, Dead) ? undefined : world.get(e, Renderable)?.glow;
    const stealth = effects?.list.some((s) => s.id === 'stealth') ?? false;
    const opacity = hologram ? 0.45 + 0.1 * Math.sin(this.time * 12) : stealth ? 0.3 : 1;
    for (const slot of slots) {
      const see = opacity < 1;
      if (slot.material.transparent !== see) {
        slot.material.transparent = see;
        slot.material.depthWrite = !see;
        slot.material.needsUpdate = true;
      }
      slot.material.opacity = opacity;
      if (hologram) {
        slot.material.emissive.set('#3ab8ff');
        slot.material.emissiveIntensity = 0.9;
        continue;
      }
      if (glow && !flash && !active) {
        slot.material.emissive.set(glow);
        slot.material.emissiveIntensity = 0.35 + 0.1 * Math.sin(this.time * 4 + e);
        continue;
      }
      if (flash > 0) {
        slot.material.emissive.set('#ffffff');
        slot.material.emissiveIntensity = 1.2;
      } else if (active) {
        slot.material.emissive.copy(this.tint);
        slot.material.emissiveIntensity = 0.16 + 0.1 * Math.sin(this.time * 10);
      } else {
        slot.material.emissive.copy(slot.baseEmissive);
        slot.material.emissiveIntensity = slot.baseIntensity;
      }
    }
  }

  /** Project a world point to CSS pixels (for damage numbers). Null if behind the camera. */
  toScreen(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    this.projected.set(x, y, z).project(this.rig.camera);
    if (this.projected.z > 1) return false;
    out.x = (this.projected.x * 0.5 + 0.5) * this.canvas.clientWidth;
    out.y = (-this.projected.y * 0.5 + 0.5) * this.canvas.clientHeight;
    return true;
  }

  /** Follow a world position with the camera and draw a frame. */
  render(frameDt: number, followX: number, followY: number, followZ: number): void {
    this.rig.update(followX, followY, followZ, frameDt);
    const f = this.rig.focusPoint;
    // Keep the shadow frustum centred on the action.
    this.playerLight.position.set(followX, 4.5, followZ);
    this.updateLightPool(followX, followZ, frameDt);
    this.moon.position.set(f.x - 12, 30, f.z + 6);
    this.moon.target.position.set(f.x, 0, f.z);
    this.ash.update(frameDt, f);
    this.renderer.info.reset();
    this.postfx.render(this.scene, this.rig.camera);
  }

  /** Apply a graphics preset: post-processing, shadow resolution and pixel ratio. */
  setQuality(quality: GraphicsQuality): void {
    this.postfx.setQuality(quality);
    this.renderer.shadowMap.enabled = quality !== 'low';
    const size = quality === 'high' ? 2048 : 1024;
    if (this.moon.shadow.mapSize.x !== size) {
      this.moon.shadow.mapSize.set(size, size);
      this.moon.shadow.map?.dispose();
      this.moon.shadow.map = null;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
    this.resize();
  }

  get stats(): { drawCalls: number; triangles: number } {
    const info = this.renderer.info.render;
    return { drawCalls: info.calls, triangles: info.triangles };
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.postfx?.setSize(w, h);
    this.rig.setAspect(w / h);
  }
}

const LIGHT_POOL = 12;
const CULL_DISTANCE = 95;

/** A flat strip along a polyline (roads). */
function roadMesh(points: [number, number][], width: number, material: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  const uv: number[] = [];
  let dist = 0;
  points.forEach(([x, z], i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    if (i > 0) dist += Math.hypot(x - points[i - 1]![0], z - points[i - 1]![1]);
    const h = width / 2;
    pos.push(x - dz * h, 0.03, z + dx * h, x + dz * h, 0.03, z - dx * h);
    uv.push(0, dist / width, 1, dist / width);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Radial gradient used for lamp glows. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural ash-and-cinder ground texture (deterministic). */
function makeGroundTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new Rng('ground-texture');
  ctx.fillStyle = '#5b5650';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const v = rng.int(50, 120);
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 6},${rng.range(0.15, 0.5)})`;
    const r = rng.range(1, 6);
    ctx.fillRect(rng.range(0, size), rng.range(0, size), r, r);
  }
  ctx.strokeStyle = 'rgba(15,12,10,0.6)';
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = rng.range(0.5, 2);
    ctx.beginPath();
    let x = rng.range(0, size);
    let y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += rng.range(-30, 30);
      y += rng.range(-30, 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
