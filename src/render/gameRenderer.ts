/**
 * Owns the Three.js renderer, scene and camera, and mirrors ECS state into the
 * scene each frame. Game logic never imports this module.
 */
import * as THREE from 'three';
import type { Entity, World } from '../core/ecs';
import { Dead, EnemyAI, ForcedMove, Mover, Renderable, SkillUser, StatusEffects, Transform } from '../core/components';
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
import { PostFx, type GraphicsQuality } from './postfx';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly assets = new AssetLibrary();
  private readonly ash = new AshFall();
  readonly vfx = new VfxSystem();
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
    this.scene.add(this.ash.points, this.vfx.root);
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

    const glowTexture = makeGlowTexture();
    for (const prop of arena.props) {
      if (!prop.light) continue;
      const light = new THREE.PointLight(prop.light.color, prop.light.intensity, prop.light.distance, 2);
      light.position.set(prop.x, prop.light.height, prop.z);
      s.add(light);
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
      glow.position.copy(light.position);
      glow.scale.setScalar(prop.asset === 'prop.lumen_growth' ? 1.2 : 1.1);
      glow.material.opacity = prop.asset === 'prop.lumen_growth' ? 0.35 : 0.9;
      s.add(glow);
    }

    arena.scatter.forEach((def, index) => {
      const { geometry, material } = this.assets.instancingParts(def.asset);
      const instances = scatterInstances(arena, index);
      const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      instances.forEach((inst, i) => {
        q.setFromAxisAngle(up, inst.rot);
        m.compose(
          new THREE.Vector3(inst.x, -0.05, inst.z),
          q,
          new THREE.Vector3(inst.scale, inst.scale * 0.8, inst.scale),
        );
        mesh.setMatrixAt(i, m);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.add(mesh);
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
        this.objects.set(e, obj);
        this.scene.add(obj);
        const clips = this.assets.clips(r.assetId);
        if (clips.size > 0) this.animators.set(e, new CharacterAnimator(obj, clips));
      }
      obj.position.set(
        tr.prevX + (tr.x - tr.prevX) * alpha,
        tr.prevY + (tr.y - tr.prevY) * alpha,
        tr.prevZ + (tr.z - tr.prevZ) * alpha,
      );
      obj.rotation.y = tr.prevFacing + angleDelta(tr.prevFacing, tr.facing) * alpha;
      // Hovering machines bob gently (procedural animation, brief §9.4).
      if (tr.y > 0.5 && world.has(e, EnemyAI)) obj.position.y += Math.sin(this.time * 3 + e) * 0.08;

      const animator = this.animators.get(e);
      if (animator) {
        animator.play(this.animationFor(world, e, animator));
        animator.update(frameDt * this.animationTimeScale);
      }

      const dead = world.get(e, Dead);
      if (dead && animator?.has('death')) {
        // The death clip handles the fall; just sink the body afterwards.
        if (dead.elapsed > 1.6) obj.position.y -= (dead.elapsed - 1.6) * 0.8;
      } else if (dead) {
        // Topple over, then sink into the ash.
        const fall = Math.min(1, dead.elapsed / 0.3);
        obj.rotation.set(0, dead.fallDir, 0);
        obj.rotateX((Math.PI / 2) * fall * 0.95);
        if (dead.elapsed > 1.2) obj.position.y -= (dead.elapsed - 1.2) * 0.8;
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
  }

  /** Pick the animation for what the entity is doing this frame. */
  private animationFor(world: World, e: Entity, animator: CharacterAnimator): PlayRequest {
    if (world.has(e, Dead)) return { state: 'death', loop: false, token: 'death' };

    const user = world.get(e, SkillUser);
    const fm = world.get(e, ForcedMove);
    if (fm && fm.height > 0) return { state: 'cast', loop: false, fit: fm.duration, token: fm };
    if (user?.cast) {
      const def = skill(user.cast.skillId);
      const state = def.category === 'basic' ? 'attack' : 'cast';
      return { state, loop: false, fit: def.castTime + def.recovery, token: user.cast };
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
    const priority = ['burning', 'poisoned', 'chilled', 'frozen', 'vulnerable'] as const;
    const active = effects && !world.has(e, Dead) ? priority.find((id) => effects.list.some((s) => s.id === id)) : undefined;
    if (active) this.tint.set(STATUS_DEFS[active].color);
    for (const slot of slots) {
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
