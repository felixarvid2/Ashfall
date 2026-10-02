/**
 * Top-level game: wires ECS, systems, input, rendering, UI and saving together.
 */
import {
  Dead,
  EncounterState,
  EnemyAI,
  ForcedMove,
  Health,
  Invulnerable,
  Mover,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
  makeTransform,
} from './core/components';
import type { GameContext } from './core/context';
import { Scheduler, World, type Entity } from './core/ecs';
import { EventQueue, type GameEvent } from './core/events';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { Rng, randomSeed } from './core/rng';
import { SAVE_VERSION, SaveError, SaveStore, parseSave, safeLocalStorage, serializeSave, type SaveData } from './core/save';
import { SpatialHash } from './core/spatial';
import { classDef, skill } from './data/db';
import { t } from './data/i18n';
import { loadSettings, resolveKeybindings, saveSettings, type MoveMode, type Settings } from './data/settings';
import { TEST_ARENA } from './data/zones/testArena';
import { GameRenderer } from './render/gameRenderer';
import { collisionSystem, spatialSystem } from './systems/collision';
import { isAlive, kill } from './systems/combat';
import { deathSystem } from './systems/death';
import { encounterSystem, startNextWave } from './systems/encounter';
import { enemyAISystem } from './systems/enemyAI';
import { movementSystem } from './systems/movement';
import { playerControlSystem } from './systems/playerControl';
import { hazardSystem, projectileSystem } from './systems/projectiles';
import { resourceSystem } from './systems/resource';
import { forcedMoveSystem, skillSystem } from './systems/skills';
import { statusSystem } from './systems/status';
import { enemyNear } from './systems/targeting';
import { DamageNumbers } from './ui/damageNumbers';
import { DevTools } from './ui/devtools';
import { Hud, type HudState } from './ui/hud';
import { Toasts } from './ui/toast';
import { spawnArenaProps } from './world/arena';
import { spawnEnemy, spawnPlayer } from './world/spawn';

const SAVE_SLOT = 'slot0';
const PLAYER_CLASS = 'bastion';
/** How long the target frame keeps showing the last enemy you hit. */
const TARGET_MEMORY = 4;

export class Game {
  readonly world = new World();
  readonly settings: Settings;
  readonly ctx: GameContext;
  readonly loop: GameLoop;
  readonly renderer: GameRenderer;
  private readonly input: Input;
  private readonly scheduler = new Scheduler<GameContext>();
  private readonly saves: SaveStore;
  private readonly storage = safeLocalStorage();
  private readonly hud: Hud;
  private readonly toasts: Toasts;
  private readonly devtools: DevTools;
  private readonly damageNumbers: DamageNumbers;
  private player!: Entity;
  private hitstop = 0;
  private lastTarget: { entity: Entity; until: number } | null = null;
  private lastNotice = new Map<string, number>();
  private realTime = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = loadSettings(this.storage);
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    this.saves = new SaveStore(this.storage);

    this.renderer = new GameRenderer(canvas);
    this.renderer.screenShake = this.settings.screenShake;
    this.input = new Input(canvas, resolveKeybindings(this.settings));

    this.ctx = {
      input: this.input,
      settings: this.settings,
      rng: new Rng(randomSeed()),
      tick: 0,
      time: 0,
      cameraYaw: this.renderer.rig.yaw,
      worldHalfSize: TEST_ARENA.halfSize,
      pickGround: () =>
        this.input.mouseSeen ? this.renderer.pickGround(this.input.mouseNdc.x, this.input.mouseNdc.y) : null,
      events: new EventQueue(),
      spatial: new SpatialHash(4),
      debug: { godMode: false },
      stats: { kills: 0 },
    };

    this.scheduler
      .add('spatial', spatialSystem)
      .add('playerControl', playerControlSystem)
      .add('skills', skillSystem)
      .add('enemyAI', enemyAISystem)
      .add('status', statusSystem)
      .add('movement', movementSystem)
      .add('forcedMove', forcedMoveSystem)
      .add('collision', collisionSystem)
      .add('projectiles', projectileSystem)
      .add('hazards', hazardSystem)
      .add('resource', resourceSystem)
      .add('death', deathSystem)
      .add('encounter', encounterSystem);

