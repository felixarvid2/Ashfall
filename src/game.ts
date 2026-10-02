/**
 * Top-level game: wires ECS, systems, input, rendering, UI and saving together.
 */
import { Mover, PlayerControlled, Renderable, Transform, makeTransform } from './core/components';
import type { GameContext } from './core/context';
import { Scheduler, World, type Entity } from './core/ecs';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { Rng, randomSeed } from './core/rng';
import { SAVE_VERSION, SaveError, SaveStore, parseSave, safeLocalStorage, serializeSave, type SaveData } from './core/save';
import { t } from './data/i18n';
import { loadSettings, resolveKeybindings, saveSettings, type MoveMode, type Settings } from './data/settings';
import { TEST_ARENA } from './data/zones/testArena';
import { GameRenderer } from './render/gameRenderer';
import { movementSystem } from './systems/movement';
import { playerControlSystem } from './systems/playerControl';
import { DevTools } from './ui/devtools';
import { Hud } from './ui/hud';
import { Toasts } from './ui/toast';
import { spawnArenaProps } from './world/arena';

const SAVE_SLOT = 'slot0';
const PLAYER_SPEED = 5.5;

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
  private player!: Entity;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = loadSettings(this.storage);
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    this.saves = new SaveStore(this.storage);

    this.renderer = new GameRenderer(canvas);
    this.input = new Input(canvas, resolveKeybindings(this.settings));

    this.ctx = {
      input: this.input,
      settings: this.settings,
      rng: new Rng(randomSeed()),
      tick: 0,
      cameraYaw: this.renderer.rig.yaw,
      worldHalfSize: TEST_ARENA.halfSize,
      pickGround: () =>
        this.input.mouseSeen ? this.renderer.pickGround(this.input.mouseNdc.x, this.input.mouseNdc.y) : null,
    };

    this.scheduler.add('playerControl', playerControlSystem).add('movement', movementSystem);

    this.toasts = new Toasts(uiRoot);
    this.hud = new Hud(uiRoot);
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
      },
      this.settings.showFps,
    );
    this.devtools.setMoveMode(this.settings.moveMode);
    this.refreshHint();

    this.renderer.buildArena(TEST_ARENA);
    spawnArenaProps(this.world, TEST_ARENA);
    this.spawnPlayer(TEST_ARENA.playerSpawn.x, TEST_ARENA.playerSpawn.z);

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });
  }

  start(): void {
    this.loop.start();
  }

  get playerTransform(): Transform {
    return this.world.req(this.player, Transform);
  }

  private spawnPlayer(x: number, z: number): void {
    this.player = this.world.create();
    this.world.add(this.player, Transform, makeTransform(x, 0, z, Math.PI));
    this.world.add(this.player, Mover, { speed: PLAYER_SPEED, turnRate: 14, vx: 0, vz: 0 });
    this.world.add(this.player, PlayerControlled, {});
    this.world.add(this.player, Renderable, { assetId: 'char.bastion' });
    const tr = this.playerTransform;
    this.renderer.rig.snapTo(tr.x, tr.y, tr.z);
  }

  private update(dt: number): void {
    const input = this.input;
    if (input.wasPressed('toggleDebug')) this.devtools.toggle();
    if (input.wasPressed('quickSave')) this.save();
    if (input.wasPressed('quickLoad')) this.load();

    this.scheduler.tick(this.world, dt, this.ctx);
    this.ctx.tick++;
    input.endTick();
  }

  private render(alpha: number, frameDt: number): void {
    const zoom = this.input.consumeWheel();
    if (zoom !== 0) this.renderer.rig.zoom(zoom);

    this.renderer.sync(this.world, alpha);
    const tr = this.playerTransform;
    const px = tr.prevX + (tr.x - tr.prevX) * alpha;
    const pz = tr.prevZ + (tr.z - tr.prevZ) * alpha;
    this.renderer.render(frameDt, px, tr.y, pz);

    this.devtools.frame(frameDt, () => ({
      entities: this.world.entityCount,
      ...this.renderer.stats,
      position: { x: tr.x, z: tr.z },
      seed: this.ctx.rng.seed,
      tick: this.ctx.tick,
    }));
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
      player: { position: { x: tr.x, y: tr.y, z: tr.z }, facing: tr.facing },
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
