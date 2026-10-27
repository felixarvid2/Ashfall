/**
 * Owns the Three.js renderer, scene and camera, and mirrors ECS state into the
 * scene each frame. Game logic never imports this module.
 */
import * as THREE from 'three';
import { AwarenessMarkers, GuideLine, NavDebugOverlay } from './navOverlay';
import { OcclusionCue, SILHOUETTE, propBlocksView, silhouetteEnabled } from './occlusion';
import { StaticProps } from './staticProps';
import { buildDecals } from './decals';
import type { NavService } from '../systems/navigation';
import type { Entity, World } from '../core/ecs';
import { AttackTarget, Boss, Collider, CombatStats, Dead, EnemyAI, ForcedMove, Guardian, Interactable, InteractTarget, Invulnerable, MoveTarget, PickupTarget, PlayerControlled, MinionAI, Mounted, Mover, Renderable, SkillUser, StatusEffects, Transform, Turret } from '../core/components';
import type { GameEvent } from '../core/events';
import { STATUS_DEFS, enemyDef, skill } from '../data/db';
import { CLASS_WEAPONS, PROCEDURAL_PREFIX } from '../data/weapons';
import { CharacterAnimator, type PlayRequest } from './animator';
import { Rng } from '../core/rng';
import type { ArenaDef, GroundDef, GroundTexture } from '../data/zones/testArena';
import { groundSplatCached } from './groundSplat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnvFeature } from '../data/zones/zoneTypes';
import { bridgeCellsOf, caveGrid, type CaveDef, type CaveGrid } from '../data/zones/caves';
import { scatterInstances } from '../world/arena';
import { gravityFields } from '../world/theCore';
import { angleDelta } from '../systems/movement';
import { AshFall } from './ash';
import { AssetLibrary, type TintSlot } from './assets';
import { CameraRig } from './camera';
import { CoreLook, blurCut, cutCells, cutTexture, ghostMaterial, type CutField } from './coreLook';
import { ChoirLinks } from './choirLinks';
import { memoryAtmosphere, type Atmosphere } from './memoryLook';
import { proceduralWeapon } from './proceduralWeapons';
import { LOOKS, applyLookMaterials, deathFade, fadesOnDeath, lookState } from './looks';
import { VfxSystem } from './vfx';
import { disposeOwned, trackOwned } from './owned';
import { recoilCurve } from './hitRecoil';
import { LootVisuals } from './lootVisuals';
import { PostFx, type GraphicsQuality } from './postfx';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly assets = new AssetLibrary();
  private readonly ash = new AshFall();
  readonly vfx = new VfxSystem();
  readonly loot = new LootVisuals(this.assets);
  private readonly postfx: PostFx;
  private readonly objects = new Map<Entity, THREE.Object3D>();
  /** "!" and "?" over enemies; the wayfinding debug overlay when switched on. */
  private awareness: AwarenessMarkers | null = null;
  private choir: ChoirLinks | null = null;
  private navDebug: NavDebugOverlay | null = null;
  /** Rings under enemies hidden behind tall props (F018); off on the low setting. */
  private occlusionCue: OcclusionCue | null = null;
  private silhouettes = true;
  private cueTime = 0;
  private guide: GuideLine | null = null;
  /** Seconds of white hit-flash left per entity. */
  private readonly flashes = new Map<Entity, number>();
  private readonly animators = new Map<Entity, CharacterAnimator>();
  /** Last time each entity played its hit reaction (seconds), to avoid stutter under constant hits. */
  private readonly lastHitAnim = new Map<Entity, number>();
  /** Recoil in progress per enemy (F008): seconds since the hit and whether it was a crit. */
  private readonly followPos = new THREE.Vector3();
  private readonly recoils = new Map<Entity, { age: number; crit: boolean }>();
  /** The last ground-click spot marked (F005) and the real time it was shown. */
  private lastMarker: { x: number; z: number; at: number } | null = null;
  /** Death desaturation (F014) and level-up glow (F017): targets set by events, eased in `render`. */
  private deathDesat = 0;
  private deathDesatTarget = 0;
  private levelGlow = 0;
  /** Simulation speed (0 during hit-stop) so animations freeze with the world. */
  animationTimeScale = 1;
  private readonly tint = new THREE.Color();
  private time = 0;
  screenShake = true;
  /** Reduce motion (B01): no hit squash, and the camera rig drops look-ahead, crowd pull-back and push-ins. */
  get reduceMotion(): boolean {
    return this.rig.reduceMotion;
  }
  set reduceMotion(on: boolean) {
    this.rig.setReduceMotion(on);
    if (on) this.recoils.clear();
  }
  /** Accessibility (B044): no white hit flash on enemies. */
  reduceFlashing = false;
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
    this.assets.onModelLoaded((id) => this.swapPlaceholders(id));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Static environment: lights, fog, ground, instanced scatter. Calling it again swaps zones. */
  buildArena(arena: ArenaDef): void {
    this.exitInstance();
    this.disposeZone();
    this.vfx.trimPools();
    const root = new THREE.Group();
    this.zoneRoot = root;
    this.scene.add(root);
    const s = root;
    this.scene.background = new THREE.Color(arena.fog.color);
    this.scene.fog = new THREE.FogExp2(arena.fog.color, arena.fog.density);
    this.ash.setColor(arena.particles ?? '#b8b2aa');
    this.postfx.setGrade(arena.grade?.saturation, arena.grade?.tint);
    this.zoneLook = { fog: arena.fog, ambient: arena.ambient };
    this.zoneAtmosphere = { fog: arena.fog, ambient: arena.ambient, playerLight: arena.playerLight, hemisphere: arena.hemisphere, grade: arena.grade, dark: arena.dark };
    this.memory = null;
    if (!this.ambientLight || !this.hemiLight) {
      this.ambientLight = new THREE.AmbientLight();
      this.hemiLight = new THREE.HemisphereLight('#4a5466', '#2a2018');
      this.scene.add(this.ambientLight, this.hemiLight, this.playerLight, this.moon, this.moon.target);
    }
    this.ambientLight.color.set(arena.ambient.color);
    this.ambientLight.intensity = arena.ambient.intensity;
    this.hemiLight.color.set(arena.hemisphere?.sky ?? '#4a5466');
    this.hemiLight.groundColor.set(arena.hemisphere?.ground ?? '#2a2018');
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
    const groundDef = arena.ground;
    // Open air in the ground (The Core's abyss and bridges): a smoothed mask the ground shader discards by.
    const grid = caveGrid(arena);
    const caves = (arena as { caves?: CaveDef }).caves;
    const cutField: CutField | null = grid && caves && (grid.air || grid.bridges) ? blurCut(grid, cutCells(grid, caves)) : null;
    let cutTex: THREE.DataTexture | null = null;
    if (cutField) {
      cutTex = cutTexture(cutField, size);
      this.zoneTextures.push(cutTex);
    }
    const geometry = new THREE.PlaneGeometry(size, size);
    let groundMat: THREE.MeshStandardMaterial;
    if (groundDef?.base) {
      // One repeat of each texture per groundDef.tile metres: scale the UVs instead of the shared textures.
      const reps = size / groundDef.tile;
      const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * reps, uv.getY(i) * reps);
      groundMat = this.texturedGroundMaterial(groundDef, size, reps, arena.id, cutTex);
    } else {
      groundMat = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), color: 0x8a847c, roughness: 1, metalness: 0 });
    }
    const ground = new THREE.Mesh(geometry, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // Roads (open-world zones): ribbons along each polyline, textured when the zone has a road surface.
    const roads = (arena as { roads?: { width: number; points: [number, number][]; surface?: GroundTexture }[] }).roads ?? [];
    if (roads.length) {
      let roadMat: THREE.MeshStandardMaterial;
      // Ash drifts over the ragged edges: an alpha map fades both sides of the ribbon.
      const edges = groundDef?.road || roads.some((r) => r.surface) ? makeRoadEdgeTexture() : null;
      if (edges) {
        edges.repeat.set(1, 1 / 8);
        this.zoneTextures.push(edges);
      }
      const surfaces = new Map<GroundTexture, THREE.MeshStandardMaterial>();
      const surfaceMat = (name: GroundTexture) => {
        let mat = surfaces.get(name);
        if (!mat) {
          mat = new THREE.MeshStandardMaterial({
            map: this.groundTexture(name),
            alphaMap: edges,
            transparent: true,
            depthWrite: false,
            color: GROUND_TINT,
            roughness: 0.95,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          });
          surfaces.set(name, mat);
        }
        return mat;
      };
      if (!groundDef?.road) roadMat = new THREE.MeshStandardMaterial({ color: 0x57504a, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
      else roadMat = surfaceMat(groundDef.road);
      for (const road of roads) {
        // A road on the base texture itself is just ground: no ribbon over it.
        if (road.surface && road.surface === groundDef?.base) continue;
        s.add(roadMesh(road.points, road.width, road.surface ? surfaceMat(road.surface) : roadMat));
      }
    }
    buildDecals(s, arena);

    const env = (arena as { env?: EnvFeature[] }).env ?? [];
    this.sporeFields = null;
    if (env.length) this.buildEnv(s, env);
    const domes = (arena as { domes?: { x: number; z: number; radius: number }[] }).domes ?? [];
    if (domes.length) this.buildDomes(s, domes);
    this.coreLook = null;
    if (grid) this.buildCaveWalls(s, grid);
    if (grid && caves && (grid.air || grid.bridges)) {
      this.coreLook = new CoreLook(s, grid, caves, cutField, gravityFields(arena as { env?: EnvFeature[] }), arena.beams ?? [], this.glowTexture());
    }
    // Pale Lumen ground: warnings are drawn solid instead of additive.
    this.vfx.brightGround = this.coreLook !== null;
    // The Core's drifting light: motes rise out of the abyss instead of ash falling.
    if (this.coreLook) this.ash.setMotes(['#ffd88a', '#c8a4ff', '#fff0c8']);
    this.dark = arena.dark ?? false;
    this.useEnvironment(this.dark ? ENV_LIGHT.dark : ENV_LIGHT.surface);
    this.dynamicLights = [];

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
      // Clutter by the roads and hubs is seen close up: full detail, true proportions, on the ground.
      const clutter = def.near !== undefined || def.within !== undefined;
      // Distorted memories are many and floating: the light model keeps them cheap.
      const parts = this.assets.instancingParts(def.asset, def.near !== undefined ? 'full' : 'low');
      // A distorted memory: the same props in violet-rimmed, half see-through material.
      if (def.ghost) for (const part of parts) part.material = ghostMaterial(part.material, def.ghost);
      const chunks = new Map<string, ReturnType<typeof scatterInstances>>();
      for (const inst of scatterInstances(arena, index)) {
        // A memory is dense and local: bigger chunks keep the draw calls down and still cull the far side.
        const size = def.within ? CHUNK * 2 : CHUNK;
        const key = `${Math.floor(inst.x / size)},${Math.floor(inst.z / size)}`;
        let list = chunks.get(key);
        if (!list) chunks.set(key, (list = []));
        list.push(inst);
      }
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const lean = new THREE.Euler();
      for (const instances of chunks.values()) {
        for (const { geometry, material } of parts) {
          const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
          instances.forEach((inst, i) => {
            if (inst.lean) q.setFromEuler(lean.set(inst.lean.x, inst.rot, inst.lean.z, 'YXZ'));
            else q.setFromAxisAngle(up, inst.rot);
            m.compose(new THREE.Vector3(inst.x, (clutter ? -0.01 : -0.05) + (inst.lift ?? 0), inst.z), q, new THREE.Vector3(inst.scale, inst.scale * (clutter ? 1 : 0.8), inst.scale));
            mesh.setMatrixAt(i, m);
          });
          mesh.computeBoundingSphere();
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          s.add(mesh);
        }
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
      this.molten = { hot, rim, pools: pools.map((p) => ({ id: p.id, x: p.x, z: p.z, r: p.radius })), key: '' };
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
    } else {
      this.moltenMaterial = null;
      this.molten = null;
    }

    // Hydroponic Vaults: spore fields as glowing green haze, shallow water as dark still discs.
    const spores = env.filter((f): f is Extract<EnvFeature, { kind: 'spores' }> => f.kind === 'spores');
    if (spores.length) {
      const plane = new THREE.PlaneGeometry(2, 2);
      plane.rotateX(-Math.PI / 2);
      const haze = new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: '#5aff4a', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.InstancedMesh(plane, haze, spores.length);
      this.sporeFields = { mesh, fields: spores.map((f) => ({ id: f.id, x: f.x, z: f.z, r: f.radius })), key: '' };
      const m = new THREE.Matrix4();
      spores.forEach((f, i) => {
        m.makeScale(f.radius * 1.15, 1, f.radius * 1.15).setPosition(f.x, 0.08, f.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      mesh.userData.own = true;
      root.add(mesh);
    } else this.sporeFields = null;
    const water = env.filter((f): f is Extract<EnvFeature, { kind: 'water' }> => f.kind === 'water');
    if (water.length) {
      const disc = new THREE.CircleGeometry(1, 28);
      disc.rotateX(-Math.PI / 2);
      // Still, dark water that catches a little light (it must read against the night ground).
      const mat = new THREE.MeshStandardMaterial({ color: '#3a7a92', emissive: '#0e3442', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3 });
      const mesh = new THREE.InstancedMesh(disc, mat, water.length);
      const m = new THREE.Matrix4();
      water.forEach((f, i) => {
        m.makeScale(f.radius, 1, f.radius).setPosition(f.x, 0.05, f.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.userData.own = true;
      root.add(mesh);
    }
  }

  private sporeFields: { mesh: THREE.InstancedMesh; fields: { id: string; x: number; z: number; r: number }[]; key: string } | null = null;

  /** Spore fields cleared by an air filter (or a reclaimed dome) disappear. */
  updateSpores(active: (id: string) => boolean): void {
    const sf = this.sporeFields;
    if (!sf) return;
    const key = sf.fields.map((f) => (active(f.id) ? '1' : '0')).join('');
    if (key === sf.key) return;
    sf.key = key;
    const m = new THREE.Matrix4();
    sf.fields.forEach((f, i) => {
      const r = key[i] === '1' ? f.r * 1.15 : 0.0001;
      m.makeScale(r, 1, r).setPosition(f.x, 0.08, f.z);
      sf.mesh.setMatrixAt(i, m);
    });
    sf.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Glass farming domes: rings of thin ribs rising from a base ring (no collision). */
  private buildDomes(root: THREE.Group, domes: { x: number; z: number; radius: number }[]): void {
    const parts: THREE.BufferGeometry[] = [];
    for (const d of domes) {
      const h = d.radius * 0.42;
      const ribs = Math.max(8, Math.round(d.radius / 18));
      const tube = Math.min(0.9, 0.25 + d.radius / 600);
      for (let i = 0; i < ribs; i++) {
        const a = (i / ribs) * Math.PI;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 24; k++) {
          const t = (k / 24) * Math.PI;
          pts.push(new THREE.Vector3(d.x + dx * Math.cos(t) * d.radius, Math.sin(t) * h, d.z + dz * Math.cos(t) * d.radius));
        }
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, tube, 5, false));
      }
      const base = new THREE.TorusGeometry(d.radius, tube * 1.6, 6, Math.max(48, Math.round(d.radius)));
      base.rotateX(Math.PI / 2);
      base.translate(d.x, tube, d.z);
      parts.push(base);
    }
    if (!parts.length) return;
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) return;
    const mat = new THREE.MeshBasicMaterial({ color: '#4a8a70', transparent: true, opacity: 0.4, depthWrite: false });
    const mesh = new THREE.Mesh(merged, mat);
    root.add(mesh);
  }

  private molten: { hot: THREE.InstancedMesh; rim: THREE.InstancedMesh; pools: { id: string; x: number; z: number; r: number }[]; key: string } | null = null;

  /** Molten metal flooded by a coolant valve turns to dark, steaming crust until it heats up again. */
  updateCooled(cooled: ReadonlyMap<string, number>, time: number): void {
    const m = this.molten;
    if (!m) return;
    const active = [...cooled].filter(([, until]) => until > time).map(([id]) => id);
    const key = active.sort().join(',');
    if (key === m.key) return;
    m.key = key;
    const off = new Set(active);
    const mat = new THREE.Matrix4();
    m.pools.forEach((p, i) => {
      const r = off.has(p.id) ? 0.0001 : p.r;
      mat.makeScale(r, 1, r).setPosition(p.x, 0.03, p.z);
      m.hot.setMatrixAt(i, mat);
    });
    m.hot.instanceMatrix.needsUpdate = true;
  }

  private readonly groundTextures = new Map<GroundTexture, { texture: THREE.Texture; loaded: Promise<void> }>();
  /** Per-zone textures that aren't a material's map (the ground splat, road edges). */
  private zoneTextures: THREE.Texture[] = [];

  /** A painted ground texture, loaded once and shared by every zone that uses it. */
  private groundTexture(name: GroundTexture): THREE.Texture {
    let entry = this.groundTextures.get(name);
    if (!entry) {
      let done!: () => void;
      const loaded = new Promise<void>((resolve) => (done = resolve));
      const url = `${import.meta.env.BASE_URL}assets/textures/ground/${name}.webp`;
      const texture = new THREE.TextureLoader().load(url, () => done(), undefined, () => {
        console.warn(`[ground] ${name}: failed to load`);
        done();
      });
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      texture.userData.shared = true;
      entry = { texture, loaded };
      this.groundTextures.set(name, entry);
    }
    return entry.texture;
  }

  /** Load the ground textures of these zones before the first frame, so the ground doesn't pop in. */
  async preloadGround(defs: (GroundDef | undefined)[]): Promise<void> {
    const names = new Set<GroundTexture>();
    for (const def of defs) {
      if (!def) continue;
      if (def.base) names.add(def.base);
      if (def.road) names.add(def.road);
      for (const layer of def.layers) names.add(layer);
    }
    for (const name of names) this.groundTexture(name);
    await Promise.all([...names].map((name) => this.groundTextures.get(name)!.loaded));
  }

  /**
   * The base texture everywhere, two samples at different scales and angles mixed by slow noise so
   * its repeat doesn't show, then up to six overlays blended in by splat maps built from the zone's
   * patches. Each texture's look (scale, brightness, glow) comes from GROUND_LOOK: Lumen spots glow
   * green, cracks in slag glow orange, crystal and alien seams glow cyan.
   */
  private texturedGroundMaterial(def: GroundDef, size: number, reps: number, seed: string, cut: THREE.Texture | null = null): THREE.MeshStandardMaterial {
    const res = 1024;
    const count = Math.min(def.layers.length, 6);
    const splats = groundSplatCached(seed, def.patches, size, res, seed, count).map((data) => {
      const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.zoneTextures.push(tex);
      return tex;
    });
    const base = this.groundTexture(def.base!);
    const layers = def.layers.slice(0, count);
    const mat = new THREE.MeshStandardMaterial({ map: base, bumpMap: base, bumpScale: 0.8, color: GROUND_TINT, roughness: 1, metalness: 0 });
    const channels = ['r', 'g', 'b'];
    const glsl = (n: number) => n.toFixed(4);
    let body = '';
    layers.forEach((name, i) => {
      const look = GROUND_LOOK[name] ?? {};
      const scale = look.scale ?? 1;
      const offset = glsl(((i * 0.37) % 1) + 0.13);
      const weight = `splat${Math.floor(i / 3)}.${channels[i % 3]}`;
      body += `vec3 raw${i} = texture2D(groundLayer${i}, vMapUv * ${glsl(scale)} + ${offset}).rgb;\n`;
      let color = `raw${i}`;
      if (look.soften) color = `mix(vec3(${look.soften.toward.map(glsl).join(', ')}), ${color}, ${glsl(look.soften.keep)})`;
      if (look.gain) color = `(${color}) * ${glsl(look.gain)}`;
      body += `ground = mix(ground, ${color}, ${weight});\nbaseW *= 1.0 - ${weight};\n`;
      if (look.glow === 'green') {
        body += `groundGlow += vec3(0.36, 1.0, 0.42) * ${weight} * smoothstep(0.2, 0.6, raw${i}.g - max(raw${i}.r, raw${i}.b)) * 1.5;\n`;
      } else if (look.glow === 'orange') {
        body += `groundGlow += vec3(1.0, 0.42, 0.1) * ${weight} * smoothstep(0.3, 0.75, raw${i}.r - raw${i}.b) * 1.2;\n`;
      } else if (look.glow === 'blue') {
        // Bright cyan only: the spots and seams, not the blue-grey stone around them.
        body += `groundGlow += vec3(0.3, 0.8, 1.0) * ${weight} * smoothstep(0.55, 0.85, min(raw${i}.g, raw${i}.b)) * smoothstep(0.15, 0.35, raw${i}.b - raw${i}.r) * 1.6;\n`;
      }
    });
    // The base texture's own glow (the Core's gold and violet veins) shows where no overlay covers it.
    const baseLook = BASE_LOOK[def.base!] ?? {};
    if (baseLook.gain) mat.color.multiplyScalar(baseLook.gain);
    const baseGlow = baseLook.glow ? 'normalize(ground + 0.001) * 0.9 * smoothstep(0.3, 0.7, max(ground.r, max(ground.g, ground.b)) - min(ground.r, min(ground.g, ground.b)))' : 'vec3(0.0)';
    const samplers = layers.map((_, i) => `groundLayer${i}`).concat(splats.map((_, i) => `groundSplat${i}`)).concat(cut ? ['groundCut'] : []);
    // The generated shader differs per layer set: give three a cache key so zones don't share programs.
    mat.customProgramCacheKey = () => `ground:${layers.join(',')}:${def.base}:${cut ? 'cut' : ''}`;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.groundReps = { value: reps };
      layers.forEach((name, i) => (shader.uniforms[`groundLayer${i}`] = { value: this.groundTexture(name) }));
      splats.forEach((tex, i) => (shader.uniforms[`groundSplat${i}`] = { value: tex }));
      if (cut) shader.uniforms.groundCut = { value: cut };
      const splatReads = splats
        .map((_, i) => `vec4 splat${i} = texture2D(groundSplat${i}, splatUv);`)
        .join('\n');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `uniform sampler2D ${samplers.join(', ')};\nuniform float groundReps;\nvoid main() {`)
        .replace(
          '#include <map_fragment>',
          `
          // The plane's v runs from +z to -z; the splat's rows run from -z.
          vec2 splatUv = vec2(vMapUv.x, groundReps - vMapUv.y) / groundReps;
          ${splatReads}
          ${
            cut
              ? `// Open air: no ground over the abyss; the soft glowing lip is the field's last stretch before the edge.
          float cutField = texture2D(groundCut, splatUv).r;
          if (cutField > 0.5) discard;
          float lip = smoothstep(0.18, 0.5, cutField);`
              : 'float cutField = 0.0; float lip = 0.0;'
          }
          vec3 ground = mix(
            texture2D(map, vMapUv).rgb,
            texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.43 + 0.37).rgb,
            splat0.a);
          vec3 groundGlow = vec3(0.0);
          vec3 baseGlow = ${baseGlow};
          float baseW = 1.0;
          ${body}
          ${baseLook.glow ? 'groundGlow += baseGlow * baseW;' : ''}
          ${cut ? 'groundGlow += mix(vec3(0.55, 0.3, 1.0), vec3(1.0, 0.8, 0.42), smoothstep(0.3, 0.5, cutField)) * lip * lip * 0.4;' : ''}
          diffuseColor.rgb *= ground;
          `,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += groundGlow;');
    };
    return mat;
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
      if (!mat?.map?.userData.shared) mat?.map?.dispose();
      mat?.dispose();
    });
    for (const tex of this.zoneTextures) tex.dispose();
    this.zoneTextures = [];
    this.zoneRoot = null;
  }

  private lightSpots: { x: number; z: number; color: string; intensity: number; distance: number; height: number }[] = [];
  /** The zone's own atmosphere, and the memory of Lumen's phase 2 laid over it (null: none). */
  private zoneAtmosphere: Atmosphere | null = null;
  private memory: string | null = null;

  /** Lumen's phase 2: the arena takes on an earlier region's fog, light and lamp (null puts the Heart back). */
  setMemoryLook(look: 'ash' | 'fire' | 'jungle' | 'dark' | null): void {
    if (look === this.memory || !this.zoneAtmosphere || !this.ambientLight || !this.hemiLight) return;
    this.memory = look;
    const a = look ? memoryAtmosphere(look) : this.zoneAtmosphere;
    this.setLook(a.fog, a.ambient);
    this.hemiLight.color.set(a.hemisphere?.sky ?? '#4a5466');
    this.hemiLight.groundColor.set(a.hemisphere?.ground ?? '#2a2018');
    this.postfx.setGrade(a.grade?.saturation, a.grade?.tint);
    this.playerLight.color.set(a.playerLight.color);
    this.playerLight.intensity = a.playerLight.intensity;
    this.playerLight.distance = a.playerLight.distance;
    this.dark = a.dark ?? false;
    this.scene.environmentIntensity = this.dark ? ENV_LIGHT.dark : ENV_LIGHT.surface;
  }

  private zoneLook: { fog: { color: string; density: number }; ambient: { color: string; intensity: number } } | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private instanceRoot: THREE.Group | null = null;
  private zoneLightSpots: typeof this.lightSpots | null = null;

  /** Dungeon interiors: their own floor, fog, ambient light and lamps (the zone stays loaded). */
  enterInstance(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    theme: { floor: string; ground?: string; fog: { color: string; density: number }; ambient: { color: string; intensity: number } },
    lights: typeof this.lightSpots,
    water: { id: string; x: number; z: number; r: number }[] = [],
  ): void {
    this.exitInstance();
    const root = new THREE.Group();
    // Flooded tunnels (The Irrigation System): water discs that vanish as levers drain them.
    this.instanceWater = null;
    if (water.length) {
      const disc = new THREE.CircleGeometry(1, 28);
      disc.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: '#3a7a92', emissive: '#0e3442', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3 });
      const mesh = new THREE.InstancedMesh(disc, mat, water.length);
      mesh.userData.own = true;
      const m = new THREE.Matrix4();
      water.forEach((w, i) => {
        m.makeScale(w.r, 1, w.r).setPosition(w.x, 0.06, w.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      root.add(mesh);
      this.instanceWater = { mesh, water, drained: 0 };
    }
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    // The theme's painted floor, tiled every few metres and tinted toward the theme colour. (It was
    // one procedural texture stretched over the whole layout and multiplied by the dark theme
    // colour, which read as a black floor.)
    const map = this.instanceFloorTexture(theme.ground ?? 'military_concrete', w, d);
    const tint = new THREE.Color(theme.floor).lerp(new THREE.Color('#ffffff'), 0.7);
    // Pale painted floors (the Core's pearl stone) keep the brightness they are given in the zone, or the lamps blow them out.
    const gain = BASE_LOOK[(theme.ground ?? '') as GroundTexture]?.gain;
    if (gain) tint.multiplyScalar(gain);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.95, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((bounds.minX + bounds.maxX) / 2, 0.01, (bounds.minZ + bounds.maxZ) / 2);
    floor.receiveShadow = true;
    root.add(floor);
    this.scene.add(root);
    this.instanceRoot = root;
    this.setLook(theme.fog, theme.ambient);
    // Indoors the lamp is all that lights the floor between the fixtures: brighter and wider than
    // under the open sky (back to the zone's lamp on the way out).
    this.zonePlayerLight ??= { intensity: this.playerLight.intensity, distance: this.playerLight.distance };
    this.playerLight.intensity = Math.max(this.zonePlayerLight.intensity, INSTANCE_LAMP.intensity);
    this.playerLight.distance = Math.max(this.zonePlayerLight.distance, INSTANCE_LAMP.distance);
    this.zoneLightSpots = this.lightSpots;
    this.lightSpots = lights;
    this.lightTimer = 0;
  }

  /** A ground texture repeated across an instance floor of w × d metres (one tile per 7 m). */
  private instanceFloorTexture(name: string, w: number, d: number): THREE.Texture {
    // A clone of the cached ground texture: it shares the decoded image and the GPU upload, only the repeat is its own.
    const texture = this.groundTexture(name as GroundTexture).clone();
    texture.userData.shared = false; // clone() copies the flag; this copy is ours to dispose on exit
    texture.repeat.set(w / 7, d / 7);
    return texture;
  }

  private instanceWater: { mesh: THREE.InstancedMesh; water: { id: string; x: number; z: number; r: number }[]; drained: number } | null = null;

  /** Drained water disappears. */
  updateInstanceWater(drained: ReadonlySet<string>): void {
    const iw = this.instanceWater;
    if (!iw || iw.drained === drained.size) return;
    iw.drained = drained.size;
    const m = new THREE.Matrix4();
    iw.water.forEach((w, i) => {
      const r = drained.has(w.id) ? 0.0001 : w.r;
      m.makeScale(r, 1, r).setPosition(w.x, 0.06, w.z);
      iw.mesh.setMatrixAt(i, m);
    });
    iw.mesh.instanceMatrix.needsUpdate = true;
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
      // Same guard as disposeZone: only free what the renderer made (userData.own) and never a shared texture.
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        (o as THREE.InstancedMesh).dispose();
        if (!o.userData.own) return;
      }
      m.geometry?.dispose();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
      if (!mat?.map?.userData.shared) mat?.map?.dispose();
      mat?.dispose();
    });
    this.instanceRoot = null;
    this.instanceWater = null;
    if (this.zoneLightSpots) this.lightSpots = this.zoneLightSpots;
    this.zoneLightSpots = null;
    this.lightTimer = 0;
    if (this.zoneLook) this.setLook(this.zoneLook.fog, this.zoneLook.ambient);
    if (this.zonePlayerLight) {
      this.playerLight.intensity = this.zonePlayerLight.intensity;
      this.playerLight.distance = this.zonePlayerLight.distance;
      this.zonePlayerLight = null;
    }
  }

  private zonePlayerLight: { intensity: number; distance: number } | null = null;

  /** Lights that come and go in the zone: floodlights switched on, burning flares (Deep Mines). */
  setDynamicLights(spots: typeof this.lightSpots): void {
    this.dynamicLights = spots;
    this.lightTimer = 0;
    const root = this.zoneRoot;
    if (!root) return;
    // A glow sprite marks each lit floodlight or flare.
    const key = spots.map((l) => `${l.x.toFixed(1)},${l.z.toFixed(1)}`).join(';');
    if (key === this.dynamicKey) return;
    this.dynamicKey = key;
    for (const g of this.dynamicGlows) root.remove(g);
    this.dynamicGlows = spots.map((l) => {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      glow.position.set(l.x, l.height, l.z);
      glow.scale.setScalar(1.6);
      root.add(glow);
      return glow;
    });
  }
  private dynamicLights: typeof this.lightSpots = [];
  private dynamicGlows: THREE.Sprite[] = [];
  private dynamicKey = '';
  private glowTex: THREE.Texture | null = null;
  private glowTexture(): THREE.Texture {
    return (this.glowTex ??= makeGlowTexture());
  }
  /** Dark zones: enemies carry glowing eyes so they read before the lamp reaches them. */
  private dark = false;

  /**
   * Underground: solid rock everywhere the grid is not walkable. A flat black cap over the rock and
   * rough walls along every edge between rock and open ground.
   */
  private buildCaveWalls(root: THREE.Group, grid: CaveGrid): void {
    const H = 3.6;
    const { n, cell, half } = grid;
    // As drawn, an energy bridge is light laid over open air: its cells are not ground.
    const bridgeCells = bridgeCellsOf(grid);
    const data = bridgeCells.size ? grid.data.slice() : grid.data;
    for (const k of bridgeCells) data[k] = 0;
    const open = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && data[j * n + i] === 1;
    // Open air (an abyss, a melt pool) has no rock: no cap over it and no wall beside it, but a glowing drop.
    const air = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && (grid.air?.[j * n + i] === 1 || bridgeCells.has(j * n + i));
    const solid = (i: number, j: number) => !open(i, j) && !air(i, j);
    const rng = new Rng('cave-walls');
    // Deterministic per-corner jitter so neighbouring wall pieces share their corners.
    const jitter = (i: number, j: number) => {
      const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
      return (h - Math.floor(h) - 0.5) * cell * 0.8;
    };
    const capPos: number[] = [];
    for (let j = 0; j < n; j++) {
      let i = 0;
      while (i < n) {
        if (!solid(i, j)) {
          i++;
          continue;
        }
        const start = i;
        while (i < n && solid(i, j)) i++;
        const x0 = start * cell - half;
        const x1 = i * cell - half;
        const z0 = j * cell - half;
        const z1 = z0 + cell;
        capPos.push(x0, H, z0, x0, H, z1, x1, H, z1, x0, H, z0, x1, H, z1, x1, H, z0);
      }
    }
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
    capGeo.computeVertexNormals();
    const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: grid.air ? '#160f2a' : '#050404' }));
    root.add(cap);
    const wallPos: number[] = [];
    const wallCol: number[] = [];
    const wallUv: number[] = [];
    // The walls run along grid lines, so x + z measures the distance along each one.
    const TILE = 3;
    const quad = (ax: number, az: number, bx: number, bz: number, ja: [number, number], jb: [number, number]) => {
      // Tops lean in and wobble; bottoms stay on the wall line so the floor edge is clean.
      const ta = jitter(ja[0], ja[1]);
      const tb = jitter(jb[0], jb[1]);
      const nx = bz - az;
      const nz = -(bx - ax);
      const len = Math.hypot(nx, nz) || 1;
      const ox = (nx / len) * 0.6;
      const oz = (nz / len) * 0.6;
      const axT = ax + ox + ta * 0.4;
      const azT = az + oz + ta * 0.4;
      const bxT = bx + ox + tb * 0.4;
      const bzT = bz + oz + tb * 0.4;
      wallPos.push(ax, 0, az, bx, 0, bz, bxT, H, bzT, ax, 0, az, bxT, H, bzT, axT, H, azT);
      const ua = (ax + az) / TILE;
      const ub = (bx + bz) / TILE;
      const top = H / TILE;
      wallUv.push(ua, 0, ub, 0, ub, top, ua, 0, ub, top, ua, top);
      const shade = 0.75 + rng.next() * 0.35;
      for (let k = 0; k < 6; k++) wallCol.push(0.95 * shade, 0.88 * shade, 0.8 * shade);
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!open(i, j)) continue;
        const x0 = i * cell - half;
        const z0 = j * cell - half;
        const x1 = x0 + cell;
        const z1 = z0 + cell;
        // Faces point into the open cell; where the neighbour is open air the island just ends.
        if (!open(i, j - 1) && !air(i, j - 1)) quad(x1, z0, x0, z0, [i + 1, j], [i, j]);
        if (!open(i, j + 1) && !air(i, j + 1)) quad(x0, z1, x1, z1, [i, j + 1], [i + 1, j + 1]);
        if (!open(i - 1, j) && !air(i - 1, j)) quad(x0, z0, x0, z1, [i, j], [i, j + 1]);
        if (!open(i + 1, j) && !air(i + 1, j)) quad(x1, z1, x1, z0, [i + 1, j + 1], [i + 1, j]);
      }
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    wallGeo.computeVertexNormals();
    // The Core's walls are Lumen matter, lit from within (the mines' are plain rock).
    const lit = grid.air ? { emissive: new THREE.Color('#4a3c66'), emissiveIntensity: 0.18 } : {};
    const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide, ...this.rockMaps(), ...lit }));
    walls.receiveShadow = true;
    root.add(walls);
  }

  /** The Core: the abyss, island skirts, energy bridges, the shaft's beam and the gravity shimmer (src/render/coreLook.ts). */
  private coreLook: CoreLook | null = null;

  /** Called every frame with the game clock: bridges fade and flicker with their cycle, gravity fields shimmer. */
  updateCore(time: number): void {
    this.coreLook?.update(time);
  }

  private rockTextures: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

  /** Rock PBR maps for the cave walls (ambientCG Rock035, CC0), shared by every cave. */
  private rockMaps(): { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
    if (!this.rockTextures) {
      const load = (name: string, srgb: boolean) => {
        const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/textures/rock/${name}.webp`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.userData.shared = true;
        return t;
      };
      this.rockTextures = { map: load('color', true), normalMap: load('normal', false), roughnessMap: load('roughness', false) };
    }
    return this.rockTextures;
  }

  private envMap: THREE.Texture | null = null;

  /**
   * Image-based light from a Poly Haven HDRI (a burnt-out warehouse), blurred into an environment
   * map: metal and wet surfaces pick up soft reflections instead of looking flat. Loaded once for
   * all zones; dark zones keep it faint so the lamp still rules.
   */
  private useEnvironment(intensity: number): void {
    this.scene.environmentIntensity = intensity;
    if (this.envMap) return;
    const url = `${import.meta.env.BASE_URL}assets/env/burnt_warehouse.webp`;
    new THREE.TextureLoader().load(url, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envMap = pmrem.fromEquirectangular(texture).texture;
      this.scene.environment = this.envMap;
      texture.dispose();
      pmrem.dispose();
    });
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
    const nearest = [...this.lightSpots, ...(this.instanceRoot ? [] : this.dynamicLights)]
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

  /** The death screen drains the colour; respawning (or loading) brings it back (F014). */
  setDeathLook(on: boolean): void {
    this.deathDesatTarget = on ? 0.85 : 0;
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
      if (event.type === 'damage' && !event.dot && !this.reduceFlashing) this.flashes.set(event.target, 0.1);
      // Every landed non-DoT hit on an enemy recoils, however often the hit animation is throttled (F008).
      if (event.type === 'damage' && !event.dot && !event.toPlayer && event.amount + event.absorbed > 0 && !this.reduceMotion && this.objects.has(event.target)) this.recoils.set(event.target, { age: 0, crit: event.crit });
      if (event.type === 'shake' && this.screenShake && !this.reduceMotion) this.rig.addTrauma(event.trauma);
      if (event.type === 'levelUp') {
        const f = this.followPos;
        this.vfx.levelBurst(f.x, f.z, this.reduceFlashing);
        if (!this.reduceFlashing) this.levelGlow = 0.15;
      }
      if (event.type === 'death' && event.isPlayer) this.deathDesatTarget = 0.85;
    }
  }

  /** Put the class's weapons into the character's hands (bone attachments). */
  private attachWeapons(obj: THREE.Object3D, classId: string): void {
    obj.updateMatrixWorld(true);
    for (const mount of CLASS_WEAPONS[classId] ?? []) {
      const bone = obj.getObjectByName(mount.bone);
      const procedural = mount.asset.startsWith(PROCEDURAL_PREFIX);
      if (!bone || (!procedural && !this.assets.has(mount.asset))) continue;
      const weapon = procedural ? proceduralWeapon(mount.asset.slice(PROCEDURAL_PREFIX.length), mount.length) : this.assets.create(mount.asset);
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

  /** Height and footprint radius of a prop model in metres (cached). */
  private propSize(assetId: string): { h: number; r: number } {
    let size = this.sizeCache.get(assetId);
    if (!size) {
      const entry = this.assets.entry(assetId);
      const p = entry.placeholder?.size ?? [1, 1, 1];
      size = { h: entry.heightMeters ?? p[1], r: Math.max(p[0], p[2]) / 2 };
      this.sizeCache.set(assetId, size);
    }
    return size;
  }

  /** Does this static prop stand between the camera and the player's upper body? */
  private occludes(r: Renderable, x: number, z: number): boolean {
    const size = this.propSize(r.assetId);
    const scale = r.scale ?? 1;
    // The hero, not the camera focus: the focus leads toward the cursor in combat (F018).
    return propBlocksView(this.rig.camera.position, this.followPos, { x, z, h: size.h * scale, r: size.r * scale });
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

  /** Entities seen by this frame's sync, and the query result behind them (reused, not reallocated). */
  private readonly seen = new Set<Entity>();
  /** Props that never change (T015): kept out of the per-frame loop. */
  private readonly statics = new StaticProps();
  private readonly staticView: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  private readonly renderables: Entity[] = [];

  /** Free what a retired entity's object owns: its cloned tint materials and per-entity sprite/ring materials. */
  private retire(obj: THREE.Object3D): void {
    for (const slot of (obj.userData.tint as TintSlot[] | undefined) ?? []) slot.material.dispose();
    disposeOwned(obj);
  }

  /**
   * A model finished loading after entities were drawn as its placeholder box (a zone set that missed
   * it, or a late spawn): drop those objects so sync() builds them again from the real model.
   */
  private swapPlaceholders(id: string): void {
    for (const [e, obj] of this.objects) {
      if (obj.userData.placeholder !== true || obj.name !== id) continue;
      this.statics.remove(e);
      this.scene.remove(obj);
      this.retire(obj);
      this.objects.delete(e);
      this.recoils.delete(e);
      this.flashes.delete(e);
      this.animators.delete(e);
      this.lastHitAnim.delete(e);
    }
  }

  /** Mirror ECS → scene, interpolating between the last two ticks by `alpha`. */
  sync(world: World, alpha: number, frameDt: number): void {
    this.time += frameDt;
    this.trackMoveMarker(world);
    this.shimmerInteractables(world, frameDt);
    const seen = this.seen;
    seen.clear();
    for (const e of world.queryInto(this.renderables, Transform, Renderable)) {
      seen.add(e);
      // Plain static props are placed once and culled and faded in `statics.update` below (T015).
      if (this.statics.has(e)) continue;
      const tr = world.req(e, Transform);
      let obj = this.objects.get(e);
      if (!obj) {
        const r = world.req(e, Renderable);
        // Characters get their own material so they can flash and tint.
        obj = this.assets.create(r.assetId, world.has(e, StatusEffects) || world.has(e, Interactable) || r.glow !== undefined || r.look !== undefined);
        obj.scale.setScalar(r.scale ?? 1);
        // Lumen's creations and memory shades are repainted (src/render/looks.ts).
        if (r.look) applyLookMaterials((obj.userData.tint as TintSlot[] | undefined) ?? [], r.look);
        if (r.landmark) {
          // Landmarks read as dark silhouettes through the fog from anywhere in the region.
          obj.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m && 'fog' in m) {
              const own = m.clone() as THREE.MeshStandardMaterial;
              trackOwned(obj!, own);
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
        else if (world.has(e, EnemyAI)) {
          const drone = tr.y > 0.5;
          // Lumen's imported models keep exactly the scale their def gives them; shades size up like the drones they remember.
          if (drone && r.look !== 'lumen') obj.scale.multiplyScalar(DRONE_SCALE);
          // In the dark the rim would give them away; their eyes do instead.
          if (this.dark && !this.instanceRoot) this.addEyes(obj, obj.scale.x);
          else if (!r.look) addRim(obj, drone ? '#ffb080' : '#e07a4a', drone ? 0.65 : 0.32);
          if (drone) this.addDroneMarks(obj, tr.y, r.glow ?? (r.look ? LOOKS[r.look].emissive : '#ff3a2a'));
        }
        obj.userData.baseScale = obj.scale.x;
        this.objects.set(e, obj);
        this.scene.add(obj);
        const clips = this.assets.clips(r.assetId);
        if (clips.size > 0) this.animators.set(e, new CharacterAnimator(obj, clips));
        else if (!r.look && !((obj.userData.tint as TintSlot[] | undefined)?.length ?? 0) && world.hasOnly(e, Transform, Renderable, Collider)) {
          this.statics.add(e, obj, tr, r, this.propSize(r.assetId).h * (r.scale ?? 1) >= SILHOUETTE.minPropHeight);
          continue;
        }
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
      } else if (world.get(e, Boss)?.script === 'lumen') {
        // Lumen is a rooted tower of light: it fades the same way when the player stands behind it.
        this.setFaded(obj, this.occludes(r, tr.x, tr.z));
      }
      obj.position.set(
        tr.prevX + (tr.x - tr.prevX) * alpha,
        tr.prevY + (tr.y - tr.prevY) * alpha,
        tr.prevZ + (tr.z - tr.prevZ) * alpha,
      );
      obj.rotation.y = tr.prevFacing + angleDelta(tr.prevFacing, tr.facing) * alpha;
      // The motorbike rides under the player while mounted.
      if (world.has(e, PlayerControlled)) this.syncBike(obj, world.has(e, Mounted));
      // Hovering machines bob gently (procedural animation, brief §9.4).
      if (tr.y > 0.5 && world.has(e, EnemyAI)) {
        const bob = Math.sin(this.time * 3 + e) * 0.08;
        obj.position.y += bob;
        // The shadow stays on the ground; the beacon blinks.
        const marks = obj.userData.droneMarks as { ground: THREE.Object3D; beacon: THREE.Sprite } | undefined;
        if (marks) {
          marks.ground.visible = marks.beacon.visible = !world.has(e, Dead);
          marks.ground.position.y = -(tr.y + bob - 0.03) / obj.scale.x;
          const blink = 0.55 + 0.45 * Math.max(0, Math.sin(this.time * 5 + e * 1.7)) ** 3;
          marks.beacon.material.opacity = blink;
        }
      }

      // Guardian lights bob in the air.
      if (world.has(e, Guardian)) obj.position.y += Math.sin(this.time * 2.6 + e) * 0.12;

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
        // A creature that bursts (Light Motes) leaves no body behind: it shrinks away once the clip has played.
        const ai = world.get(e, EnemyAI);
        if (world.get(e, Renderable)?.look && ai && enemyDef(ai.defId).onDeath?.burst) {
          const f = deathFade(Math.max(0, dead.elapsed - 0.6));
          obj.scale.setScalar(((obj.userData.baseScale as number | undefined) ?? 1) * f.scale);
          obj.userData.fadeOpacity = f.opacity;
          obj.visible = f.opacity > 0.01;
        }
      } else if (dead && animator && fadesOnDeath(true, animator.has('death'))) {
        // No death clip (Choir singers, the Absorbed): fade and shrink where it stands.
        const f = deathFade(dead.elapsed);
        const base = (obj.userData.baseScale as number | undefined) ?? 1;
        obj.scale.setScalar(base * f.scale);
        obj.userData.fadeOpacity = f.opacity;
        obj.visible = f.opacity > 0.01;
      } else if (dead) {
        // Topple over, then sink into the ash.
        const fall = Math.min(1, dead.elapsed / 0.3);
        obj.rotation.set(0, dead.fallDir, 0);
        obj.rotateX((Math.PI / 2) * fall * 0.95);
        if (dead.elapsed > sinkAt) obj.position.y -= (dead.elapsed - sinkAt) * 0.8;
      } else {
        if (obj.rotation.x !== 0) {
          obj.rotation.x = 0;
          obj.rotation.z = 0;
        }
        // Back from a fade (revived): full size, opaque, visible.
        if (obj.userData.fadeOpacity !== undefined) {
          delete obj.userData.fadeOpacity;
          obj.scale.setScalar((obj.userData.baseScale as number | undefined) ?? 1);
          obj.visible = true;
        }
      }
      if (lean) {
        // Yaw first, then pitch and roll about the creature's own axes.
        obj.rotation.order = 'YXZ';
        obj.rotation.x = lean.pitch;
        obj.rotation.z = lean.roll;
      }
      this.applyTint(world, e, obj, frameDt);
      if (this.recoils.size > 0) this.applyRecoil(world, e, obj, frameDt);
    }
    {
      const f = this.rig.focusPoint;
      const cam = this.rig.camera.position;
      const hero = this.followPos;
      const view = this.staticView;
      view[0] = cam.x;
      view[1] = cam.y;
      view[2] = cam.z;
      view[3] = hero.x;
      view[4] = hero.z;
      this.statics.update(f, CULL_DISTANCE, view, (r, x, z) => this.occludes(r, x, z), (o, on) => this.setFaded(o, on));
    }
    for (const [e, obj] of this.objects) {
      if (!seen.has(e)) {
        this.statics.remove(e);
        this.scene.remove(obj);
        this.retire(obj);
        this.objects.delete(e);
        this.recoils.delete(e);
        this.flashes.delete(e);
        this.animators.delete(e);
        this.lastHitAnim.delete(e);
      }
    }
    (this.choir ??= new ChoirLinks(this.scene)).update(world, this.objects, this.time);
    // Embers rise off molten metal near the camera (not off pools cooled by a valve).
    if (this.molten && !this.instanceRoot) {
      const f = this.rig.focusPoint;
      const off = new Set(this.molten.key.split(','));
      for (const p of this.molten.pools) {
        if (off.has(p.id) || Math.hypot(p.x - f.x, p.z - f.z) > 40) continue;
        this.vfx.sprites.moltenEmbers(`m${p.id}`, p.x, p.z, p.r, frameDt);
      }
    }
    this.vfx.update(world, frameDt, alpha);
    this.loot.update(world, frameDt);
  }

  /** A ground click shows where the hero is going (F005): a new or moved plain MoveTarget (no attack, pickup or use order). */
  private trackMoveMarker(world: World): void {
    for (const p of world.query(PlayerControlled)) {
      const mt = world.get(p, MoveTarget);
      if (!mt || world.has(p, AttackTarget) || world.has(p, PickupTarget) || world.has(p, InteractTarget) || world.has(p, Dead)) {
        this.lastMarker = null;
        return;
      }
      const last = this.lastMarker;
      // Holding the button drags the target along; mark it again only after it has moved and a moment has passed.
      if (!last || (Math.hypot(mt.x - last.x, mt.z - last.z) > 0.6 && this.time - last.at > 0.25)) {
        this.vfx.moveMarker(mt.x, mt.z, mt.blocked === true);
        this.lastMarker = { x: mt.x, z: mt.z, at: this.time };
      }
      return;
    }
  }

  private shimmerPoints: { x: number; z: number; kind: string }[] = [];
  /** Idle sparkle over nearby chests, teleporters and lore (F019): only the nearest few, so a busy zone stays calm. */
  private shimmerInteractables(world: World, dt: number): void {
    const f = this.rig.focusPoint;
    this.shimmerPoints.length = 0;
    for (const e of world.query(Interactable, Transform)) {
      const it = world.req(e, Interactable);
      if (it.used) continue;
      const tr = world.req(e, Transform);
      if (Math.abs(tr.x - f.x) > 26 || Math.abs(tr.z - f.z) > 26) continue;
      this.shimmerPoints.push({ x: tr.x, z: tr.z, kind: it.kind });
    }
    this.vfx.shimmer(this.shimmerPoints, f.x, f.z, dt);
  }

  /** Squash and push on a hit (F008), applied after the transform sync and undone when it ends. Bosses and turrets skip it. */
  private applyRecoil(world: World, e: Entity, obj: THREE.Object3D, dt: number): void {
    const r = this.recoils.get(e);
    if (!r) return;
    if (world.has(e, Dead) || world.has(e, Boss) || world.has(e, Turret)) {
      this.recoils.delete(e);
      return;
    }
    const base = (obj.userData.baseScale as number | undefined) ?? 1;
    r.age += dt;
    const c = recoilCurve(r.age, r.crit);
    if (!c) {
      obj.scale.setScalar(base);
      this.recoils.delete(e);
      return;
    }
    obj.scale.set(base * c.xz, base * c.y, base * c.xz);
    const f = this.followPos;
    const dx = obj.position.x - f.x;
    const dz = obj.position.z - f.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      obj.position.x += (dx / len) * c.push;
      obj.position.z += (dz / len) * c.push;
    }
  }

  /** What the enemies are thinking: "!" and "?" markers, and the debug overlay when on. */
  updateMinds(world: World, nav: NavService | undefined, time: number): void {
    (this.awareness ??= new AwarenessMarkers(this.scene)).update(world, this.objects, time);
    this.navDebug?.update(nav, world);
    const cueDt = Math.min(0.1, Math.max(0, this.time - this.cueTime));
    this.cueTime = this.time;
    (this.occlusionCue ??= new OcclusionCue(this.scene)).update(world, this.objects, this.rig.camera.position, this.followPos, cueDt, this.silhouettes, (id) => this.propSize(id));
  }

  /** Loot magnet delivery (B12): a few small sparks at the hero, none with reduced flashing. */
  magnetSpark(kind: 'gold' | 'item'): void {
    if (this.reduceFlashing) return;
    const f = this.followPos;
    this.vfx.magnetSpark(f.x, f.z, kind === 'gold' ? '#ffd23a' : '#9fe8ff');
  }

  /** The golden dotted guide to the first objective (F007); `goal` null hides it. */
  setGuide(goal: { x: number; z: number } | null, x: number, z: number, route?: readonly { x: number; z: number }[]): void {
    if (!goal && !this.guide) return;
    (this.guide ??= new GuideLine(this.scene)).update(x, z, goal, this.time, route);
  }

  setNavOverlay(on: boolean): void {
    if (on && !this.navDebug) this.navDebug = new NavDebugOverlay(this.scene);
    else if (!on && this.navDebug) {
      this.navDebug.dispose();
      this.navDebug = null;
    }
  }

  /**
   * Hovering drones are small and float above the clutter, so they get a blinking beacon on top and a
   * shadow with a coloured ring on the ground beneath them: you see where they are, not just a speck.
   */
  private addDroneMarks(obj: THREE.Object3D, hover: number, color: string): void {
    const s = obj.scale.x || 1;
    obj.updateMatrixWorld(true);
    const box = bodyBounds(obj);
    const top = (box.max.y - obj.position.y) / s;
    const beaconMat = new THREE.SpriteMaterial({ map: this.glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const beacon = new THREE.Sprite(beaconMat);
    trackOwned(obj, beaconMat);
    beacon.position.set(0, top + 0.15 / s, 0);
    beacon.scale.setScalar(0.9 / s);
    beacon.renderOrder = 3;
    obj.add(beacon);

    const ground = new THREE.Group();
    // The shadow disc and ring are the same for every drone: one geometry (and the shadow material) for all of them.
    const marks = (this.droneMarkParts ??= {
      shadowGeo: new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2),
      ringGeo: new THREE.RingGeometry(0.62, 0.74, 32).rotateX(-Math.PI / 2),
      shadowMat: new THREE.MeshBasicMaterial({ map: this.glowTexture(), color: '#000000', transparent: true, opacity: 0.55, depthWrite: false }),
    });
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    trackOwned(obj, ringMat);
    const shadow = new THREE.Mesh(marks.shadowGeo, marks.shadowMat);
    const ring = new THREE.Mesh(marks.ringGeo, ringMat);
    ring.position.y = 0.005;
    ground.add(shadow, ring);
    ground.scale.setScalar(1 / s);
    ground.position.y = -hover / s;
    ground.renderOrder = 2;
    ground.traverse((o) => (o.userData.noTint = true));
    obj.add(ground);
    obj.userData.droneMarks = { ground, beacon };
  }

  private droneMarkParts: { shadowGeo: THREE.BufferGeometry; ringGeo: THREE.BufferGeometry; shadowMat: THREE.Material } | null = null;
  private eyeMaterial: THREE.SpriteMaterial | null = null;

  /** Two small glowing points near the top of an enemy (dark zones). */
  private addEyes(obj: THREE.Object3D, scale: number): void {
    obj.updateMatrixWorld(true);
    const box = bodyBounds(obj);
    const top = (box.max.y / scale) * 0.86;
    const front = (box.max.z / scale) * 0.6;
    const mat = (this.eyeMaterial ??= new THREE.SpriteMaterial({ map: this.glowTexture(), color: '#ff4a2a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    for (const side of [-1, 1]) {
      const eye = new THREE.Sprite(mat);
      eye.position.set((side * 0.1) / scale, top, front);
      eye.scale.setScalar(0.32 / scale);
      eye.name = 'eye';
      obj.add(eye);
    }
  }

  private syncBike(obj: THREE.Object3D, mounted: boolean): void {
    const bike = obj.userData.bike as THREE.Object3D | undefined;
    if (mounted && !bike) {
      const b = this.assets.create('prop.motorbike', false);
      // Children inherit the character's scale; keep the bike at its own size.
      b.scale.setScalar(1 / (obj.scale.x || 1));
      obj.add(b);
      obj.userData.bike = b;
    } else if (!mounted && bike) {
      obj.remove(bike);
      delete obj.userData.bike;
    }
  }

  private animationFor(world: World, e: Entity, animator: CharacterAnimator): PlayRequest {
    if (world.has(e, Dead)) return { state: 'death', loop: false, token: 'death' };
    if (world.has(e, Mounted)) return { state: 'idle', loop: true, token: 'bike' };

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
      return { state: atk.kind === 'buffAllies' ? 'cast' : atk.kind === 'projectile' ? 'shoot' : 'attack', loop: false, fit, token: ai.attackSeq };
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

  private readonly families = new Map<string, string | null>();
  private familyOf(defId: string): string | null {
    let family = this.families.get(defId);
    if (family === undefined) {
      family = enemyDef(defId).family ?? null;
      this.families.set(defId, family);
    }
    return family;
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
    // The respawn grace (2 s) shows as a fading golden shimmer; dodge i-frames are too short to reach it (F014).
    const grace = world.has(e, PlayerControlled) ? world.get(e, Invulnerable)?.remaining ?? 0 : 0;
    const shield = grace > 0.6 && grace <= 2.5 && !this.reduceFlashing ? Math.min(1, grace / 2) : 0;
    const effects = world.get(e, StatusEffects);
    const active = effects && !world.has(e, Dead) ? activeTintStatus(effects.list) : undefined;
    if (active) this.tint.set(STATUS_DEFS[active].color);
    // Holograms (decoys) and stealthed characters are drawn see-through.
    const hologram = world.get(e, Renderable)?.hologram ?? false;
    const glow = world.has(e, Dead) ? undefined : world.get(e, Renderable)?.glow;
    // In the dark, enemies outside the lamp lose their glow: only their eyes give them away.
    let dim = 1;
    if (this.dark && !this.instanceRoot && world.has(e, EnemyAI)) {
      const t = world.get(e, Transform);
      const f = this.rig.focusPoint;
      if (t) dim = THREE.MathUtils.clamp((17 - Math.hypot(t.x - f.x, t.z - f.z)) / 6, 0.05, 1);
    }
    const ai = world.get(e, EnemyAI);
    const family = ai ? this.familyOf(ai.defId) : null;
    const infected = !world.has(e, Dead) && (family === 'infected' || family === 'lumen');
    let stealth = false;
    if (effects) for (const s of effects.list) if (s.id === 'stealth') stealth = true;
    // Lumen creations and shades: pulsing or flickering, faded out while they die without a death clip.
    const look = world.get(e, Renderable)?.look;
    const ls = look ? lookState(look, this.time, e) : null;
    const fade = (obj.userData.fadeOpacity as number | undefined) ?? 1;
    const opacity = (ls ? ls.opacity : hologram ? 0.45 + 0.1 * Math.sin(this.time * 12) : stealth ? 0.3 : 1) * fade;
    for (const slot of slots) {
      const see = opacity < 1;
      if (slot.material.transparent !== see) {
        slot.material.transparent = see;
        slot.material.depthWrite = !see;
        slot.material.needsUpdate = true;
      }
      if (look && see) slot.material.depthWrite = LOOKS[look].depthWrite;
      slot.material.opacity = opacity;
      if (ls && look && !flash && !active && !hologram) {
        // An elite's glow (blue champion, yellow rare) takes over the look's own emissive colour.
        slot.material.emissive.set(glow ?? LOOKS[look].emissive);
        // (Kept low so the body reads against pale ground; an elite's bright colour is eased down a little.)
        slot.material.emissiveIntensity = ls.glow * (glow ? 0.7 : 1) * dim;
        continue;
      }
      if (hologram) {
        slot.material.emissive.set('#3ab8ff');
        slot.material.emissiveIntensity = 0.9 * Math.max(0.25, dim);
        continue;
      }
      if (glow && !flash && !active) {
        slot.material.emissive.set(glow);
        slot.material.emissiveIntensity = (0.35 + 0.1 * Math.sin(this.time * 4 + e)) * dim;
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
      } else if (shield > 0) {
        slot.material.emissive.set('#ffd27a');
        slot.material.emissiveIntensity = shield * (0.35 + 0.15 * Math.sin(this.time * 9));
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

  /** Follow a world position with the camera and draw a frame; `look` moves the camera's focus off the player (a boss fight). */
  render(frameDt: number, followX: number, followY: number, followZ: number, look?: { x: number; z: number }): void {
    this.rig.update(look?.x ?? followX, followY, look?.z ?? followZ, frameDt);
    this.followPos.set(followX, followY, followZ);
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
    // Death drains the colour; the level-up glow is a quick flash (F014, F017).
    this.deathDesat += (this.deathDesatTarget - this.deathDesat) * (1 - Math.exp(-4 * frameDt));
    this.postfx.setDeathDesat(this.deathDesat < 0.005 ? 0 : this.deathDesat);
    this.levelGlow = Math.max(0, this.levelGlow - frameDt * 1.2);
    this.postfx.setLevelGlow(this.levelGlow);
    this.renderer.info.reset();
    this.postfx.render(this.scene, this.rig.camera);
  }

  /** Apply a graphics preset: post-processing, shadow resolution and pixel ratio. */
  /** Scene brightness (B045): the tone-mapping exposure, which the post-processing output pass and the plain render both use. */
  setBrightness(brightness: number): void {
    this.renderer.toneMappingExposure = brightness;
  }

  setQuality(quality: GraphicsQuality): void {
    this.postfx.setQuality(quality);
    this.silhouettes = silhouetteEnabled(quality);
    this.vfx.sprites.setQuality(quality);
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
    this.rig.setAspect(w / h, h);
  }
}

const LIGHT_POOL = 12;
/** The status whose colour wins when several are active, strongest first. */
const TINT_PRIORITY = ['burning', 'poisoned', 'chilled', 'frozen', 'marked', 'vulnerable'] as const;

function activeTintStatus(list: readonly { id: string }[]): (typeof TINT_PRIORITY)[number] | undefined {
  for (const id of TINT_PRIORITY) for (const s of list) if (s.id === id) return id;
  return undefined;
}
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
      // Counter-clockwise seen from above, so the ribbon faces up.
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
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

/**
 * How each overlay texture is drawn: repeats per base tile (`scale` < 1 = larger), brightness
 * `gain`, contrast softened toward a dark colour (`soften`), and which bright pixels glow.
 */
const GROUND_LOOK: Partial<
  Record<GroundTexture, { scale?: number; gain?: number; soften?: { toward: [number, number, number]; keep: number }; glow?: 'green' | 'orange' | 'blue' }>
> = {
  // Dark and blotchy: lifted, with softer contrast.
  scorched_ground: { scale: 0.6, gain: 1.6, soften: { toward: [0.045, 0.038, 0.034], keep: 0.7 } },
  lumen_infested: { scale: 0.9, glow: 'green' },
  military_concrete: { scale: 0.75 },
  // Very dark crust: lifted so the plates read; the thin orange cracks glow.
  slag_ground: { scale: 0.7, gain: 2.5, glow: 'orange' },
  cooling_slag: { scale: 0.8, gain: 1.2, glow: 'orange' },
  steel_plating: { scale: 0.75 },
  scorched_flagstones: { scale: 0.8, gain: 1.15 },
  // Hydroponic Vaults: dark moss and roots lifted so they read; their pale green spots and veins glow.
  fungal_moss: { scale: 0.8, gain: 1.8, glow: 'green' },
  root_mat: { scale: 0.7, gain: 1.6, glow: 'green' },
  // Bright frost and silt brought down to the night look.
  frosted_concrete: { scale: 0.7, gain: 0.62 },
  dry_silt: { scale: 0.8, gain: 0.8 },
  lab_tiles: { scale: 0.8, gain: 0.75 },
  // Deep Mines: the cyan spots in crystal floors and the seams in the Elder Halls' stone glow blue.
  crystal_floor: { scale: 0.8, gain: 1.1, glow: 'blue' },
  elder_stone: { scale: 0.55, gain: 1.5, glow: 'blue' },
  lake_shore: { scale: 0.8, gain: 0.85 },
  steel_grating: { scale: 0.9, gain: 0.95 },
};

/** Base textures that are drawn their own way (the others keep the plain tint): brightness and whether veins glow. */
const BASE_LOOK: Partial<Record<GroundTexture, { gain?: number; glow?: 'lumen' }>> = {
  // The Core: pale pearl stone, its gold and violet veins glow.
  lumen_matter: { gain: 0.62, glow: 'lumen' },
};

/** Multiplies the painted ground textures down to the dark night look of the procedural ground. */
const GROUND_TINT = 0xd8d0c8;

/**
 * Road edge alpha: opaque in the middle, fading out over ragged, uneven margins (u runs across the
 * road, v along it).
 */
function makeRoadEdgeTexture(): THREE.Texture {
  const w = 64;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const rng = new Rng('road-edges');
  // A smooth random margin per side, wrapped along v so the pattern repeats without seams.
  const knots = (n: number) => Array.from({ length: n }, () => rng.range(0.06, 0.2));
  const left = knots(8);
  const right = knots(8);
  const sample = (k: number[], v: number) => {
    const f = (v / h) * k.length;
    const i = Math.floor(f);
    const t = f - i;
    const a = k[i % k.length]!;
    const b = k[(i + 1) % k.length]!;
    return a + (b - a) * t * t * (3 - 2 * t);
  };
  for (let y = 0; y < h; y++) {
    const l = sample(left, y);
    const r = sample(right, y);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const a = Math.min(1, Math.max(0, Math.min(u / l, (1 - u) / r) - rng.range(0, 0.25)));
      const k = (y * w + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(a * 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

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

/** The player's lamp inside dungeons and bunkers. */
const INSTANCE_LAMP = { intensity: 160, distance: 18 };

/** How strongly the environment map lights the scene on the surface and underground. */
const ENV_LIGHT = { surface: 0.35, dark: 0.05 };

/** Drones are drawn a little larger than their model so they read at gameplay distance. */
const DRONE_SCALE = 1.25;

/**
 * Bounds of a creature's own body: variant parts (`part:` children, crystals growing past the head) stay out, so the eyes
 * and drone marks are placed on the model, not on the attachments.
 */
function bodyBounds(obj: THREE.Object3D): THREE.Box3 {
  const parts: { part: THREE.Object3D; parent: THREE.Object3D }[] = [];
  obj.traverse((o) => {
    if (o.name.startsWith('part:') && o.parent) parts.push({ part: o, parent: o.parent });
  });
  for (const { part } of parts) part.removeFromParent();
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  for (const { part, parent } of parts) parent.add(part);
  obj.updateMatrixWorld(true);
  return box;
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