    this.damageNumbers = new DamageNumbers(uiRoot);
    this.toasts = new Toasts(uiRoot);
    this.hud = new Hud(uiRoot, () => this.respawn());
    this.devtools = new DevTools(
      uiRoot,
      {
        save: () => this.save(),
        load: () => this.load(),
        exportSave: () => this.exportSave(),
        importSave: (json) => this.importSave(json),
        deleteSave: () => {
          this.saves.remove(SAVE_SLOT);
          this.toasts.show(t('debug.saveDeleted'));
        },
        setMoveMode: (mode) => this.setMoveMode(mode),
        nextWave: () => startNextWave(this.world, this.ctx),
        killAll: () => this.killAllEnemies(),
        spawnHorde: () => this.spawnHorde(100),
        setGodMode: (on) => (this.ctx.debug.godMode = on),
        setScreenShake: (on) => {
          this.settings.screenShake = on;
          this.renderer.screenShake = on;
          saveSettings(this.storage, this.settings);
        },
      },
      this.settings.showFps,
      this.settings.screenShake,
    );
    this.devtools.setMoveMode(this.settings.moveMode);
    this.refreshHint();

    this.renderer.buildArena(TEST_ARENA);
    spawnArenaProps(this.world, TEST_ARENA);
    this.player = spawnPlayer(this.world, PLAYER_CLASS, TEST_ARENA.playerSpawn.x, TEST_ARENA.playerSpawn.z);
    const tr = this.playerTransform;
    this.renderer.rig.snapTo(tr.x, tr.y, tr.z);

