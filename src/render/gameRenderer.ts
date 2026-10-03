/**
 * Owns the Three.js renderer, scene and camera, and mirrors ECS state into the
 * scene each frame. Game logic never imports this module.
 */
import * as THREE from 'three';
import type { Entity, World } from '../core/ecs';
import { CombatStats, Dead, EnemyAI, ForcedMove, Interactable, PlayerControlled, MinionAI, Mover, Renderable, SkillUser, StatusEffects, Transform, Turret } from '../core/components';
import type { GameEvent } from '../core/events';
import { STATUS_DEFS, enemyDef, skill } from '../data/db';
import { CLASS_WEAPONS } from '../data/weapons';
import { CharacterAnimator, type PlayRequest } from './animator';
import { Rng } from '../core/rng';
import type { ArenaDef } from '../data/zones/testArena';
import type { EnvFeature } from '../data/zones/zoneTypes';
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
  /** Ash Storm exposure (0..1): infected enemies glow through the ash. */
  stormGlow = 0;
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

  /** Static environment: lights, fog, ground, instanced scatter. Calling it again swaps zones. */
  buildArena(arena: ArenaDef): void {
    this.exitInstance();
    this.disposeZone();
    const root = new THREE.Group();
    this.zoneRoot = root;
    this.scene.add(root);
    const s = root;
    this.scene.background = new THREE.Color(arena.fog.color);
    this.scene.fog = new THREE.FogExp2(arena.fog.color, arena.fog.density);
    this.zoneLook = { fog: arena.fog, ambient: arena.ambient };
    if (!this.ambientLight || !this.hemiLight) {
      this.ambientLight = new THREE.AmbientLight();
      this.hemiLight = new THREE.HemisphereLight('#4a5466', '#2a2018');
      this.scene.add(this.ambientLight, this.hemiLight, this.playerLight, this.moon, this.moon.target);
    }
    this.ambientLight.color.set(arena.ambient.color);
    this.ambientLight.intensity = arena.ambient.intensity;
    this.hemiLight.intensity = arena.ambient.intensity * 1.6;
    const pl = arena.playerLight;
    this.playerLight.color.set(pl.color);
    this.playerLight.intensity = pl.intensity;
    this.playerLight.distance = pl.distance;

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

    const env = (arena as { env?: EnvFeature[] }).env ?? [];
    if (env.length) this.buildEnv(s, env);

    const glowTexture = makeGlowTexture();
    // Lights come from a small pool moved to the lamps nearest the camera (hundreds of real point
    // lights would make every material's shader far too expensive).
    this.lightSpots = [];
    this.lightTimer = 0;
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

    this.lightSpots.push(...this.envLights);

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

  private zoneRoot: THREE.Group | null = null;
  /** Scrolling belt surface and the molten-metal glow (animated each frame). */
  private beltTexture: THREE.Texture | null = null;
  private moltenMaterial: THREE.MeshBasicMaterial | null = null;
  private lavaTime: { value: number } | null = null;
  private envLights: typeof this.lightSpots = [];

  /** Conveyor belts (chevrons scrolling along the direction of travel) and pools of molten metal. */
  private buildEnv(root: THREE.Group, env: EnvFeature[]): void {
    const belts = env.filter((f): f is Extract<EnvFeature, { kind: 'conveyor' }> => f.kind === 'conveyor');
    const pools = env.filter((f): f is Extract<EnvFeature, { kind: 'molten' }> => f.kind === 'molten');
    this.envLights = [];
    if (belts.length) {
      const tex = makeBeltTexture();
      this.beltTexture = tex;
      const surface = new THREE.MeshStandardMaterial({ map: tex, color: 0xb0a898, roughness: 0.7, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
      const rail = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.6, metalness: 0.7 });
      for (const b of belts) {
        const group = new THREE.Group();
        group.position.set(b.x, 0, b.z);
        group.rotation.y = b.dir;
        const geo = new THREE.PlaneGeometry(b.width, b.length);
        // One chevron per 2 m of belt.
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (b.length / 2));
        const belt = new THREE.Mesh(geo, surface);
        belt.rotation.x = -Math.PI / 2;
        belt.position.y = 0.04;
        belt.receiveShadow = true;
        group.add(belt);
        for (const side of [-1, 1]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, b.length), rail);
          r.position.set(side * (b.width / 2 + 0.18), 0.17, 0);
          r.castShadow = true;
          group.add(r);
        }
        root.add(group);
      }
    } else this.beltTexture = null;
    if (pools.length) {
      // Overlapping discs of one flat, unlit colour read as a single river; a dark crust rims it.
      const disc = new THREE.CircleGeometry(1, 24);
      disc.rotateX(-Math.PI / 2);
      // Molten metal glows through the haze (no fog) so rivers read from a distance. The crust
      // pattern is sampled in world space so overlapping discs join into one seamless river.
      const glow = new THREE.MeshBasicMaterial({ color: '#ff7a24', map: makeLavaTexture(), fog: false, polygonOffset: true, polygonOffsetFactor: -3 });
      const lavaTime = { value: 0 };
      this.lavaTime = lavaTime;
      glow.onBeforeCompile = (shader) => {
        shader.uniforms.lavaTime = lavaTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vLavaUv;\nuniform float lavaTime;')
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvec4 lavaWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);\nvLavaUv = lavaWorld.xz * 0.07 + vec2(lavaTime * 0.01, lavaTime * 0.006);',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vLavaUv;')
          .replace('#include <map_fragment>', 'diffuseColor *= texture2D(map, vLavaUv);');
      };
      glow.customProgramCacheKey = () => 'lava';
      const crust = new THREE.MeshBasicMaterial({ color: '#3a1408', polygonOffset: true, polygonOffsetFactor: -1 });
      this.moltenMaterial = glow;
      const hot = new THREE.InstancedMesh(disc, glow, pools.length);
      const rim = new THREE.InstancedMesh(disc, crust, pools.length);
      const m = new THREE.Matrix4();
      pools.forEach((p, i) => {
        m.makeScale(p.radius, 1, p.radius).setPosition(p.x, 0.03, p.z);
        hot.setMatrixAt(i, m);
        m.makeScale(p.radius * 1.18, 1, p.radius * 1.18).setPosition(p.x, 0.02, p.z);
        rim.setMatrixAt(i, m);
        if (i % 3 === 0) this.envLights.push({ x: p.x, z: p.z, color: '#ff5a1a', intensity: 45, distance: 13, height: 1.2 });
      });
      hot.computeBoundingSphere();
      rim.computeBoundingSphere();
      hot.userData.own = rim.userData.own = true;
      root.add(rim, hot);
    } else this.moltenMaterial = null;
  }

  /** Drop the current zone's ground, roads, lamp glows and scatter (shared model assets stay). */
  private disposeZone(): void {
    const root = this.zoneRoot;
    if (!root) return;
    this.scene.remove(root);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      // Instanced scatter shares geometry and material with the asset cache; only free our own.
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        (o as THREE.InstancedMesh).dispose();
        if (!o.userData.own) return;
      }
      // Sprites share one geometry across the whole scene.
      if (!(o as THREE.Sprite).isSprite) m.geometry?.dispose();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
      mat?.map?.dispose();
      mat?.dispose();
    });
    this.zoneRoot = null;
  }

  private lightSpots: { x: number; z: number; color: string; intensity: number; distance: number; height: number }[] = [];
  private zoneLook: { fog: { color: string; density: number }; ambient: { color: string; intensity: number } } | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private instanceRoot: THREE.Group | null = null;
  private zoneLightSpots: typeof this.lightSpots | null = null;

  /** Dungeon interiors: their own floor, fog, ambient light and lamps (the zone stays loaded). */
  enterInstance(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    theme: { floor: string; fog: { color: string; density: number }; ambient: { color: string; intensity: number } },
    lights: typeof this.lightSpots,
  ): void {
    this.exitInstance();
    const root = new THREE.Group();
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), color: theme.floor, roughness: 1, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((bounds.minX + bounds.maxX) / 2, 0.01, (bounds.minZ + bounds.maxZ) / 2);
    floor.receiveShadow = true;
    root.add(floor);
    this.scene.add(root);
    this.instanceRoot = root;
    this.setLook(theme.fog, theme.ambient);
    this.zoneLightSpots = this.lightSpots;
    this.lightSpots = lights;
    this.lightTimer = 0;
  }

  /** Lamps lit while inside (generators that come online). */
  setInstanceLights(lights: typeof this.lightSpots): void {
    if (this.instanceRoot) this.lightSpots = lights;
  }

  exitInstance(): void {
    if (!this.instanceRoot) return;
    this.scene.remove(this.instanceRoot);
    this.instanceRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    this.instanceRoot = null;
    if (this.zoneLightSpots) this.lightSpots = this.zoneLightSpots;
    this.zoneLightSpots = null;
    this.lightTimer = 0;
    if (this.zoneLook) this.setLook(this.zoneLook.fog, this.zoneLook.ambient);
  }

  /** Fog and ambient light (Ash Storms thicken the fog; instances have their own). */
  setLook(fog: { color: string; density: number }, ambient?: { color: string; intensity: number }): void {
    this.scene.background = new THREE.Color(fog.color);
    this.scene.fog = new THREE.FogExp2(fog.color, fog.density);
    if (ambient && this.ambientLight && this.hemiLight) {
      this.ambientLight.color.set(ambient.color);
      this.ambientLight.intensity = ambient.intensity;
      this.hemiLight.intensity = ambient.intensity * 1.6;
    }
  }
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

  /** Put the class's weapons into the character's hands (bone attachments). */
  private attachWeapons(obj: THREE.Object3D, classId: string): void {
    obj.updateMatrixWorld(true);
    for (const mount of CLASS_WEAPONS[classId] ?? []) {
      const bone = obj.getObjectByName(mount.bone);
      if (!bone || !this.assets.has(mount.asset)) continue;
      const weapon = this.assets.create(mount.asset);
      weapon.traverse((o) => {
        o.castShadow = true;
        o.userData.noTint = true;
      });
      // The armature is scaled (centimetre bones), so undo the bone's world scale.
      const ws = new THREE.Vector3();
      bone.getWorldScale(ws);
      const pivot = new THREE.Group();
      pivot.name = `weapon:${mount.asset}`;
      pivot.scale.setScalar(1 / ws.x);
      pivot.rotation.set(...mount.rot);
      if (mount.offset) pivot.position.set(...mount.offset).multiplyScalar(1 / ws.x);
      weapon.position.y = -mount.grip * mount.length;
      pivot.add(weapon);
      pivot.userData.mount = mount;
      bone.add(pivot);
    }
  }

  /** Debug: change every held weapon's rotation (tuning mounts). */
  setWeaponRotation(rot: [number, number, number], offset?: [number, number, number]): void {
    for (const obj of this.objects.values()) {
      obj.traverse((o) => {
        if (!o.name.startsWith('weapon:')) return;
        o.rotation.set(...rot);
        if (offset) o.position.set(...offset).multiplyScalar(o.scale.x);
      });
    }
  }

  private readonly fadedMaterials = new Map<THREE.Material, THREE.Material>();
  private readonly sizeCache = new Map<string, { h: number; r: number }>();

  /** Does this static prop stand between the camera and the player's upper body? */
  private occludes(r: Renderable, x: number, z: number): boolean {
    let size = this.sizeCache.get(r.assetId);
    if (!size) {
      const entry = this.assets.entry(r.assetId);
      const p = entry.placeholder?.size ?? [1, 1, 1];
      size = { h: entry.heightMeters ?? p[1], r: Math.max(p[0], p[2]) / 2 };
      this.sizeCache.set(r.assetId, size);
    }
    const scale = r.scale ?? 1;
    const h = size.h * scale;
    if (h < 4.5) return false;
    const f = this.rig.focusPoint;
    const cam = this.rig.camera.position;
    const vx = cam.x - f.x;
    const vz = cam.z - f.z;
    const len2 = vx * vx + vz * vz;
    if (len2 < 1e-6) return false;
    const t = Math.max(0, Math.min(1, ((x - f.x) * vx + (z - f.z) * vz) / len2));
    if (t <= 0) return false;
    const d = Math.hypot(f.x + vx * t - x, f.z + vz * t - z);
    const rayY = 1.4 + t * (cam.y - 1.4);
    return d < size.r * scale + 1.2 && rayY < h;
  }

  private setFaded(obj: THREE.Object3D, on: boolean): void {
    if (Boolean(obj.userData.faded) === on) return;
    obj.userData.faded = on;
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if (on) {
        mesh.userData.solid = mesh.material;
        let faded = this.fadedMaterials.get(mesh.material);
        if (!faded) {
          faded = mesh.material.clone();
          faded.transparent = true;
          faded.opacity = 0.22;
          faded.depthWrite = false;
          this.fadedMaterials.set(mesh.material, faded);
        }
        mesh.material = faded;
      } else if (mesh.userData.solid) {
        mesh.material = mesh.userData.solid as THREE.Material;
        delete mesh.userData.solid;
      }
    });
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
        obj = this.assets.create(r.assetId, world.has(e, StatusEffects) || world.has(e, Interactable) || r.glow !== undefined);
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
        const user = world.get(e, SkillUser);
        if (user && world.has(e, PlayerControlled)) this.attachWeapons(obj, user.classId);
        // Rim light keeps characters readable against the dark ground (docs/world-and-gameplay.md §14).
        if (world.has(e, PlayerControlled)) addRim(obj, '#a8bcdf', 0.55);
        else if (world.has(e, EnemyAI)) addRim(obj, '#e07a4a', 0.32);
        this.objects.set(e, obj);
        this.scene.add(obj);
        const clips = this.assets.clips(r.assetId);
        if (clips.size > 0) this.animators.set(e, new CharacterAnimator(obj, clips));
      }
      // Cull far-away static props (the fog hides them anyway); characters and landmarks stay.
      const r = world.req(e, Renderable);
      if (!world.has(e, Mover)) {
        if (!r.landmark) {
          const f = this.rig.focusPoint;
          const visible = (tr.x - f.x) ** 2 + (tr.z - f.z) ** 2 < CULL_DISTANCE * CULL_DISTANCE;
          obj.visible = visible;
          if (!visible) continue;
        }
        // Tall props between the camera and the player turn see-through (smokestacks, towers).
        this.setFaded(obj, this.occludes(r, tr.x, tr.z));
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
      const ai = world.get(e, EnemyAI);
      let lean: { pitch: number; roll: number } | null = null;
      if (!animator && ai && tr.y <= 0.5 && !world.has(e, Dead)) {
        // Unrigged ground creatures (hounds, the boss): a procedural gait while moving, a crouch
        // during the wind-up and a forward lunge on the strike.
        const speed = Math.hypot(tr.x - tr.prevX, tr.z - tr.prevZ) * 60;
        const gait = Math.min(1, speed / 3);
        const phase = this.time * (6 + speed * 1.4) + e;
        obj.position.y += Math.abs(Math.sin(phase)) * 0.12 * gait;
        let pitch = Math.sin(phase * 2) * 0.04 * gait;
        if (ai.state === 'windup') pitch = -0.16;
        else if (ai.state === 'recover') pitch = 0.22;
        lean = { pitch, roll: Math.sin(phase) * 0.06 * gait };
      }
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
      if (lean) {
        // Yaw first, then pitch and roll about the creature's own axes.
        obj.rotation.order = 'YXZ';
        obj.rotation.x = lean.pitch;
        obj.rotation.z = lean.roll;
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
    // Leaps play the leap clip; dodges (flat forced moves of the player) the roll.
    if (fm && fm.height > 0) return { state: 'leap', loop: false, fit: fm.duration, token: fm };
    if (fm && world.has(e, PlayerControlled) && animator.has('dodge')) return { state: 'dodge', loop: false, fit: fm.duration, token: fm };
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
    const ai = world.get(e, EnemyAI);
    const family = ai ? enemyDef(ai.defId).family : null;
    const infected = !world.has(e, Dead) && (family === 'infected' || family === 'lumen');
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
      if (this.stormGlow > 0 && !flash && !active && infected) {
        slot.material.emissive.set('#5dff6a');
        slot.material.emissiveIntensity = this.stormGlow * (0.45 + 0.1 * Math.sin(this.time * 3 + e));
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
    // Belts scroll at 3.2 m/s (one chevron per 2 m); molten metal breathes.
    if (this.beltTexture) this.beltTexture.offset.y = (this.beltTexture.offset.y - frameDt * 1.6 * this.animationTimeScale) % 1;
    // Post-processing tone-maps the scene: a moderate colour stays orange instead of washing out.
    if (this.moltenMaterial) this.moltenMaterial.color.setHSL(0.045, 1, 0.38 + Math.sin(this.time * 1.7) * 0.04);
    if (this.lavaTime) this.lavaTime.value = this.time;
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
/** Bright molten metal with darker cooling crust plates (tiles seamlessly). */
function makeLavaTexture(): THREE.Texture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffb060';
  g.fillRect(0, 0, n, n);
  const rng = new Rng('lava');
  // Crust plates, drawn wrapped around the edges so the tile repeats without seams.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, n);
    const y = rng.range(0, n);
    const r = rng.range(6, 18);
    const shade = Math.round(rng.range(30, 80));
    const squash = rng.range(0.5, 1);
    const turn = rng.range(0, Math.PI);
    g.fillStyle = `rgb(${shade + 20}, ${Math.round(shade * 0.45)}, ${Math.round(shade * 0.2)})`;
    for (const dx of [-n, 0, n]) {
      for (const dy of [-n, 0, n]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, r, r * squash, turn, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark rubber with a pale chevron pointing along +v (the direction of travel). */
function makeBeltTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#26221e';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1a1714';
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2);
  g.strokeStyle = '#c8a24a';
  g.lineWidth = 7;
  g.beginPath();
  // Canvas y grows downwards while texture v grows upwards: draw the chevron pointing up.
  g.moveTo(10, 46);
  g.lineTo(32, 20);
  g.lineTo(54, 46);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

/** Fresnel rim on a character's (own, cloned) standard materials. */
function addRim(obj: THREE.Object3D, color: string, strength: number): void {
  const rim = new THREE.Color(color).multiplyScalar(strength);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || o.userData.noTint) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!(mat instanceof THREE.MeshStandardMaterial) || mat.userData.rim) return;
    mat.userData.rim = true;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.rimColor = { value: rim };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 rimColor;\nvoid main() {')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);\n  totalEmissiveRadiance += rimColor * rimF;',
        );
    };
    mat.customProgramCacheKey = () => `rim-${color}`;
    mat.needsUpdate = true;
  });
}

