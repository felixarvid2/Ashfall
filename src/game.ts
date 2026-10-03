/**
 * Top-level game: wires ECS, systems, input, rendering, UI and saving together.
 */
import {
  Renderable,
  DisplayName,
  Elite,
  Boss,
  Targetable,
  Npc,
  AccountBonuses,
  Interactable,
  CombatStats,
  Dead,
  DerivedStats,
  EncounterState,
  EnemyAI,
  ForcedMove,
  GroundItem,
  Health,
  Inventory,
  Invulnerable,
  MoveTarget,
  Mover,
  PickupTarget,
  Progression,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
  MinionAI,
  Mounted,
  makeTransform,
} from './core/components';
import type { GameContext } from './core/context';
import { Scheduler, World, type Entity } from './core/ecs';
import { EventQueue, type GameEvent } from './core/events';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { Rng, randomSeed } from './core/rng';
import {
  CHARACTER_SLOTS,
  SAVE_VERSION,
  SaveError,
  SaveStore,
  parseSave,
  safeLocalStorage,
  serializeSave,
  slotKey,
  type SaveData,
} from './core/save';
import { SpatialHash } from './core/spatial';
import { STATUS_DEFS, classDef, skill } from './data/db';
import { t } from './data/i18n';
import { loadSettings, resolveKeybindings, saveSettings, type MoveMode, type Settings } from './data/settings';
import { START_ZONE, ZONES, hasZone, zoneDef, zoneOfTeleporter } from './data/zones';
import type { ZoneDef } from './data/zones/zoneTypes';
import { makeElite, createZoneRuntime, decodeRevealed, encodeRevealed, nearestTeleporter, revealedFraction, suspendZone, zoneSystem, type ZoneRuntime } from './world/zone';
import { GameRenderer } from './render/gameRenderer';
import { collisionSystem, spatialSystem } from './systems/collision';
import { isAlive, kill } from './systems/combat';
import { deathSystem } from './systems/death';
import { encounterSystem, startNextWave } from './systems/encounter';
import { enemyAISystem } from './systems/enemyAI';
import { minionSystem, tetherSystem, turretSystem } from './systems/minions';
import { movementSystem } from './systems/movement';
import { clickableAt, playerControlSystem } from './systems/playerControl';
import { TouchControls, isTouchDevice } from './ui/touchControls';
import { hazardSystem, projectileSystem, summonSystem, trapSystem } from './systems/projectiles';
import { resourceSystem } from './systems/resource';
import { delayedStrikeSystem, forcedMoveSystem, skillSystem } from './systems/skills';
import { statusSystem } from './systems/status';
import { enemyNear } from './systems/targeting';
import { DamageNumbers } from './ui/damageNumbers';
import { CharacterPanel } from './ui/characterPanel';
import { InventoryPanel } from './ui/inventoryPanel';
import { SkillTreePanel, skillIconId } from './ui/skillTreePanel';
import { LootLabels } from './ui/lootLabels';
import { playDropSound, playGoldSound, playPickupSound, unlockAudio } from './audio/lootSounds';
import { PROGRESSION, BASE_ITEMS } from './data/loot/db';
import { slotsFor, type Item, type Slot } from './data/loot/schemas';
import { generateItem, itemPowerFor, xpToNext } from './systems/loot/generate';
import { addToGrid, emptyInventory, equipFromGrid, salvage, socketCrystal, targetSlot, unequip } from './systems/loot/inventory';
import { PICKUP_KEY_RADIUS, grantXp, nextItemUid, pickUp, pickupSystem, rewardSystem, setItemNamer } from './systems/loot/rewards';
import { computePlayerStats, recomputePlayer, sumItemStats } from './systems/stats';
import { monsterLevel } from './systems/encounter';
import { learn, learnedSkills, pointsSpent, resetTree, respecCost, tree } from './systems/skillTree';
import { DevTools } from './ui/devtools';
import { MapUi } from './ui/minimap';
import { Hud, type HudState } from './ui/hud';
import { Toasts } from './ui/toast';
import { spawnArenaProps } from './world/arena';
import { blastSystem, crystalSystem, interactSystem, nearestInteractable, spawnInteractables, syncInteractables } from './world/interactables';
import { loadAccount, relicEffects, saveAccount } from './core/account';
import { InteractPrompt, LoreReader } from './ui/interactUi';
import { keyLabel } from './ui/hud';
import { LORE_XP_PER_LEVEL, PYLONS } from './data/interactables';
import {
  choose,
  completeTalk,
  createQuestRuntime,
  offeredBy,
  questMarkers,
  questSystem,
  saveQuests,
  rebuildQuestWorld,
  setQuestState,
  spawnUnlockedNpcs,
  skipStep,
  startQuest,
  waitingOn,
} from './systems/quests';
import { NPCS, questDef } from './data/quests/db';
import { DialoguePanel, NpcPlates, QuestLog, QuestTracker, type DialogueButton, type DialoguePage, type QuestLogEntry, type TrackedQuest } from './ui/questUi';
import { STASH_POSITION } from './data/quests/cinderFlats';
import { ServicePanel, type ServiceKind } from './ui/servicePanel';
import {
  buy as buyItem,
  extractAspect,
  fromStash,
  imprintAspect,
  rerollAffix,
  rollVendorStock,
  salvageJunk,
  sell as sellItem,
  stashSlots,
  toStash,
} from './systems/hub/services';
import { VENDOR } from './data/services';
import { championAffixes, eliteSystem } from './systems/elites';
import { bossSystem, resetBoss } from './systems/boss';
import { buildInstance, clearInstance, instanceSystem, objectiveText, roomCenter } from './world/instance';
import { ROOM_CELL } from './data/instances';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from './world/setPieces';
import { activeEvent, suspendEvents, worldEventSystem } from './world/worldEvents';
import { environmentSystem, resetEnvironment, sporeExposure, sporesActive } from './world/environment';
import { vehicleSystem } from './systems/vehicle';
import { STORM, stormSystem } from './world/storm';
import { RESTORATION, grantRestorationPoints, restorationBonuses, restorationSystem, tierFor } from './systems/restoration';
import { ELITE_COLORS } from './data/elites';

const PYLON_STATUSES = new Set<string>(Object.values(PYLONS).map((p) => p.status));
import { spawnEnemy, spawnPlayer } from './world/spawn';