    const encounter = this.world.create();
    this.world.add(encounter, EncounterState, {
      encounterId: 'encounter.test_arena',
      wave: 0,
      phase: 'intermission',
      timer: 2.5,
      alive: 0,
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });
  }

  start(): void {
    this.loop.start();
  }

  get playerEntity(): Entity {
    return this.player;
  }

  get playerTransform(): Transform {
    return this.world.req(this.player, Transform);
  }

  private update(dt: number): void {
    const input = this.input;
    if (input.wasPressed('toggleDebug')) this.devtools.toggle();
    if (input.wasPressed('quickSave')) this.save();
    if (input.wasPressed('quickLoad')) this.load();
    if (input.wasPressed('respawn') && this.world.has(this.player, Dead)) this.respawn();

    this.scheduler.tick(this.world, dt, this.ctx);
    this.ctx.tick++;
    this.ctx.time += dt;
    input.endTick();
  }

  private render(alpha: number, frameDt: number): void {
    this.realTime += frameDt;
    const events = this.ctx.events.drain();
    this.handleEvents(events);

    // Hit-stop freezes simulation for a few real milliseconds; rendering continues.
    if (this.hitstop > 0) {
      this.hitstop -= frameDt;
      this.loop.timeScale = this.hitstop > 0 ? 0 : 1;
    }

    const zoom = this.input.consumeWheel();
    if (zoom !== 0) this.renderer.rig.zoom(zoom);

    this.renderer.sync(this.world, alpha, frameDt);
    const tr = this.playerTransform;
    const px = tr.prevX + (tr.x - tr.prevX) * alpha;
    const pz = tr.prevZ + (tr.z - tr.prevZ) * alpha;
    this.renderer.render(frameDt, px, 0, pz);
    this.damageNumbers.update(frameDt, (x, y, z, out) => this.renderer.toScreen(x, y, z, out));
    this.hud.update(this.hudState(), frameDt);

    this.devtools.frame(frameDt, () => ({
      entities: this.world.entityCount,
      ...this.renderer.stats,
      position: { x: tr.x, z: tr.z },
      seed: this.ctx.rng.seed,
      tick: this.ctx.tick,
      enemies: this.world.query(EnemyAI).filter((e) => !this.world.has(e, Dead)).length,
      wave: this.encounter?.wave ?? 0,
      kills: this.ctx.stats.kills,
    }));
  }

  private handleEvents(events: GameEvent[]): void {
    this.renderer.handleEvents(events);
    for (const event of events) {
      this.damageNumbers.handle(event);
      switch (event.type) {
        case 'hitstop':
          this.hitstop = Math.max(this.hitstop, event.ms / 1000);
          this.loop.timeScale = 0;
          break;
        case 'damage':
          if (!event.toPlayer && this.world.has(event.target, EnemyAI)) {
            this.lastTarget = { entity: event.target, until: this.realTime + TARGET_MEMORY };
          }
          break;
        case 'wave':
          this.hud.showBanner(t('hud.wave', { wave: event.wave }));
          break;
        case 'waveCleared':
          this.hud.showBanner(t('hud.waveCleared', { wave: event.wave }));
          break;
        case 'overheat':
          this.notice('combat.overheat', 'error');
          break;
        case 'notice':
          this.notice(event.key, 'error');
          break;
        default:
          break;
      }
    }
  }

  /** Toast with a per-key cooldown so spammed buttons don't flood the screen. */
  private notice(key: string, kind: 'info' | 'error'): void {
    const last = this.lastNotice.get(key) ?? -Infinity;
    if (this.realTime - last < 1.5) return;
    this.lastNotice.set(key, this.realTime);
    this.toasts.show(t(key), kind);
  }

  private get encounter(): EncounterState | undefined {
    const e = this.world.first(EncounterState);
    return e === undefined ? undefined : this.world.req(e, EncounterState);
  }

  private hudState(): HudState {
    const w = this.world;
    const p = this.player;
    const health = w.req(p, Health);
    const resource = w.req(p, Resource);
    const user = w.req(p, SkillUser);
    const cls = classDef(user.classId);
    const effects = w.get(p, StatusEffects);
    const barrier = effects?.list.reduce((sum, s) => (s.id === 'barrier' ? sum + s.amount : sum), 0) ?? 0;
    const overheat = resource.config.overheat;

    const slots = user.slots.map((id) => {
      if (!id) return { id: null, cooldown: 0, cooldownMax: 0, affordable: false };
      const def = skill(id);
      return {
        id,
        cooldown: user.cooldowns[id] ?? 0,
        cooldownMax: def.cooldown,
        affordable: resource.current >= def.resourceCost,
      };
    });

    // Target frame: the enemy under the cursor, else the last one you hit.
    let target: HudState['target'] = null;
    const ground = this.ctx.pickGround();
    let te = ground ? enemyNear(w, this.ctx, ground.x, ground.z, 1.2) : null;
    if (te === null && this.lastTarget && this.realTime < this.lastTarget.until && isAlive(w, this.lastTarget.entity)) {
      te = this.lastTarget.entity;
    }
    if (te !== null && isAlive(w, te)) {
      const ai = w.req(te, EnemyAI);
      const th = w.req(te, Health);
      const statuses = [...new Set(w.get(te, StatusEffects)?.list.map((s) => s.id) ?? [])];
      target = { name: t(`enemies.${ai.defId}`), current: th.current, max: th.max, statuses };
    }

    const enc = this.encounter;
    return {
      life: { current: health.current, max: health.max, barrier },
      resource: {
        kind: resource.kind,
        current: resource.current,
        max: resource.max,
        overheating: overheat !== undefined && resource.atMaxFor > 0,
      },
      slots,
      dodge: { cooldown: user.dodgeCooldown, max: cls.dodge.cooldown },
      potion: { charges: user.potionCharges, max: cls.potion.charges },
      wave: enc && enc.wave > 0 ? { wave: enc.wave, alive: enc.alive, phase: enc.phase, timer: enc.timer } : null,
      target,
      dead: w.has(p, Dead),
    };
  }

  // ---- Player lifecycle -----------------------------------------------------

  respawn(): void {
    const w = this.world;
    const p = this.player;
    if (!w.has(p, Dead)) return;
    w.remove(p, Dead);
    w.remove(p, ForcedMove);
    const health = w.req(p, Health);
    health.current = health.max;
    const resource = w.req(p, Resource);
    resource.current = resource.config.start;
    resource.atMaxFor = 0;
    w.req(p, StatusEffects).list = [];
    const user = w.req(p, SkillUser);
    user.cast = null;
    user.request = null;
    const spawn = TEST_ARENA.playerSpawn;
    Object.assign(this.playerTransform, makeTransform(spawn.x, 0, spawn.z, Math.PI));
    w.add(p, Invulnerable, { remaining: 2 });
    this.renderer.rig.snapTo(spawn.x, 0, spawn.z);
  }

  // ---- Debug helpers ----------------------------------------------------------

  killAllEnemies(): void {
    for (const e of this.world.query(EnemyAI)) {
      if (!this.world.has(e, Dead)) kill(this.world, this.ctx, e, 0);
    }
  }

  /** Stress test: spawn a large crowd around the player. */
  spawnHorde(count: number): void {
    const tr = this.playerTransform;
    const rng = this.ctx.rng.fork(`horde-${this.ctx.tick}`);
    const lim = this.ctx.worldHalfSize - 1;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(8, 22);
      const id = rng.weighted([
        { item: 'infected_colonist', weight: 7 },
        { item: 'security_drone', weight: 2 },
        { item: 'spore_carrier', weight: 1 },
      ]);
      const x = Math.max(-lim, Math.min(lim, tr.x + Math.sin(a) * d));
      const z = Math.max(-lim, Math.min(lim, tr.z + Math.cos(a) * d));
      spawnEnemy(this.world, id, x, z, { aggro: true });
    }
  }

  // ---- Saving ---------------------------------------------------------------

  snapshot(): SaveData {
    const tr = this.playerTransform;
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      seed: this.ctx.rng.seed,
      rngState: [...this.ctx.rng.getState()],
      tick: this.ctx.tick,
      player: { position: { x: tr.x, y: 0, z: tr.z }, facing: tr.facing },
    };
  }

  applySave(data: SaveData): void {
    const rng = new Rng(data.seed);
    rng.setState(data.rngState);
    this.ctx.rng = rng;
    this.ctx.tick = data.tick;
    const tr = this.playerTransform;
    const { x, y, z } = data.player.position;
    Object.assign(tr, makeTransform(x, y, z, data.player.facing));
    this.world.remove(this.player, ForcedMove);
    const mover = this.world.req(this.player, Mover);
    mover.vx = mover.vz = 0;
    this.renderer.rig.snapTo(x, y, z);
  }

  save(): void {
    try {
      this.saves.write(SAVE_SLOT, this.snapshot());
      this.toasts.show(t('save.saved'));
    } catch {
      this.toasts.show(t('save.storageUnavailable'), 'error');
    }
  }

  load(): void {
    try {
      const data = this.saves.read(SAVE_SLOT);
      if (!data) {
        this.toasts.show(t('save.noSave'), 'error');
        return;
      }
      this.applySave(data);
      this.toasts.show(t('save.loaded'));
    } catch (err) {
      const reason = err instanceof SaveError ? err.message : String(err);
      this.toasts.show(t('save.loadFailed', { reason }), 'error');
    }
  }

  exportSave(): void {
    const blob = new Blob([serializeSave(this.snapshot())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ashfall-save-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toasts.show(t('save.exported'));
  }

  importSave(json: string): void {
    try {
      this.applySave(parseSave(json));
      this.toasts.show(t('save.imported'));
    } catch (err) {
      const reason = err instanceof SaveError ? err.message : String(err);
      this.toasts.show(t('save.importFailed', { reason }), 'error');
    }
  }

  // ---- Settings -------------------------------------------------------------

  setMoveMode(mode: MoveMode): void {
    this.settings.moveMode = mode;
    saveSettings(this.storage, this.settings);
    this.refreshHint();
  }

  private refreshHint(): void {
    this.hud.updateHint(this.settings.moveMode, resolveKeybindings(this.settings));
  }
}