/** Placeholder class for the player entity before a character is chosen. */
const DEFAULT_CLASS = 'bastion';
/** Seconds of the black fade when crossing into another zone or teleporting there. */
const ZONE_FADE = 0.35;
/** Seconds between automatic saves while playing. */
const AUTOSAVE_INTERVAL = 60;
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
  /** Black overlay faded in while a zone loads. */
  private readonly fade: HTMLDivElement;
  private readonly toasts: Toasts;
  private readonly devtools: DevTools;
  private readonly damageNumbers: DamageNumbers;
  private readonly inventoryPanel: InventoryPanel;
  private readonly characterPanel: CharacterPanel;
  private readonly skillTreePanel: SkillTreePanel;
  private readonly lootLabels: LootLabels;
  private readonly mapUi: MapUi;
  private readonly interactPrompt: InteractPrompt;
  private readonly loreReader: LoreReader;
  private readonly dialogue: DialoguePanel;
  private readonly npcPlates: NpcPlates;
  private readonly elitePlates: NpcPlates;
  private readonly questTracker: QuestTracker;
  private readonly questLog: QuestLog;
  /** NPC the open conversation is with. */
  private talkingTo: string | null = null;
  private readonly servicePanel: ServicePanel;
  private vendorStock: (Item | null)[] = [];
  /** Simulated time when the trader restocks (also on level up). */
  private vendorRestockAt = -Infinity;
  private player!: Entity;
  private hitstop = 0;
  private lastTarget: { entity: Entity; until: number } | null = null;
  private cursor = '';
  private sporeKey = '';
  private readonly touchControls: TouchControls;

  private hasStoredSettings(): boolean {
    try {
      return !!this.storage?.getItem('ashfall.settings');
    } catch {
      return false;
    }
  }
  private lastNotice = new Map<string, number>();
  private realTime = 0;
  /** Character slot being played (null on the select screen). */
  private slot: number | null = null;
  private characterName = '';
  private nextAutosave = AUTOSAVE_INTERVAL;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const firstRun = !this.hasStoredSettings();
    this.settings = loadSettings(this.storage);
    // Phones start on medium graphics (no 2× pixel ratio, lighter post-processing).
    if (firstRun && isTouchDevice()) this.settings.graphics = 'medium';
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    this.saves = new SaveStore(this.storage);

    this.renderer = new GameRenderer(canvas);
    this.renderer.screenShake = this.settings.screenShake;
    this.renderer.setQuality(this.settings.graphics);
    this.input = new Input(canvas, resolveKeybindings(this.settings));

    const seed = randomSeed();
    this.ctx = {
      input: this.input,
      settings: this.settings,
      rng: new Rng(seed),
      tick: 0,
      time: 0,
      cameraYaw: this.renderer.rig.yaw,
      worldHalfSize: START_ZONE.halfSize,
      pickGround: () =>
        this.input.mouseSeen ? this.renderer.pickGround(this.input.mouseNdc.x, this.input.mouseNdc.y) : null,
      events: new EventQueue(),
      spatial: new SpatialHash(4),
      debug: { godMode: false },
      stats: { kills: 0 },
      loot: { rng: new Rng(seed).fork('loot'), seq: 0 },
      rewards: [],
      zoneLevels: START_ZONE.levels,
      zone: createZoneRuntime(START_ZONE),
      zones: new Map(),
      account: loadAccount(this.storage),
      quests: createQuestRuntime(),
    };
    setItemNamer((baseId) => t(`items.bases.${baseId}`));
    this.ctx.zones!.set(START_ZONE.id, this.ctx.zone!);

    this.scheduler
      .add('spatial', spatialSystem)
      .add('zone', zoneSystem)
      .add('playerControl', playerControlSystem)
      .add('vehicle', vehicleSystem)
      .add('skills', skillSystem)
      .add('enemyAI', enemyAISystem)
      .add('elites', eliteSystem)
      .add('boss', bossSystem)
      .add('setPieces', setPieceSystem)
      .add('worldEvents', worldEventSystem)
      .add('storm', stormSystem)
      .add('minions', minionSystem)
      .add('status', statusSystem)
      .add('movement', movementSystem)
      .add('forcedMove', forcedMoveSystem)
      .add('environment', environmentSystem)
      .add('delayedStrikes', delayedStrikeSystem)
      .add('collision', collisionSystem)
      .add('projectiles', projectileSystem)
      .add('traps', trapSystem)
      .add('summons', summonSystem)
      .add('tethers', tetherSystem)
      .add('turrets', turretSystem)
      .add('hazards', hazardSystem)
      .add('blasts', blastSystem)
      .add('crystals', crystalSystem)
      .add('resource', resourceSystem)
      .add('death', deathSystem)
      .add('encounter', encounterSystem)
      .add('rewards', rewardSystem)
      .add('pickup', pickupSystem)
      .add('interact', interactSystem)
      .add('quests', questSystem)
      .add('instance', instanceSystem)
      .add('restoration', restorationSystem);

    this.damageNumbers = new DamageNumbers(uiRoot);
    this.toasts = new Toasts(uiRoot);
    this.hud = new Hud(uiRoot, () => this.respawn());
    this.fade = document.createElement('div');
    this.fade.className = 'zone-fade';
    uiRoot.append(this.fade);
    this.lootLabels = new LootLabels(uiRoot, (e) => this.requestPickup(e));
    this.interactPrompt = new InteractPrompt(
      uiRoot,
      (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      () => this.input.pressAction('pickup'),
    );
    this.touchControls = new TouchControls(uiRoot, this.input, this.hud.slotElements);
    this.applyTouchControls();
    // "Auto" also switches the touch layout on at the first touch (tablets that report a mouse).
    window.addEventListener(
      'touchstart',
      () => {
        if (this.settings.touchControls === 'auto' && !this.touchControls.shown) {
          this.touchControls.setActive(true);
          this.hud.setTouch(true);
        }
      },
      { once: true, passive: true },
    );
    this.loreReader = new LoreReader(uiRoot);
    this.dialogue = new DialoguePanel(uiRoot);
    this.npcPlates = new NpcPlates(uiRoot);
    this.elitePlates = new NpcPlates(uiRoot);
    this.questTracker = new QuestTracker(uiRoot);
    this.questLog = new QuestLog(uiRoot, () => this.questLogEntries(), (id) => {
      if (this.ctx.quests) this.ctx.quests.tracked = id;
    });
    this.mapUi = new MapUi(
      uiRoot,
      () => this.ctx.zone,
      () => {
        const tr = this.playerTransform;
        return { x: tr.x, z: tr.z, facing: tr.facing };
      },
      (id) => this.teleportTo(id),
      () => [...(this.ctx.zones?.values() ?? [])],
      this.renderer.rig.yaw,
      () => {
        const inst = this.ctx.instance;
        if (!inst) return undefined;
        return { rooms: inst.layout.rooms.map((r) => ({ ...roomCenter(r), size: ROOM_CELL, explored: r.explored, kind: r.kind })) };
      },
    );
    this.mapUi.extraInfo = (zone) => {
      const entry = this.ctx.account?.restoration[zone.def.id];
      const points = entry?.points.length ?? 0;
      const tier = tierFor(points);
      const next = RESTORATION.tiers[tier];
      return next !== undefined ? t('restoration.meter', { tier, points, next }) : t('restoration.max', { tier });
    };
    this.inventoryPanel = new InventoryPanel(
      uiRoot,
      () => this.world.req(this.player, Inventory),
      () => this.world.req(this.player, SkillUser).classId,
      {
        equip: (i) => this.equipItem(i),
        unequip: (slot) => this.unequipItem(slot),
        salvage: (i) => this.salvageItem(i),
        socket: (c, target) => this.socketItem(c, target),
        compare: (item) => this.compare(item),
        iconUrl: (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      },
    );
    this.servicePanel = new ServicePanel(uiRoot, {
      inventory: () => this.world.req(this.player, Inventory),
      classId: () => this.world.req(this.player, SkillUser).classId,
      iconUrl: (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      stock: () => this.vendorStock,
      stash: () => stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots),
      buy: (i) => this.serviceResult(buyItem(this.world.req(this.player, Inventory), this.vendorStock, i)),
      sell: (i) => {
        const gold = sellItem(this.world.req(this.player, Inventory), i);
        if (gold > 0) {
          playGoldSound();
          this.toasts.show(t('loot.salvaged', { gold }));
        }
        this.afterInventoryChange();
      },
      reroll: (gi, ai) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(rerollAffix(this.ctx.loot.rng, inv, item, ai));
      },
      salvageJunk: () => {
        const gold = salvageJunk(this.world.req(this.player, Inventory));
        if (gold > 0) this.toasts.show(t('loot.salvaged', { gold }));
        this.afterInventoryChange();
      },
      extract: (gi) => this.serviceResult(extractAspect(this.world.req(this.player, Inventory), gi)),
      imprint: (ci, gi) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(imprintAspect(inv, ci, item));
      },
      toStash: (gi) => {
        this.serviceResult(toStash(this.world.req(this.player, Inventory), gi, stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots)));
        saveAccount(this.storage, this.ctx.account!);
        this.autosave();
      },
      fromStash: (i) => {
        this.serviceResult(fromStash(this.world.req(this.player, Inventory), stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots), i));
        saveAccount(this.storage, this.ctx.account!);
        this.autosave();
      },
    });
    this.servicePanel.onToggle = (open) => {
      if (open) {
        this.inventoryPanel.toggle(true);
        this.inventoryPanel.setGridClick((i) => this.servicePanel.backpackClick(i));
      } else {
        this.inventoryPanel.setGridClick(null);
      }
    };
    this.characterPanel = new CharacterPanel(uiRoot, () => ({
      className: t(`items.classes.${this.world.req(this.player, SkillUser).classId}`),
      progression: this.world.req(this.player, Progression),
      combat: this.world.req(this.player, CombatStats),
      derived: this.world.req(this.player, DerivedStats),
      health: this.world.req(this.player, Health),
      resourceMax: this.world.req(this.player, Resource).max,
    }));
    this.skillTreePanel = new SkillTreePanel(
      uiRoot,
      () => {
        const user = this.world.req(this.player, SkillUser);
        const prog = this.world.req(this.player, Progression);
        const t3 = tree(user.classId);
        return {
          tree: t3,
          state: user.tree,
          unspent: prog.skillPoints,
          slots: user.slots,
          compiled: user.compiled,
          respecCost: respecCost(t3, prog.level),
          gold: this.world.req(this.player, Inventory).gold,
        };
      },
      {
        learn: (id) => this.learnNode(id),
        reset: () => this.resetSkillTree(),
        assign: (slot, id) => this.assignSlot(slot, id),
        iconUrl: (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      },
    );
    this.hud.setSkillResolvers(
      (id) => this.world.get(this.player, SkillUser)?.compiled[id]?.def ?? skill(id),
      (id) => this.renderer.assets.iconUrl(skillIconId(id), import.meta.env.BASE_URL),
    );
    canvas.addEventListener('mousedown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.devtools = new DevTools(
      uiRoot,
      {
        save: () => this.save(),
        load: () => this.load(),
        exportSave: () => this.exportSave(),
        importSave: (json) => this.importSave(json),
        deleteSave: () => {
          if (this.slot === null) return;
          this.saves.remove(slotKey(this.slot));
          this.slot = null;
          this.toasts.show(t('debug.saveDeleted'));
        },
        setMoveMode: (mode) => this.setMoveMode(mode),
        setTouchControls: (mode) => this.setTouchControls(mode),
        nextWave: () => startNextWave(this.world, this.ctx),
        killAll: () => this.killAllEnemies(),
        spawnHorde: () => this.spawnHorde(100),
        setGodMode: (on) => (this.ctx.debug.godMode = on),
        setGraphics: (q) => this.setGraphics(q),
        addLevel: () => {
          const prog = this.world.req(this.player, Progression);
          grantXp(this.world, this.ctx, this.player, xpToNext(prog.level) - prog.xp);
        },
        spawnLoot: () => {
          const tr = this.playerTransform;
          const level = monsterLevel(this.world, this.ctx);
          for (const rarity of ['legendary', 'legendary', 'unique', 'mythic'] as const) {
            this.ctx.rewards.push({ table: 'dt.wave_reward', level, x: tr.x + 2, z: tr.z, xp: false, rarity });
          }
        },
        extra: [
          {
            label: t('debug.region.teleporters'),
            id: 'debug-teleporters',
            run: () => {
              for (const tp of this.zoneDef.teleporters) this.zone?.discovered.add(tp.id);
            },
          },
          { label: t('debug.region.rare'), id: 'debug-rare', run: () => this.spawnElite('rare') },
          {
            label: t('debug.region.storm'),
            id: 'debug-storm',
            run: () => {
              if (this.zone) this.zone.storm.timer = 0;
            },
          },
          {
            label: t('debug.region.dungeon'),
            id: 'debug-dungeon',
            run: () => {
              if (this.ctx.instance) return this.exitInstance();
              const ids = this.zoneDef.pois.filter((p) => p.kind === 'dungeon').map((p) => p.id);
              if (ids.length) this.enterInstance(ids[this.instanceCount % ids.length]!);
            },
          },
          {
            label: t('debug.region.skipStep'),
            id: 'debug-skip-step',
            run: () => {
              const id = this.ctx.quests?.tracked;
              if (id) skipStep(this.world, this.ctx, id);
              this.world.flushDestroyed();
            },
          },
        ],
        switchCharacter: () => {
          this.save(true);
          location.reload();
        },
        setScreenShake: (on) => {
          this.settings.screenShake = on;
          this.renderer.screenShake = on;
          saveSettings(this.storage, this.settings);
        },
      },
      this.settings.showFps,
      this.settings.screenShake,
      this.settings.graphics,
    );
    this.devtools.setMoveMode(this.settings.moveMode);
    this.devtools.setTouchControls(this.settings.touchControls);
    this.refreshHint();

    this.player = spawnPlayer(this.world, DEFAULT_CLASS, START_ZONE.playerSpawn.x, START_ZONE.playerSpawn.z);
    this.populateZone();
    this.applyAccountBonuses();
    const tr = this.playerTransform;
    this.renderer.rig.snapTo(tr.x, tr.y, tr.z);


    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });
  }

  /** Load 3D models (falls back to placeholders) and build the static environment. */
  async loadAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
    await Promise.all([
      this.renderer.assets.preload(import.meta.env.BASE_URL, onProgress),
      this.renderer.preloadGround(ZONES.map((z) => z.ground)),
    ]);
    this.renderer.buildArena(this.zoneDef);
    this.sporeKey = '';
    this.builtZone = this.zoneDef.id;
  }

  start(): void {
    this.loop.start();
    window.addEventListener('beforeunload', () => this.autosave());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
    });
  }

  // ---- Characters -------------------------------------------------------------

  /** What is in each character slot, for the select screen. */
  characterSlots(): { index: number; character: { name: string; classId: string; level: number; savedAt: string } | null; corrupt?: boolean }[] {
    return Array.from({ length: CHARACTER_SLOTS }, (_, index) => {
      try {
        const data = this.saves.read(slotKey(index));
        if (!data) return { index, character: null };
        return {
          index,
          character: { name: data.character.name, classId: data.character.classId, level: data.progression.level, savedAt: data.savedAt },
        };
      } catch {
        return { index, character: null, corrupt: true };
      }
    });
  }

  /** Start a brand-new character in a slot (overwrites a corrupt slot). */
  newCharacter(slot: number, classId: string, name: string): void {
    this.respawnAs(classId);
    this.resetWorld();
    setQuestState(this.ctx.quests!, { active: {}, done: {}, tracked: null });
    this.enterZone(START_ZONE.id, START_ZONE.playerSpawn.x, START_ZONE.playerSpawn.z);
    this.slot = slot;
    this.characterName = name;
    const inv = this.world.req(this.player, Inventory);
    Object.assign(inv, emptyInventory(PROGRESSION.inventorySize));
    this.grantStarterKit();
    if (this.ctx.account) grantRestorationPoints(this.world, this.ctx.account);
    this.inventoryPanel.refresh();
    this.save(true);
  }

  /** Continue the character saved in a slot. Returns false if it could not be loaded. */
  playCharacter(slot: number): boolean {
    this.slot = slot;
    return this.load();
  }

  deleteCharacter(slot: number): void {
    this.saves.remove(slotKey(slot));
  }

  /** Replace the player entity with a fresh one of another class. */
  private respawnAs(classId: string): void {
    const old = this.player;
    const spawn = this.zoneDef.playerSpawn;
    this.player = spawnPlayer(this.world, classId, spawn.x, spawn.z);
    this.world.destroy(old);
    this.applyAccountBonuses();
    this.renderer.rig.snapTo(spawn.x, 0, spawn.z);
    this.refreshHint();
  }

  /** Account-wide relic bonuses on the current player entity. */
  private applyAccountBonuses(): void {
    if (!this.ctx.account) return;
    const r = restorationBonuses(this.ctx.account);
    this.world.add(this.player, AccountBonuses, { effects: relicEffects(this.ctx.account), potionCharges: r.potionCharges, goldFind: r.goldFind });
    recomputePlayer(this.world, this.player);
  }

  /** Fresh open-world progress for every zone (new character, or before applying a save). */
  private resetWorld(): void {
    const zones = this.ctx.zones!;
    zones.clear();
    const start = createZoneRuntime(START_ZONE);
    zones.set(start.def.id, start);
    this.ctx.zone = start;
  }

  get zoneDef(): ZoneDef {
    return this.ctx.zone?.def ?? START_ZONE;
  }

  /** Zone whose static scene the renderer has built. */
  private builtZone: string | null = null;

  /**
   * Make a zone the current one: everything that belongs to the old zone goes (the player and
   * their minions stay), the scene is rebuilt if needed, and the new zone's props, objects, NPCs
   * and quest steps are spawned. The player is placed at (x, z).
   */
  private enterZone(id: string, x: number, z: number): void {
    const def = zoneDef(id);
    const zones = this.ctx.zones!;
    if (this.ctx.instance) {
      clearInstance(this.world);
      this.ctx.instance = undefined;
      this.renderer.exitInstance();
    }
    const old = this.ctx.zone;
    if (old) {
      suspendZone(old);
      suspendEvents(old);
    }
    this.clearZoneEntities();
    let zone = zones.get(id);
    if (!zone) zones.set(id, (zone = createZoneRuntime(def)));
    this.ctx.zone = zone;
    this.ctx.worldHalfSize = def.halfSize;
    this.ctx.zoneLevels = def.levels;
    if (this.builtZone !== null && this.builtZone !== id) {
      this.renderer.buildArena(def);
      this.sporeKey = '';
      this.builtZone = id;
    }
    this.lastStorm = -1;
    resetEnvironment();
    this.populateZone();
    this.placePlayer(x, z);
    // Raised minions follow you across.
    for (const m of this.world.query(MinionAI, Transform)) {
      if (this.world.req(m, MinionAI).owner !== this.player) continue;
      const a = Math.random() * Math.PI * 2;
      Object.assign(this.world.req(m, Transform), makeTransform(x + Math.sin(a) * 2, 0, z + Math.cos(a) * 2, 0));
    }
    this.closeDialogue();
    this.servicePanel.close();
    this.lastTarget = null;
  }

  /** Remove every entity but the player and their minions. */
  private clearZoneEntities(): void {
    for (const e of this.world.query(Transform)) {
      if (e === this.player) continue;
      const minion = this.world.get(e, MinionAI);
      if (minion && minion.owner === this.player) continue;
      this.world.destroyDeferred(e);
    }
    this.world.flushDestroyed();
  }

  /** Spawn the current zone's static props, objects, stash, NPCs and quest steps. */
  private populateZone(): void {
    const zone = this.ctx.zone;
    if (!zone) return;
    spawnArenaProps(this.world, zone.def);
    const stash = zone.def.id === START_ZONE.id ? STASH_POSITION : zone.def.stash;
    spawnInteractables(this.world, zone, stash ? [{ poi: 'stash', kind: 'stash', ...stash }] : []);
    syncInteractables(this.world, zone);
    syncSetPieces(this.world, zone);
    rebuildQuestWorld(this.world, this.ctx);
    this.world.flushDestroyed();
  }

  /** Cross a border gate: fade out, load the other zone at the paired gate, fade in. */
  private crossGate(gateId: string): void {
    const gate = this.zoneDef.gates.find((g) => g.id === gateId);
    if (!gate || !hasZone(gate.to.zone)) return;
    const target = zoneDef(gate.to.zone).gates.find((g) => g.id === gate.to.gate);
    if (!target) return;
    this.fadeTo(() => {
      this.enterZone(gate.to.zone, target.arrive.x, target.arrive.z);
      this.hud.showBanner(t(`zones.${this.zoneDef.key}.name`), 2.6);
      this.autosave();
    });
  }

  private fading = false;

  /** Black fade around a zone change (the swap happens while the screen is dark). */
  private fadeTo(swap: () => void): void {
    if (this.fading) return;
    this.fading = true;
    this.fade.classList.add('on');
    setTimeout(() => {
      try {
        swap();
      } finally {
        this.fade.classList.remove('on');
        this.fading = false;
      }
    }, ZONE_FADE * 1000);
  }

  private autosave(): void {
    if (this.ctx.account) saveAccount(this.storage, this.ctx.account);
    if (this.slot === null || this.world.has(this.player, Dead)) return;
    try {
      this.saves.write(slotKey(this.slot), this.snapshot());
    } catch {
      // Storage full or blocked: the manual save shows the error.
    }
  }

  setGraphics(quality: Settings['graphics']): void {
    this.settings.graphics = quality;
    this.renderer.setQuality(quality);
    saveSettings(this.storage, this.settings);
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
    if (input.wasPressed('inventory')) this.inventoryPanel.toggle();
    if (input.wasPressed('character')) this.characterPanel.toggle();
    if (input.wasPressed('skills')) this.skillTreePanel.toggle();
    if (input.wasPressed('map')) this.mapUi.toggle();
    if (input.wasPressed('quests')) this.questLog.toggle();
    if (this.loreReader.open && (input.wasPressed('pickup') || input.wasPressed('map'))) this.loreReader.close();

    this.scheduler.tick(this.world, dt, this.ctx);
    this.ctx.tick++;
    this.ctx.time += dt;
    input.endTick();
  }

  private render(alpha: number, frameDt: number): void {
    this.realTime += frameDt;
    if (this.realTime >= this.nextAutosave) {
      this.nextAutosave = this.realTime + AUTOSAVE_INTERVAL;
      this.autosave();
    }
    const events = this.ctx.events.drain();
    this.handleEvents(events);

    // Hit-stop freezes simulation for a few real milliseconds; rendering continues.
    if (this.hitstop > 0) {
      this.hitstop -= frameDt;
      this.loop.timeScale = this.hitstop > 0 ? 0 : 1;
    }
    this.renderer.animationTimeScale = this.loop.timeScale;

    const zoom = this.input.consumeWheel();
    if (zoom !== 0) this.renderer.rig.zoom(zoom);

    this.updateStormLook();
    if (this.zone) {
      const zone = this.zone;
      this.renderer.updateCooled(zone.cooled, this.ctx.time);
      // Spore fields only change when something new is found (a filter, a reclaimed dome).
      const sporeKey = `${zone.def.id}:${zone.found.size}`;
      if (sporeKey !== this.sporeKey) {
        this.sporeKey = sporeKey;
        this.renderer.updateSpores((id) => {
          const f = zone.def.env?.find((e) => e.id === id);
          return f?.kind === 'spores' ? sporesActive(zone, f) : false;
        });
      }
    }
    this.renderer.sync(this.world, alpha, frameDt);
    const tr = this.playerTransform;
    const px = tr.prevX + (tr.x - tr.prevX) * alpha;
    const pz = tr.prevZ + (tr.z - tr.prevZ) * alpha;
    this.renderer.render(frameDt, px, 0, pz);
    this.damageNumbers.update(frameDt, (x, y, z, out) => this.renderer.toScreen(x, y, z, out));
    this.lootLabels.update(this.world, px, pz, this.input.isDown('showLabels'), (x, y, z, out) =>
      this.renderer.toScreen(x, y, z, out),
    );
    if (this.characterPanel.open && Math.floor(this.realTime * 4) !== Math.floor((this.realTime - frameDt) * 4)) {
      this.characterPanel.refresh();
    }
    this.hud.update(this.hudState(), frameDt);
    this.mapUi.markers = this.ctx.instance
      ? this.instanceMarkers()
      : questMarkers(this.world, this.ctx).map((m) => ({ x: m.x, z: m.z, color: m.main ? '#ffd23a' : '#e8e0d0' }));
    this.mapUi.update(frameDt);
    this.updateInteractPrompt(px, pz);
    this.updateQuestUi(px, pz);

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
        case 'loot':
          playDropSound(event.rarity);
          break;
        case 'pickup':
          if (event.kind === 'gold') playGoldSound();
          else playPickupSound();
          this.inventoryPanel.refresh();
          break;
        case 'levelUp':
          this.vendorRestockAt = -Infinity;
          this.hud.showBanner(t('ui.levelUp', { level: event.level }), 2.5);
          this.toasts.show(t('ui.skillPoint'));
          this.characterPanel.refresh();
          this.skillTreePanel.refresh();
          this.autosave();
          break;
        case 'overheat':
          this.notice('combat.overheat', 'error');
          break;
        case 'notice':
          this.notice(event.key, 'error');
          break;
        case 'discover':
          this.toasts.show(t('map.discovered', { name: t(`zones.teleporters.${event.id}`) }));
          this.hud.showBanner(t(`zones.teleporters.${event.id}`), 2);
          break;
        case 'hub':
          if (event.entered) {
            this.hud.showBanner(t(`zones.${this.zoneDef.key}.${event.id}`), 2.2);
            // Safe hubs refill your stim packs.
            const user = this.world.req(this.player, SkillUser);
            user.potionCharges = classDef(user.classId).potion.charges + (this.world.get(this.player, AccountBonuses)?.potionCharges ?? 0);
          }
          break;
        case 'interact':
          this.onInteract(event.kind, event.detail, event.id);
          break;
        case 'zoneGate':
          this.crossGate(event.gate);
          break;
        case 'quest':
          this.onQuestEvent(event.id, event.state);
          break;
        case 'banner': {
          const params: Record<string, string | number> = { ...event.params };
          for (const [k, v] of Object.entries(event.keyParams ?? {})) params[k] = t(v);
          this.hud.showBanner(t(event.key, params), event.seconds ?? 2);
          break;
        }
        default:
          break;
      }
    }
  }

  // ---- Quests and conversations ------------------------------------------------

  private stepText(id: string): string {
    const st = this.ctx.quests?.active.get(id);
    if (!st) return '';
    const step = questDef(id).steps[st.step];
    const count = step?.kind === 'kill' || step?.kind === 'interact' ? step.count : step?.kind === 'escort' ? step.path.length - 1 : 0;
    return t(`quests.${id}.steps.${st.step}`, { n: Math.min(st.progress, count), count });
  }

  private orderedQuests(): string[] {
    const rt = this.ctx.quests;
    if (!rt) return [];
    const rank = { main: 0, side: 1, mystery: 2 } as const;
    return [...rt.active.keys()].sort((a, b) => {
      if (a === rt.tracked) return -1;
      if (b === rt.tracked) return 1;
      return rank[questDef(a).kind] - rank[questDef(b).kind];
    });
  }

  private questLogEntries(): { active: QuestLogEntry[]; done: string[] } {
    const rt = this.ctx.quests;
    if (!rt) return { active: [], done: [] };
    return {
      active: this.orderedQuests().map((id) => {
        const def = questDef(id);
        return {
          id,
          title: t(`quests.${id}.title`),
          summary: t(`quests.${id}.summary`),
          step: this.stepText(id),
          kind: def.kind,
          level: def.level,
          rewards: t('questUi.rewards', { xp: def.rewards.xp, gold: def.rewards.gold }),
          tracked: rt.tracked === id,
        };
      }),
      done: [...rt.done.keys()].map((id) => t(`quests.${id}.title`)),
    };
  }

  private updateQuestUi(px: number, pz: number): void {
    const rt = this.ctx.quests;
    if (!rt) return;
    const tracked: TrackedQuest[] = this.orderedQuests().map((id) => ({
      id,
      title: t(`quests.${id}.title`),
      step: this.stepText(id),
      kind: questDef(id).kind,
      tracked: rt.tracked === id,
    }));
    this.questTracker.update(tracked);
    const plates: { id: string; x: number; z: number; name: string; marker: '!' | '?' | '' }[] = [];
    for (const e of this.world.query(Npc, Transform)) {
      const tr = this.world.req(e, Transform);
      if (Math.hypot(tr.x - px, tr.z - pz) > 32) continue;
      const id = this.world.req(e, Npc).id;
      const marker = waitingOn(rt, id).length ? '?' : offeredBy(rt, id).length ? '!' : '';
      plates.push({ id, x: tr.x, z: tr.z, name: t(`npcs.${id}.name`), marker });
    }
    this.npcPlates.update(plates, (x, y, z, out) => this.renderer.toScreen(x, y, z, out));
    // Elite names float over them (blue champions, yellow rares, named quest targets).
    const elites: { id: string; x: number; z: number; name: string; marker: ''; color: string; y: number }[] = [];
    for (const e of this.world.query(Elite, Transform)) {
      if (this.world.has(e, Dead)) continue;
      const tr = this.world.req(e, Transform);
      // Ash Storms hide name plates until enemies are close.
      if (Math.hypot(tr.x - px, tr.z - pz) > 26 - 16 * (this.zone?.storm.exposure ?? 0)) continue;
      const el = this.world.req(e, Elite);
      const dn = this.world.get(e, DisplayName);
      const ai = this.world.get(e, EnemyAI);
      const name = dn ? (dn.literal ? dn.key : t(dn.key)) : `${t('elites.champion')} ${t(`enemies.${ai?.defId ?? ''}`)}`;
      elites.push({ id: String(e), x: tr.x, z: tr.z, name, marker: '', color: ELITE_COLORS[el.kind], y: tr.y + 2.6 * (this.world.get(e, Renderable)?.scale ?? 1) });
    }
    this.elitePlates.update(elites, (x, y, z, out) => this.renderer.toScreen(x, y, z, out));
    // Leaving the hub closes its services.
    if (this.servicePanel.open && !this.zone?.inHub) this.servicePanel.close();
    // Walking away ends the conversation.
    if (this.dialogue.open && this.talkingTo) {
      const npc = this.world.query(Npc, Transform).find((e) => this.world.req(e, Npc).id === this.talkingTo);
      const tr = npc !== undefined ? this.world.req(npc, Transform) : undefined;
      if (!tr || Math.hypot(tr.x - px, tr.z - pz) > 7) this.closeDialogue();
    }
  }

  private closeDialogue(): void {
    this.dialogue.close();
    this.talkingTo = null;
  }

  private talkTo(npc: string): void {
    this.talkingTo = npc;
    this.dialogue.show(this.npcRoot(npc));
  }

  private page(npc: string, text: string, buttons: DialogueButton[]): DialoguePage {
    return { speaker: t(`npcs.${npc}.name`), role: t(`npcs.${npc}.title`), text, buttons };
  }

  private npcRoot(npc: string): DialoguePage {
    const rt = this.ctx.quests!;
    const buttons: DialogueButton[] = [];
    for (const w of waitingOn(rt, npc)) {
      buttons.push({ tag: t('questUi.talkTag'), label: t(`quests.${w.id}.title`), onClick: () => this.questTalk(npc, w.id) });
    }
    for (const q of offeredBy(rt, npc)) {
      buttons.push({ tag: t('questUi.offerTag'), label: t(`quests.${q.id}.title`), onClick: () => this.questOffer(npc, q.id) });
    }
    const service = NPCS.get(npc)?.service;
    if (service) buttons.push({ label: t(`npcs.${npc}.service`), onClick: () => this.openService(service) });
    buttons.push({ label: t('questUi.goodbye'), onClick: () => this.closeDialogue() });
    return this.page(npc, t(`npcs.${npc}.greeting`), buttons);
  }

  private questOffer(npc: string, id: string): void {
    const def = questDef(id);
    const text = `${t(`quests.${id}.offer`)}
${t('questUi.rewards', { xp: def.rewards.xp, gold: def.rewards.gold })}`;
    this.dialogue.show(
      this.page(npc, text, [
        {
          label: t('questUi.accept'),
          onClick: () => {
            startQuest(this.world, this.ctx, id);
            this.world.flushDestroyed();
            this.dialogue.show(this.npcRoot(npc));
          },
        },
        { label: t('questUi.decline'), onClick: () => this.dialogue.show(this.npcRoot(npc)) },
      ]),
    );
  }

  private questTalk(npc: string, id: string): void {
    const st = this.ctx.quests!.active.get(id);
    const step = st && questDef(id).steps[st.step];
    if (!st || !step) return;
    if (step.kind === 'choice') {
      const key = `quests.${id}.choice${st.step}`;
      this.dialogue.show(
        this.page(
          npc,
          t(`${key}.prompt`),
          step.options.map((o) => ({
            label: t(`${key}.${o.id}`),
            onClick: () => {
              choose(this.world, this.ctx, id, o.id);
              this.dialogue.show(this.page(npc, t(`quests.${id}.result.${o.id}`), [{ label: t('questUi.continue'), onClick: () => this.closeDialogue() }]));
            },
          })),
        ),
      );
      return;
    }
    const lines = t(`quests.${id}.talk${st.step}`);
    this.dialogue.show(
      this.page(npc, lines, [
        {
          label: t('questUi.continue'),
          onClick: () => {
            completeTalk(this.world, this.ctx, id);
            this.world.flushDestroyed();
            this.dialogue.show(this.npcRoot(npc));
          },
        },
      ]),
    );
  }

  private openService(service: ServiceKind): void {
    this.closeDialogue();
    if (service === 'vendor' && (this.ctx.time >= this.vendorRestockAt || this.vendorStock.every((i) => i === null))) this.restockVendor();
    this.servicePanel.show(service);
  }

  private restockVendor(): void {
    const user = this.world.req(this.player, SkillUser);
    const level = this.world.req(this.player, Progression).level;
    this.vendorStock = rollVendorStock(this.ctx.loot.rng, level, user.classId, () => nextItemUid(this.ctx), (id) => t(`items.bases.${id}`));
    this.vendorRestockAt = this.ctx.time + VENDOR.refreshSeconds;
  }

  private serviceResult(r: { ok: true } | { ok: false; reason: string }): void {
    if (!r.ok) this.notice(`services.cannot.${r.reason}`, 'error');
    else playPickupSound();
    this.afterInventoryChange();
    this.servicePanel.refresh();
  }

  private onQuestEvent(id: string, state: 'started' | 'progress' | 'step' | 'completed' | 'failed'): void {
    const title = t(`quests.${id}.title`);
    switch (state) {
      case 'started':
        this.toasts.show(t('questUi.started', { title }));
        break;
      case 'progress':
      case 'step':
        this.toasts.show(t('questUi.progress', { title, step: this.stepText(id) }));
        break;
      case 'completed':
        this.hud.showBanner(t('questUi.completedBanner'), 2.2);
        this.toasts.show(t('questUi.completed', { title }));
        this.toasts.show(t(`quests.${id}.done`));
        playDropSound('rare');
        this.autosave();
        break;
      case 'failed':
        this.toasts.show(t('questUi.failed', { title }), 'error');
        break;
    }
    this.questLog.refresh();
  }

  private lastStorm = -1;

  /** Ash Storm: thicker, browner fog and Lumen glow on the infected while exposed. */
  private updateStormLook(): void {
    const zone = this.zone;
    if (!zone || this.ctx.instance) return;
    const x = Math.round(zone.storm.exposure * 50) / 50;
    if (x === this.lastStorm) return;
    this.lastStorm = x;
    const base = this.zoneDef.fog;
    const mix = (a: string, b: string, t: number) => {
      const pa = parseInt(a.slice(1), 16);
      const pb = parseInt(b.slice(1), 16);
      const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
      return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
    };
    this.renderer.setLook({ color: mix(base.color, '#2a2219', x), density: base.density + STORM.fog * x });
    this.renderer.stormGlow = x;
  }

  private updateInteractPrompt(px: number, pz: number): void {
    const near = this.world.has(this.player, Dead) ? null : nearestInteractable(this.world, px, pz, this.ctx.time);
    const target = near !== null ? { ...this.world.req(near, Transform), kind: this.world.req(near, Interactable).kind } : null;
    this.interactPrompt.update(target, this.touchControls.shown ? t('touch.use') : keyLabel(resolveKeybindings(this.settings).pickup[0] ?? 'KeyE'), (x, y, z, out) =>
      this.renderer.toScreen(x, y, z, out),
    );
  }

  private onInteract(kind: string, detail: string | undefined, id?: string): void {
    switch (kind) {
      case 'chest':
      case 'lockedChest':
        playDropSound('magic');
        if (kind === 'lockedChest') this.toasts.show(t('interact.lockedChest'));
        break;
      case 'keycard':
        playPickupSound();
        this.toasts.show(t('interact.keycard'));
        break;
      case 'pylon':
        if (detail) {
          this.hud.showBanner(t(`pylons.${detail}.name`), 2);
          this.toasts.show(t('interact.pylonToast', { name: t(`pylons.${detail}.name`), desc: t(`pylons.${detail}.desc`) }));
        }
        break;
      case 'relic':
        if (detail) this.toasts.show(t('interact.relic', { bonus: t(`relics.${detail}`) }));
        saveAccount(this.storage, this.ctx.account!);
        this.characterPanel.refresh();
        this.autosave();
        break;
      case 'lore':
        if (detail) this.loreReader.show(detail, LORE_XP_PER_LEVEL * this.world.req(this.player, Progression).level);
        this.autosave();
        break;
      case 'signalTower':
        this.toasts.show(t('interact.signalTower'));
        this.autosave();
        break;
      case 'teleporter':
        if (!this.mapUi.open) this.mapUi.toggle();
        break;
      case 'npc':
        if (id) this.talkTo(id);
        break;
      case 'restoration':
        if (id) this.toasts.show(t(`restoration.rewards.${id}`));
        saveAccount(this.storage, this.ctx.account!);
        this.skillTreePanel.refresh();
        this.autosave();
        break;
      case 'stash':
        this.openService('stash');
        break;
      case 'feature':
        if (detail) this.hud.showBanner(t(`features.${detail}.used`), 2);
        break;
      case 'reclaimed':
        // Pump Station Delta's people move in.
        if (id) spawnUnlockedNpcs(this.world, this.ctx, id);
        this.autosave();
        break;
      case 'dungeon':
      case 'bunker':
        if (id) this.enterInstance(id);
        break;
      case 'portal':
        this.exitInstance();
        break;
      default:
        break;
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

  /** Region and subzone (or hub) under the player, for the HUD. */
  private locationLabel(): { title: string; sub: string } {
    const inst = this.ctx.instance;
    if (inst) return { title: t(`instances.names.${inst.def.kind === 'bunker' ? inst.poi.replace(/\./g, '_') : inst.def.id}`), sub: objectiveText(inst, t) };
    const zone = this.zone!;
    const tr = this.playerTransform;
    const key = zone.def.key;
    if (zone.inHub) return { title: t(`zones.${key}.name`), sub: t(`zones.${key}.${zone.inHub}`) };
    // Between subzones: the zone's road name (the subzone with no area).
    let sub = zone.def.subzones.find((sz) => sz.radius === 0)?.id ?? 'route7';
    let best = Infinity;
    for (const sz of zone.def.subzones) {
      const d = Math.hypot(tr.x - sz.center[0], tr.z - sz.center[1]);
      if (sz.radius > 0 && d < sz.radius && d < best) {
        best = d;
        sub = sz.id;
      }
    }
    const storm = zone.storm.exposure > 0.2 ? ` · ${t('storm.label')}` : '';
    return { title: t(`zones.${key}.name`), sub: `${t(`zones.${key}.${sub}`)}${storm}` };
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
      const def = user.compiled[id]?.def ?? skill(id);
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
    // Diablo-style cursor: crosshair over enemies, a hand over things you can click.
    const cursor = te !== null ? 'crosshair' : ground && clickableAt(w, this.ctx, ground.x, ground.z) ? 'pointer' : '';
    if (cursor !== this.cursor) {
      this.cursor = cursor;
      this.renderer.renderer.domElement.style.cursor = cursor;
    }
    if (te === null && this.lastTarget && this.realTime < this.lastTarget.until && isAlive(w, this.lastTarget.entity)) {
      te = this.lastTarget.entity;
    }
    if (te !== null && isAlive(w, te)) {
      const ai = w.req(te, EnemyAI);
      const th = w.req(te, Health);
      const statuses = [...new Set(w.get(te, StatusEffects)?.list.map((s) => s.id) ?? [])];
      const dn = w.get(te, DisplayName);
      const elite = w.get(te, Elite);
      const name = dn ? (dn.literal ? dn.key : t(dn.key)) : t(`enemies.${ai.defId}`);
      target = {
        name,
        current: th.current,
        max: th.max,
        statuses,
        ...(elite ? { color: ELITE_COLORS[elite.kind], affixes: elite.affixes.map((a) => t(`elites.affixes.${a}`)) } : {}),
      };
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
      potion: { charges: user.potionCharges, max: cls.potion.charges + (w.get(p, AccountBonuses)?.potionCharges ?? 0) },
      wave: enc && enc.wave > 0 ? { wave: enc.wave, alive: enc.alive, phase: enc.phase, timer: enc.timer } : null,
      ...(this.zone ? { location: this.locationLabel() } : {}),
      ...(() => {
        const tr = this.playerTransform;
        const ev = this.ctx.instance ? null : activeEvent(this.zone, tr.x, tr.z);
        return ev ? { event: { title: t(`worldEvents.${ev.type}.title`), text: t(ev.text, ev.params) } } : {};
      })(),
      target,
      // Pylon buffs (and other timed boons) above the action bar.
      buffs: (w.get(p, StatusEffects)?.list ?? [])
        .filter((st) => PYLON_STATUSES.has(st.id))
        .map((st) => ({ id: st.id, remaining: st.remaining, color: STATUS_DEFS[st.id].color })),
      exposure: this.ctx.instance ? 0 : sporeExposure(),
      dead: w.has(p, Dead),
      xp: (() => {
        const prog = w.req(p, Progression);
        return { level: prog.level, current: prog.xp, next: xpToNext(prog.level), skillPoints: prog.skillPoints };
      })(),
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
    // Back at the nearest discovered teleporter (docs/world-and-gameplay.md §13).
    const tr = this.playerTransform;
    // Inside a dungeon you come back at its entrance; bosses reset (docs/world-and-gameplay.md §13).
    setPiecesOnDeath(w, this.zone);
    for (const b of w.query(Boss)) resetBoss(w, b);
    const tp = this.ctx.instance ? { x: this.ctx.instance.start.x - 2, z: this.ctx.instance.start.z - 2 } : this.zone ? nearestTeleporter(this.zone, tr.x, tr.z) : this.zoneDef.playerSpawn;
    const spawn = { x: tp.x + 2, z: tp.z + 2 };
    Object.assign(this.playerTransform, makeTransform(spawn.x, 0, spawn.z, Math.PI));
    w.add(p, Invulnerable, { remaining: 2 });
    this.renderer.rig.snapTo(spawn.x, 0, spawn.z);
  }

  get zone(): ZoneRuntime | undefined {
    return this.ctx.zone;
  }

  // ---- Dungeons and bunkers ----------------------------------------------------

  private instanceCount = 0;

  enterInstance(poiId: string): void {
    const zone = this.zone;
    const poi = zone?.def.pois.find((p) => p.id === poiId);
    if (!zone || !poi || this.ctx.instance) return;
    const defId = poi.kind === 'dungeon' ? String(poi.data?.dungeon ?? '') : String(poi.data?.instance ?? 'bunker');
    // Wake-up packs far away would only sit there: put them back to sleep.
    for (const st of zone.packs.values()) {
      if (st.state !== 'active') continue;
      for (const m of st.members) this.world.destroyDeferred(m);
      st.members = [];
      st.state = 'dormant';
    }
    this.world.flushDestroyed();
    const level = monsterLevel(this.world, this.ctx) + (poi.kind === 'dungeon' ? 1 : 0);
    const rt = buildInstance(this.world, this.ctx, defId, poiId, `${this.ctx.rng.seed}-${this.instanceCount++}`, Math.min(level, this.ctx.zoneLevels[1] + 1), {
      x: poi.x + 3,
      z: poi.z + 3,
    });
    this.ctx.instance = rt;
    this.ctx.worldHalfSize = 2600;
    const xs = rt.layout.rooms.map((r) => roomCenter(r));
    const pad = ROOM_CELL;
    this.renderer.enterInstance(
      {
        minX: Math.min(...xs.map((p) => p.x)) - pad,
        maxX: Math.max(...xs.map((p) => p.x)) + pad,
        minZ: Math.min(...xs.map((p) => p.z)) - pad,
        maxZ: Math.max(...xs.map((p) => p.z)) + pad,
      },
      rt.def.theme,
      rt.lights,
    );
    this.placePlayer(rt.start.x, rt.start.z);
    this.closeDialogue();
    this.servicePanel.close();
    this.hud.showBanner(this.locationLabel().title, 2.4);
  }

  exitInstance(): void {
    const rt = this.ctx.instance;
    if (!rt) return;
    clearInstance(this.world);
    this.ctx.instance = undefined;
    this.ctx.worldHalfSize = this.zoneDef.halfSize;
    this.renderer.exitInstance();
    this.placePlayer(rt.exit.x, rt.exit.z);
    this.autosave();
  }

  /** Objective objects, the cache and the exit on the dungeon minimap. */
  private instanceMarkers(): { x: number; z: number; color: string }[] {
    const out: { x: number; z: number; color: string }[] = [];
    for (const e of this.world.query(Interactable, Transform)) {
      const it = this.world.req(e, Interactable);
      if (it.used) continue;
      const tr = this.world.req(e, Transform);
      if (tr.x < 1400) continue;
      const color = it.kind === 'portal' ? '#5ad2ff' : it.kind === 'cache' ? '#ffb43a' : '#ffd23a';
      out.push({ x: tr.x, z: tr.z, color });
    }
    for (const e of this.world.query(Targetable, Transform)) {
      if (this.world.has(e, Dead)) continue;
      const tr = this.world.req(e, Transform);
      if (tr.x > 1400) out.push({ x: tr.x, z: tr.z, color: '#7dff5a' });
    }
    return out;
  }

  private placePlayer(x: number, z: number): void {
    Object.assign(this.playerTransform, makeTransform(x, 0, z, Math.PI));
    this.world.remove(this.player, MoveTarget);
    this.world.remove(this.player, ForcedMove);
    this.world.add(this.player, Invulnerable, { remaining: 1.5 });
    this.renderer.rig.snapTo(x, 0, z);
  }

  /** Travel to a discovered teleporter (map), in this zone or another one you have visited. */
  teleportTo(id: string): boolean {
    const def = zoneOfTeleporter(id);
    const zone = def && this.ctx.zones?.get(def.id);
    const tp = def?.teleporters.find((t) => t.id === id);
    if (!def || !zone || !tp || !zone.discovered.has(id) || this.world.has(this.player, Dead) || this.fading) return false;
    this.toasts.show(t('map.teleporting', { name: t(`zones.teleporters.${id}`) }));
    const x = tp.x + 2;
    const z = tp.z + 2;
    if (def.id === this.zone?.def.id && !this.ctx.instance) {
      this.placePlayer(x, z);
      return true;
    }
    this.fadeTo(() => {
      this.enterZone(def.id, x, z);
      this.hud.showBanner(t(`zones.${def.key}.name`), 2.4);
      this.autosave();
    });
    return true;
  }

  // ---- Debug helpers ----------------------------------------------------------

  killAllEnemies(): void {
    for (const e of this.world.query(EnemyAI)) {
      if (!this.world.has(e, Dead)) kill(this.world, this.ctx, e, 0);
    }
  }

  /** Debug: set every living boss to this share of its life (to see later phases). */
  setBossLife(fraction: number): void {
    for (const e of this.world.query(Boss, Health)) {
      if (this.world.has(e, Dead)) continue;
      const h = this.world.req(e, Health);
      h.current = h.max * fraction;
    }
  }

  get mounted(): boolean {
    return this.world.has(this.player, Mounted);
  }

  /** Debug: a champion pack or rare elite next to the player. */
  spawnElite(kind: 'champion' | 'rare', enemy = 'infected_colonist'): void {
    const tr = this.playerTransform;
    const rng = this.ctx.rng.fork(`elite-${this.ctx.tick}`);
    const level = this.world.req(this.player, Progression).level;
    const n = kind === 'champion' ? 3 : 1;
    const shared = kind === 'champion' ? championAffixes(rng) : undefined;
    for (let i = 0; i < n; i++) {
      const e = spawnEnemy(this.world, enemy, tr.x + 6 + i * 1.5, tr.z + 4, { level });
      makeElite(this.world, e, kind, rng, shared);
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
    const prog = this.world.req(this.player, Progression);
    const inv = this.world.req(this.player, Inventory);
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      seed: this.ctx.rng.seed,
      rngState: [...this.ctx.rng.getState()],
      tick: this.ctx.tick,
      character: { name: this.characterName || t(`items.classes.${this.world.req(this.player, SkillUser).classId}`), classId: this.world.req(this.player, SkillUser).classId },
      // Saving inside a dungeon puts you back at its entrance.
      player: { position: this.ctx.instance ? { x: this.ctx.instance.exit.x, y: 0, z: this.ctx.instance.exit.z } : { x: tr.x, y: 0, z: tr.z }, facing: tr.facing },
      progression: { ...prog, restorationGranted: prog.restorationGranted ?? 0 },
      inventory: structuredClone({ gold: inv.gold, grid: inv.grid, equipped: inv.equipped, aspects: inv.aspects ?? [] }),
      loot: { seq: this.ctx.loot.seq, rngState: [...this.ctx.loot.rng.getState()] },
      skills: (() => {
        const user = this.world.req(this.player, SkillUser);
        return { ranks: { ...user.tree.ranks }, slots: [...user.slots] };
      })(),
      world: {
        zone: this.zoneDef.id,
        zones: Object.fromEntries(
          [...(this.ctx.zones ?? new Map<string, ZoneRuntime>()).values()].map((z) => [
            z.def.id,
            { discovered: [...z.discovered], revealed: encodeRevealed(z), found: [...z.found], keycards: [...z.keycards] },
          ]),
        ),
      },
      quests: saveQuests(this.ctx.quests!),
    };
  }

  applySave(data: SaveData): void {
    if (this.world.req(this.player, SkillUser).classId !== data.character.classId) this.respawnAs(data.character.classId);
    this.characterName = data.character.name;
    const rng = new Rng(data.seed);
    rng.setState(data.rngState);
    this.ctx.rng = rng;
    this.ctx.tick = data.tick;
    const lootRng = new Rng(data.seed).fork('loot');
    lootRng.setState(data.loot.rngState);
    this.ctx.loot = { rng: lootRng, seq: data.loot.seq };

    const tr = this.playerTransform;
    const { x, y, z } = data.player.position;
    Object.assign(tr, makeTransform(x, y, z, data.player.facing));
    this.world.remove(this.player, ForcedMove);
    const mover = this.world.req(this.player, Mover);
    mover.vx = mover.vz = 0;

    Object.assign(this.world.req(this.player, Progression), data.progression);
    const user = this.world.req(this.player, SkillUser);
    user.tree = { ranks: { ...data.skills.ranks } };
    user.slots = [...data.skills.slots];
    user.cast = null;
    user.cooldowns = {};
    const inv = this.world.req(this.player, Inventory);
    if (data.inventory) {
      const grid = structuredClone(data.inventory.grid);
      // Older saves may have a smaller backpack; pad to the current size.
      while (grid.length < PROGRESSION.inventorySize) grid.push(null);
      Object.assign(inv, { gold: data.inventory.gold, grid, equipped: structuredClone(data.inventory.equipped), aspects: structuredClone(data.inventory.aspects) });
    } else {
      Object.assign(inv, emptyInventory(PROGRESSION.inventorySize));
      this.grantStarterKit();
    }
    recomputePlayer(this.world, this.player);
    const health = this.world.req(this.player, Health);
    health.current = health.max;
    // Every visited zone's progress, then the zone the character stood in (unknown zones fall back
    // to the start of the game).
    this.resetWorld();
    for (const [id, saved] of Object.entries(data.world.zones)) {
      if (!hasZone(id)) continue;
      const zone = createZoneRuntime(zoneDef(id));
      for (const tp of saved.discovered) zone.discovered.add(tp);
      if (saved.revealed) decodeRevealed(zone, saved.revealed);
      for (const f of saved.found) zone.found.add(f);
      for (const k of saved.keycards) zone.keycards.add(k);
      this.ctx.zones!.set(id, zone);
    }
    setQuestState(this.ctx.quests!, data.quests);
    const known = hasZone(data.world.zone);
    const at = known ? { x, z } : START_ZONE.playerSpawn;
    this.enterZone(known ? data.world.zone : START_ZONE.id, at.x, at.z);
    Object.assign(tr, makeTransform(at.x, y, at.z, data.player.facing));
    this.applyAccountBonuses();
    if (this.ctx.account) grantRestorationPoints(this.world, this.ctx.account);
    this.renderer.rig.snapTo(at.x, y, at.z);
    this.inventoryPanel.refresh();
  }

  /** Give a new character its common starter gear (class data), equipped. */
  private grantStarterKit(): void {
    const user = this.world.req(this.player, SkillUser);
    const inv = this.world.req(this.player, Inventory);
    const cls = classDef(user.classId);
    for (const baseId of cls.starterKit) {
      const item = generateItem(this.ctx.loot.rng, {
        itemPower: itemPowerFor(1, this.ctx.loot.rng),
        classId: user.classId,
        uid: nextItemUid(this.ctx),
        rarity: 'common',
        baseId,
        nameOf: (id) => t(`items.bases.${id}`),
      });
      addToGrid(inv, item);
      equipFromGrid(inv, inv.grid.indexOf(item), user.classId);
    }
    recomputePlayer(this.world, this.player);
  }

  // ---- Inventory actions (called by the UI) ---------------------------------

  equipItem(index: number): void {
    const user = this.world.req(this.player, SkillUser);
    const r = equipFromGrid(this.world.req(this.player, Inventory), index, user.classId);
    if (!r.ok) this.notice(`loot.cannot.${r.reason}`, 'error');
    this.afterInventoryChange();
  }

  unequipItem(slot: Slot): void {
    const r = unequip(this.world.req(this.player, Inventory), slot);
    if (!r.ok) this.notice(`loot.cannot.${r.reason}`, 'error');
    this.afterInventoryChange();
  }

  salvageItem(index: number): void {
    const gold = salvage(this.world.req(this.player, Inventory), index);
    if (gold > 0) this.toasts.show(t('loot.salvaged', { gold }));
    this.afterInventoryChange();
  }

  socketItem(crystalIndex: number, target: { grid: number } | { slot: Slot }): void {
    const r = socketCrystal(this.world.req(this.player, Inventory), crystalIndex, target);
    if (!r.ok) this.notice(`loot.cannot.${r.reason}`, 'error');
    this.afterInventoryChange();
  }

  /** Walk to a ground item (clicked label) and pick it up. */
  requestPickup(item: Entity): void {
    if (this.world.has(this.player, Dead) || !this.world.has(item, GroundItem)) return;
    const tr = this.world.req(item, Transform);
    const ptr = this.playerTransform;
    if (Math.hypot(tr.x - ptr.x, tr.z - ptr.z) <= PICKUP_KEY_RADIUS) {
      pickUp(this.world, this.ctx, this.player, item);
      this.world.flushDestroyed();
      return;
    }
    this.world.add(this.player, PickupTarget, { target: item });
    this.world.add(this.player, MoveTarget, { x: tr.x, z: tr.z });
  }

  /** Compare a backpack item with what is equipped in the slot it would go to. */
  private compare(item: Item): { stats: { stat: import('./data/loot/schemas').StatKey; delta: number }[]; damagePct: number; life: number } | null {
    const inv = this.world.req(this.player, Inventory);
    const user = this.world.req(this.player, SkillUser);
    const base = BASE_ITEMS.get(item.base);
    if (!base || slotsFor(base.type).length === 0) return null;
    const slot: Slot | null = slotsFor(base.type).length > 1 ? (targetSlot(inv, item) ?? null) : (slotsFor(base.type)[0] ?? null);
    if (!slot) return null;
    const current = inv.equipped[slot];
    const prog = this.world.req(this.player, Progression);
    const cls = classDef(user.classId);
    const before = computePlayerStats(cls, prog.level, inv.equipped);
    const after = computePlayerStats(cls, prog.level, { ...inv.equipped, [slot]: item });
    const a = sumItemStats([item]);
    const b = sumItemStats(current ? [current] : []);
    const keys = new Set([...a.keys(), ...b.keys()]);
    return {
      stats: [...keys].map((stat) => ({ stat, delta: (a.get(stat) ?? 0) - (b.get(stat) ?? 0) })),
      damagePct: before.damageEstimate > 0 ? after.damageEstimate / before.damageEstimate - 1 : 0,
      life: after.maxLife - before.maxLife,
    };
  }

  // ---- Skill tree actions (called by the skill tree panel) ------------------

  learnNode(id: string): void {
    const user = this.world.req(this.player, SkillUser);
    const prog = this.world.req(this.player, Progression);
    const t = tree(user.classId);
    const before = learnedSkills(t, user.tree);
    const r = learn(t, user.tree, id, prog.skillPoints);
    if (!r.ok) {
      this.notice(`tree.cannot.${r.reason}`, 'error');
      return;
    }
    prog.skillPoints--;
    recomputePlayer(this.world, this.player);
    // A newly learned skill goes into the first empty action bar slot.
    for (const skillId of learnedSkills(t, user.tree).keys()) {
      if (before.has(skillId) || user.slots.includes(skillId)) continue;
      const free = user.slots.indexOf(null);
      if (free >= 0) user.slots[free] = skillId;
    }
    this.skillTreePanel.refresh();
  }

  resetSkillTree(): void {
    const user = this.world.req(this.player, SkillUser);
    const prog = this.world.req(this.player, Progression);
    const inv = this.world.req(this.player, Inventory);
    const t = tree(user.classId);
    const cost = respecCost(t, prog.level);
    if (pointsSpent(t, user.tree) === 0) return;
    if (inv.gold < cost) {
      this.notice('tree.cannot.gold', 'error');
      return;
    }
    inv.gold -= cost;
    prog.skillPoints += resetTree(t, user.tree);
    recomputePlayer(this.world, this.player);
    user.slots = user.slots.map((s) => (s && user.compiled[s] ? s : null));
    if (!user.slots.some(Boolean)) user.slots[0] = classDef(user.classId).actionBar[0] ?? null;
    this.skillTreePanel.refresh();
    this.inventoryPanel.refresh();
  }

  assignSlot(slot: number, skillId: string | null): void {
    const user = this.world.req(this.player, SkillUser);
    if (skillId && !user.compiled[skillId]) return;
    // Moving a skill that is already on the bar swaps the two slots.
    const existing = skillId ? user.slots.indexOf(skillId) : -1;
    if (existing >= 0) user.slots[existing] = user.slots[slot] ?? null;
    user.slots[slot] = skillId;
    this.skillTreePanel.refresh();
  }

  private afterInventoryChange(): void {
    recomputePlayer(this.world, this.player);
    this.inventoryPanel.refresh();
    this.servicePanel?.refresh();
  }

  save(quiet = false): void {
    if (this.slot === null) return;
    try {
      this.saves.write(slotKey(this.slot), this.snapshot());
      if (!quiet) this.toasts.show(t('save.saved'));
    } catch {
      this.toasts.show(t('save.storageUnavailable'), 'error');
    }
  }

  load(): boolean {
    if (this.slot === null) return false;
    try {
      const data = this.saves.read(slotKey(this.slot));
      if (!data) {
        this.toasts.show(t('save.noSave'), 'error');
        return false;
      }
      this.applySave(data);
      this.toasts.show(t('save.loaded'));
      return true;
    } catch (err) {
      const reason = err instanceof SaveError ? err.message : String(err);
      this.toasts.show(t('save.loadFailed', { reason }), 'error');
      return false;
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

  setTouchControls(mode: Settings['touchControls']): void {
    this.settings.touchControls = mode;
    saveSettings(this.storage, this.settings);
    this.applyTouchControls();
  }

  private applyTouchControls(): void {
    const mode = this.settings.touchControls;
    const on = mode === 'on' || (mode === 'auto' && isTouchDevice());
    this.touchControls.setActive(on);
    this.hud.setTouch(on);
  }

  setMoveMode(mode: MoveMode): void {
    this.settings.moveMode = mode;
    saveSettings(this.storage, this.settings);
    this.refreshHint();
  }

  private refreshHint(): void {
    this.hud.updateHint(this.settings.moveMode, resolveKeybindings(this.settings));
  }
}
