/**
 * Top-level game: wires ECS, systems, input, rendering, UI and saving together.
 */
import {
  AttackTarget,
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
  InteractTarget,
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
  NewerSaveError,
  SaveError,
  SaveStore,
  parseSave,
  safeLocalStorage,
  SaveDataSchema,
  serializeSave,
  slotKey,
  type SaveData,
  type SaveWriteResult,
} from './core/save';
import { SpatialHash } from './core/spatial';
import { classDef, skill } from './data/db';
import { setTouchWording, t } from './data/i18n';
import { loadSettings, resolveKeybindings, saveSettings, type MoveMode, type Settings } from './data/settings';
import { START_ZONE, ZONES, hasZone, zoneDef, zoneOfTeleporter } from './data/zones';
import { classAssetIds, zoneAssetIds, zoneInstanceAssetIds } from './data/assetSets';
import type { ZoneDef } from './data/zones/zoneTypes';
import { makeElite, createZoneRuntime, decodeRevealed, encodeRevealed, nearestTeleporter, suspendZone, zoneSystem, type ZoneRuntime } from './world/zone';
import { GameRenderer } from './render/gameRenderer';
import { collisionSystem, spatialSystem } from './systems/collision';
import { navigationSystem } from './systems/navigation';
import { UNDERGROUND, litFloodlights, rockSystem, undergroundState, undergroundSystem } from './world/underground';
import { bridgeSystem, gravitySystem } from './world/theCore';
import { isAlive, kill } from './systems/combat';
import { applyDeathPenalty, deathSystem } from './systems/death';
import { encounterSystem, startNextWave } from './systems/encounter';
import { enemyAISystem } from './systems/enemyAI';
import { guardianSystem, sanctumSystem } from './systems/lightbearer';
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
import { EnemyBars, ELITE_RANGE, type EnemyBarInfo } from './ui/enemyBars';
import { CharacterPanel } from './ui/characterPanel';
import { InventoryPanel } from './ui/inventoryPanel';
import { bestLoadout, sortGrid, type EquipMove, type SortMode } from './ui/inventoryLogic';
import { SkillTreePanel, skillIconId } from './ui/skillTreePanel';
import { averageItemPower, unassignedSkills } from './ui/serviceLogic';
import { MatrixPanel } from './ui/matrixPanel';
import { LootLabels, rarityRank } from './ui/lootLabels';
import { haptic, setHaptics } from './ui/haptics';
import { dropHitstopMs, playDropSound, playGoldSound, playPickupSound } from './audio/lootSounds';
import { audio } from './audio/engine';
import { soundsForEvents } from './audio/eventSounds';
import { FootstepClock, footstepPlay } from './audio/footsteps';
import { MusicController } from './audio/music';
import { installUiSounds } from './audio/uiSounds';
import { MENU_SCENE, surfaceOf, type AudioScene } from './data/audio';
import { SoundUi } from './ui/soundPanel';
import { PROGRESSION, BASE_ITEMS } from './data/loot/db';
import { slotsFor, type Item, type Slot } from './data/loot/schemas';
import { generateItem, itemPowerFor, xpToNext } from './systems/loot/generate';
import { addToGrid, emptyInventory, equipFromGrid, salvage, socketCrystal, targetSlot, unequip } from './systems/loot/inventory';
import { PICKUP_KEY_RADIUS, grantXp, nextItemUid, pickUp, pickupSystem, rewardSystem, setItemNamer } from './systems/loot/rewards';
import { compareGear, recomputePlayer, setExtraEffects } from './systems/stats';
import * as matrix from './systems/endgame/matrix';
import { monsterLevel } from './systems/encounter';
import { canRefund, learn, learnedSkills, pointsSpent, refundCost, refundRank, resetTree, respecCost, tree } from './systems/skillTree';
import { DevTools } from './ui/devtools';
import { MapUi, type MapBlip } from './ui/minimap';
import { artUrl } from './ui/art';
import { Hud, type HudState } from './ui/hud';
import { playerStatuses } from './ui/statusTiles';
import { Toasts } from './ui/toast';
import { spawnArenaProps } from './world/arena';
import { blastSystem, crystalSystem, interactSystem, nearestInteractable, spawnInteractables, syncInteractables } from './world/interactables';
import { acknowledgeAccountRecovery, loadAccount, relicEffects, saveAccount } from './core/account';
import { runSaveApply, sanitizeSave } from './core/saveRefs';
import { InteractPrompt, LoreReader } from './ui/interactUi';
import { deathCauseLine } from './ui/deathCause';
import { bossPhaseTicks, keyLabel } from './ui/hud';
import { LORE_XP_PER_LEVEL } from './data/interactables';
import {
  choose,
  completeTalk,
  createQuestRuntime,
  greetingKey,
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
import { DialoguePanel, NpcPlates, QuestLog, QuestTracker, type DialogueButton, type DialoguePage, type QuestLogDone, type QuestLogEntry, type TrackedQuest } from './ui/questUi';
import { STASH_POSITION } from './data/quests/cinderFlats';
import { ServicePanel, type ServiceKind } from './ui/servicePanel';
import { TierPanel, tierBadgeText } from './ui/tierPanel';
import { RiftHud, RiftPanel } from './ui/riftPanel';
import { RIFT, RIFT_ID } from './data/endgame/rifts';
import { riftObeliskAt } from './data/endgame/riftObelisks';
import { GLYPH_DEFS } from './data/endgame/matrix';
import { riftEntryProblem, riftGlyphAttempt, riftHud, riftOpenLevel, riftsUnlocked } from './systems/endgame/rifts';
import { TIER_BEACONS } from './data/endgame/beacons';
import { chooseTier, currentTier, monsterLevelCap, playerInCombat, setEnemyScaling, tickPlaytime, tierMods } from './systems/endgame/tiers';
import {
  buy as buyItem,
  extractAspect,
  fromStash,
  imprintAspect,
  rerollAffix,
  rollVendorStock,
  salvageJunk,
  sell as sellItem,
  buyBack as buyBackItem,
  type BuybackEntry,
  stashSlots,
  toStash,
} from './systems/hub/services';
import { codexImprint, codexValue, grantSalvageDust, masterworkRankUp, masterworkReset, temperItem } from './systems/endgame/crafting';
import { VENDOR } from './data/services';
import { championAffixes, eliteSystem } from './systems/elites';
import { activeMemory, bossSystem, inBeat, resetBoss } from './systems/boss';
import { CREDIT_KEYS, epilogueKeys, type LumenChoice } from './data/lumen';
import { chooseLumen, lumenCameraFocus } from './world/lumen';
import { EpilogueScreen } from './ui/epilogue';
import { panelStack } from './ui/panelStack';
import { registerGamePanels } from './ui/panelRegistry';
import { meanItemPower } from './ui/characterSelect';
import { PauseMenu } from './ui/pauseMenu';
import { SettingsPanel } from './ui/settingsPanel';
import { CoachMarks } from './ui/onboarding';
import { CROWD_RANGE, lookAheadOffset } from './render/camera';
import { FeelUi, blackHoldMs, guideGoal } from './ui/feelUi';
import { FEEL, frameFeel } from './systems/impact';
import { buildInstance, clearInstance, hasInstance, instanceSystem, objectiveText, roomCenter } from './world/instance';
import { ROOM_CELL } from './data/instances';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from './world/setPieces';
import { activeWorldBoss, worldBossMarker, worldBossRuntime, worldBossSystem } from './world/worldBoss';
import { WorldBossHud } from './ui/worldBossHud';
import { EndgameStack } from './ui/endgameStack';
import { EdgeArrow, edgeInsets, placeEdgeArrow } from './ui/edgeArrows';
import { WORLD_BOSS, worldBossPortrait } from './data/endgame/worldBosses';
import { activeEvent, suspendEvents, worldEventSystem } from './world/worldEvents';
import { harvestSystem, harvestView } from './world/harvest';
import { HarvestHud } from './ui/harvestHud';
import { environmentSystem, resetEnvironment, sporeExposure, sporesActive } from './world/environment';
import { vehicleSystem } from './systems/vehicle';
import { STORM, stormSystem } from './world/storm';
import { RESTORATION, grantRestorationPoints, restorationBonuses, restorationSystem, tierFor } from './systems/restoration';
import { ELITE_COLORS } from './data/elites';

import { spawnEnemy, spawnPlayer } from './world/spawn';

/** Placeholder class for the player entity before a character is chosen. */
const DEFAULT_CLASS = 'bastion';
/** Longest the black fade waits for models to load before showing the zone anyway (placeholders swap in later). */
const ASSET_WAIT_MS = 8000;
/** Seconds of the black fade when crossing into another zone or teleporting there. */
const ZONE_FADE = 0.35;
/** Seconds between automatic saves while playing. */
const AUTOSAVE_INTERVAL = 60;
/** How long the target frame keeps showing the last enemy you hit. */
const TARGET_MEMORY = 4;
/** Touch: the target frame lingers 8 s after the last hit, and as long as the enemy is within TARGET_NEAR metres. */
const TARGET_MEMORY_TOUCH = 8;
const TARGET_NEAR = 12;
/** Enemies hunting the player this close (metres) count toward the combat music. */
const THREAT_RANGE = 28;
/** Menus do not pause the game while a live enemy is this close (metres). */
const PAUSE_ENEMY_RANGE = 12;
/** ?nav in the address bar starts with the wayfinding overlay on (it can also be ticked in the debug panel). */
const NAV_OVERLAY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nav');

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
  /** The shared account as read at start-up; `recovered` means a bad blob was backed up and rebuilt. */
  private readonly loadedAccount = loadAccount(this.storage);
  /** Set after a load that failed half-way: autosave stays off until a load succeeds or a new game starts. */
  private autosaveSuppressed = false;
  /** Consecutive autosaves that could not write (storage full or blocked). */
  private autosaveFailures = 0;
  private readonly hud: Hud;
  /** Black overlay faded in while a zone loads. */
  private readonly fade: HTMLDivElement;
  private readonly toasts: Toasts;
  private readonly worldBossHud: WorldBossHud;
  private readonly harvestHud: HarvestHud;
  private readonly devtools: DevTools;
  private readonly damageNumbers: DamageNumbers;
  private readonly inventoryPanel: InventoryPanel;
  private readonly characterPanel: CharacterPanel;
  private readonly skillTreePanel: SkillTreePanel;
  private readonly matrixPanel: MatrixPanel;
  private readonly lootLabels: LootLabels;
  private readonly mapUi: MapUi;
  private readonly interactPrompt: InteractPrompt;
  private readonly loreReader: LoreReader;
  private readonly dialogue: DialoguePanel;
  private readonly epilogue: EpilogueScreen;
  private settingsPanel!: SettingsPanel;
  private pauseMenu!: PauseMenu;
  private uiRoot!: HTMLElement;
  /** The backpack was opened by a hub service, so closing the service closes it too. */
  private inventoryOpenedByService = false;
  private pauseFrame = 0;
  private menuPausedNow = false;
  private readonly npcPlates: NpcPlates;
  private readonly enemyBars: EnemyBars;
  /** Enemy infos reused every frame (bars, plates, minimap blips). */
  private readonly enemyInfos: EnemyBarInfo[] = [];
  private readonly blipBuf: MapBlip[] = [];
  /** Quest markers, computed once per frame and shared by the minimap and the tracker arrow. */
  private frameQuestMarkers: ReturnType<typeof questMarkers> = [];
  /** The floodlights and flares behind the renderer's dynamic lights (dark zones), to skip rebuilding an unchanged set. */
  private dynamicLightKey = '';
  private readonly questTracker: QuestTracker;
  private readonly questLog: QuestLog;
  /** NPC the open conversation is with. */
  private talkingTo: string | null = null;
  private readonly servicePanel: ServicePanel;
  private readonly tierPanel: TierPanel;
  private readonly riftPanel: RiftPanel;
  private readonly riftHudUi: RiftHud;
  private readonly endgameChip: EndgameStack;
  private readonly bossArrow: EdgeArrow;
  /** The enemy the target frame shows (its floating plate is hidden on a phone). */
  private hudTarget: Entity | null = null;
  private vendorStock: (Item | null)[] = [];
  /** Items sold to the trader since the last restock (B023); memory only. */
  private vendorBuyback: BuybackEntry[] = [];
  /** Simulated time when the trader restocks (also on level up). */
  private vendorRestockAt = -Infinity;
  private player!: Entity;
  private hitstop = 0;
  /** Slow-motion beat after a big kill or the hero's death (real seconds left, and the speed). */
  private slowmoLeft = 0;
  private slowmoScale = 1;
  private coach!: CoachMarks;
  private feelUi!: FeelUi;
  private lastTarget: { entity: Entity; until: number } | null = null;
  private cursor = '';
  private sporeKey = '';
  private readonly touchControls: TouchControls;
  private readonly soundUi: SoundUi;
  private readonly music = new MusicController(audio);
  private readonly footsteps = new FootstepClock();
  private lastFoot = { x: 0, z: 0 };
  /** False until a character is played (the select screen has its own music). */
  private playing = false;

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
    if (firstRun && isTouchDevice()) {
      this.settings.graphics = 'medium';
      // The FPS meter is a setting on phones (Settings > Display) and starts off.
      this.settings.showFps = false;
    }
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    this.saves = new SaveStore(this.storage);
    audio.bind(this.settings.audio);
    audio.install();

    this.renderer = new GameRenderer(canvas);
    this.renderer.screenShake = this.settings.screenShake;
    this.renderer.reduceFlashing = this.settings.reduceFlashing;
    this.renderer.setBrightness(this.settings.brightness);
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
      account: this.loadedAccount.account,
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
      .add('navigation', navigationSystem)
      .add('enemyAI', enemyAISystem)
      .add('elites', eliteSystem)
      .add('boss', bossSystem)
      .add('setPieces', setPieceSystem)
      .add('worldBoss', worldBossSystem)
      .add('worldEvents', worldEventSystem)
      .add('harvest', harvestSystem)
      .add('storm', stormSystem)
      .add('minions', minionSystem)
      .add('status', statusSystem)
      .add('movement', movementSystem)
      .add('forcedMove', forcedMoveSystem)
      .add('environment', environmentSystem)
      .add('underground', undergroundSystem)
      .add('gravity', gravitySystem)
      .add('bridges', bridgeSystem)
      .add('delayedStrikes', delayedStrikeSystem)
      .add('collision', collisionSystem)
      .add('rock', rockSystem)
      .add('projectiles', projectileSystem)
      .add('traps', trapSystem)
      .add('summons', summonSystem)
      .add('tethers', tetherSystem)
      .add('turrets', turretSystem)
      .add('sanctums', sanctumSystem)
      .add('guardians', guardianSystem)
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

    // Panel framework: Back/Escape, the shared header, one panel at a time, the tab bar (src/ui/panelStack.ts).
    this.uiRoot = uiRoot;
    panelStack.init(uiRoot);
    setHaptics(this.settings.haptics);
    this.damageNumbers = new DamageNumbers(uiRoot, 80, (e) => this.world.get(e, Health)?.max ?? 0);
    this.toasts = new Toasts(uiRoot);
    if (this.loadedAccount.recovered) {
      this.toasts.show(t(this.loadedAccount.reason === 'newer' ? 'save.accountNewer' : 'save.accountRecovered'), 'error', 12000);
    }
    // The endgame status rows (rift timer, world boss, Ash Harvest) share one column; style.css positions it.
    const endgameStack = document.createElement('div');
    endgameStack.className = 'endgame-stack';
    uiRoot.append(endgameStack);
    this.worldBossHud = new WorldBossHud(endgameStack, (message) => this.toasts.show(message, 'info', 4500));
    this.harvestHud = new HarvestHud(endgameStack);
    this.hud = new Hud(uiRoot, () => this.respawn());
    this.hud.onOpenSkills = () => this.input.pressAction('skills');
    // On a phone the stack lives in the HUD's left column (one chip, see portrait/hud.css).
    this.hud.leftColumn.append(endgameStack);
    this.fade = document.createElement('div');
    this.fade.className = 'zone-fade';
    uiRoot.append(this.fade);
    this.lootLabels = new LootLabels(
      uiRoot,
      (e) => this.requestPickup(e),
      (message) => this.toasts.show(message, 'info', 1800),
      () => this.settings.lootLabelMin,
    );
    this.interactPrompt = new InteractPrompt(
      uiRoot,
      (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      () => this.input.pressAction('pickup'),
    );
    this.soundUi = new SoundUi(uiRoot, () => this.settings.audio, {
      apply: () => audio.refresh(),
      save: () => saveSettings(this.storage, this.settings),
      toggleMute: () => this.toggleMute(),
      muteKey: () => keyLabel(resolveKeybindings(this.settings).toggleMute[0] ?? 'KeyN'),
    });
    this.touchControls = new TouchControls(uiRoot, this.input, this.hud.slotElements, this.soundUi.touchEntries(), (message) => this.toasts.show(message, 'info', 3500));
    this.soundUi.refresh();
    installUiSounds(uiRoot, audio);
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
    this.epilogue = new EpilogueScreen(uiRoot);
    this.npcPlates = new NpcPlates(uiRoot, (id) => this.walkToNpc(id));
    this.enemyBars = new EnemyBars(uiRoot);
    this.questTracker = new QuestTracker(uiRoot, () => this.input.pressAction('quests'));
    this.questLog = new QuestLog(
      uiRoot,
      () => this.questLogEntries(),
      (id) => {
        if (this.ctx.quests) this.ctx.quests.tracked = id;
      },
      {
        // The map opens centred on the quest's marker (or plain, when the step has none).
        showOnMap: (id) => {
          const m = questMarkers(this.world, this.ctx).find((q) => q.quest === id);
          if (m && !this.ctx.instance) this.mapUi.openAt(m.x, m.z);
          else if (!this.mapUi.open) this.input.pressAction('map');
        },
        openMap: () => {
          if (!this.mapUi.open) this.input.pressAction('map');
        },
        playerLevel: () => this.world.get(this.player, Progression)?.level ?? 0,
      },
    );
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
        equip: (i, slot) => this.equipItem(i, slot),
        unequip: (slot) => this.unequipItem(slot),
        salvage: (i) => this.salvageItem(i),
        salvageMany: (indices) => this.salvageItems(indices),
        salvageJunk: () => {
          const gold = salvageJunk(this.world.req(this.player, Inventory));
          if (gold > 0) this.toasts.show(t('loot.salvaged', { gold }));
          this.afterInventoryChange();
        },
        sort: (mode) => this.sortInventory(mode),
        bestCount: () => this.bestEquipMoves().length,
        equipBest: () => this.equipBest(),
        socket: (c, target) => this.socketItem(c, target),
        compare: (item, slot) => this.compare(item, slot),
        marked: () => this.autosave(),
        notify: (text) => this.toasts.show(text),
        codex: () => this.ctx.account?.endgame.codex ?? [],
        iconUrl: (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      },
    );
    this.servicePanel = new ServicePanel(uiRoot, {
      inventory: () => this.world.req(this.player, Inventory),
      classId: () => this.world.req(this.player, SkillUser).classId,
      iconUrl: (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      stock: () => this.vendorStock,
      stash: () => stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots),
      compare: (item) => this.compare(item),
      buyback: () => this.vendorBuyback,
      buyBack: (i) => {
        const r = buyBackItem(this.world.req(this.player, Inventory), this.vendorBuyback, i);
        if (r.ok) audio.play('ui.coins');
        this.serviceResult(r);
      },
      sortStash: (mode) => {
        const slots = stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots);
        slots.splice(0, slots.length, ...sortGrid(slots, mode));
        saveAccount(this.storage, this.ctx.account!);
      },
      buy: (i) => {
        const r = buyItem(this.world.req(this.player, Inventory), this.vendorStock, i);
        if (r.ok) audio.play('ui.coins');
        this.serviceResult(r);
      },
      sell: (i) => {
        if (this.world.req(this.player, Inventory).grid[i]?.locked) {
          this.toasts.show(t('items.bag.lockedToast'));
          return;
        }
        const gold = sellItem(this.world.req(this.player, Inventory), i, this.vendorBuyback);
        if (gold > 0) {
          playGoldSound();
          audio.play('ui.coins');
          this.toasts.show(t('loot.salvaged', { gold }));
        }
        this.afterInventoryChange();
      },
      reroll: (gi, ai) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(rerollAffix(this.ctx.loot.rng, inv, item, ai, tierMods(this.ctx)));
      },
      salvageJunk: (keep) => {
        const gold = salvageJunk(this.world.req(this.player, Inventory), keep);
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
        const r = toStash(this.world.req(this.player, Inventory), gi, stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots));
        this.serviceResult(r);
        if (r.ok) this.toasts.show(t('services.stash.movedIn'));
        saveAccount(this.storage, this.ctx.account!);
        this.autosave();
      },
      fromStash: (i) => {
        const r = fromStash(this.world.req(this.player, Inventory), stashSlots(this.ctx.account!.stash, restorationBonuses(this.ctx.account!).stashSlots), i);
        this.serviceResult(r);
        if (r.ok) this.toasts.show(t('services.stash.movedOut'));
        saveAccount(this.storage, this.ctx.account!);
        this.autosave();
      },
      endgame: () => ({
        tierUnlocked: this.ctx.account?.endgame.tierUnlocked ?? 1,
        recipes: this.ctx.endgame?.recipes ?? [],
        materials: this.ctx.endgame?.materials ?? {},
        codex: this.ctx.account?.endgame.codex ?? [],
      }),
      codexValue: (id, ip) => codexValue(this.ctx, id, ip),
      temper: (gi, id, slot) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(temperItem(this.ctx.loot.rng, this.ctx, inv, item, id, slot));
      },
      masterworkRankUp: (gi) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(masterworkRankUp(this.ctx.loot.rng, this.ctx, inv, item));
      },
      masterworkReset: (gi) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(masterworkReset(inv, item));
      },
      codexImprint: (id, gi) => {
        const inv = this.world.req(this.player, Inventory);
        const item = inv.grid[gi];
        if (item) this.serviceResult(codexImprint(this.ctx, inv, item, id));
      },
    });
    this.tierPanel = new TierPanel(uiRoot, {
      unlocked: () => this.ctx.account?.endgame.tierUnlocked ?? 1,
      chosen: () => currentTier(this.ctx),
      inCombat: () => playerInCombat(this.world, this.ctx),
      riftBest: () => this.ctx.account?.endgame.riftBest ?? 0,
      pick: (tier) => {
        if (!chooseTier(this.world, this.ctx, tier)) return;
        saveAccount(this.storage, this.ctx.account!);
        this.toasts.show(t('worldTiers.picked', { tier: tierBadgeText(tier) }));
      },
    });
    this.riftPanel = new RiftPanel(uiRoot, {
      levels: () => {
        const e = this.ctx.account?.endgame;
        return { open: riftOpenLevel(this.ctx), best: e?.riftBest ?? 0, time: e?.riftTime ?? 0 };
      },
      enter: (level) => this.enterRift(level),
      glyphs: () => (this.ctx.endgame?.glyphs ?? []).map((g) => ({ id: g.id, name: this.glyphName(g.id), level: g.level })),
      attempts: () => this.ctx.instance?.rift?.attempts ?? 0,
      result: () => this.ctx.instance?.rift?.result ?? null,
      upgrade: (id) => {
        const rift = this.ctx.instance?.rift;
        const r = rift ? riftGlyphAttempt(this.ctx, rift, id) : false;
        if (r) {
          // The new glyph level applies at once.
          recomputePlayer(this.world, this.player);
          this.autosave();
        }
        return r;
      },
    });
    this.riftHudUi = new RiftHud(endgameStack, uiRoot);
    this.bossArrow = new EdgeArrow(uiRoot);
    this.endgameChip = new EndgameStack(
      endgameStack,
      { rift: this.riftHudUi.element, worldBoss: this.worldBossHud.element, harvest: this.harvestHud.element },
      () => {
        // The world boss row: the map, on the boss's spot (in whichever region it is).
        const st = activeWorldBoss(this.ctx);
        if (st && !this.ctx.instance) this.mapUi.openAt(st.event.spot.x, st.event.spot.z, st.event.spot.zone);
        else if (!this.mapUi.open) this.input.pressAction('map');
      },
    );
    this.servicePanel.onToggle = (open) => {
      if (open) {
        this.inventoryOpenedByService = !this.inventoryPanel.open;
        this.inventoryPanel.toggle(true);
        this.inventoryPanel.setGridClick((i) => this.servicePanel.backpackClick(i));
      } else {
        this.inventoryPanel.setGridClick(null);
        // The backpack the service opened closes with it (the player's own open backpack stays).
        if (this.inventoryOpenedByService && this.inventoryPanel.open) this.inventoryPanel.toggle(false);
        this.inventoryOpenedByService = false;
      }
    };
    // Portrait: the service and its backpack share the screen, so closing the backpack ends the service too.
    panelStack.onChange(() => {
      if (this.servicePanel.open && !this.inventoryPanel.open && uiRoot.classList.contains('touch-ui') && uiRoot.classList.contains('portrait')) {
        this.servicePanel.close();
      }
    });
    this.characterPanel = new CharacterPanel(uiRoot, () => ({
      className: t(`items.classes.${this.world.req(this.player, SkillUser).classId}`),
      progression: this.world.req(this.player, Progression),
      combat: this.world.req(this.player, CombatStats),
      derived: this.world.req(this.player, DerivedStats),
      health: this.world.req(this.player, Health),
      resourceMax: this.world.req(this.player, Resource).max,
      name: this.characterName || undefined,
      classId: this.world.req(this.player, SkillUser).classId,
      resource: (() => {
        const r = this.world.req(this.player, Resource);
        return { kind: r.kind, current: r.current, max: r.max };
      })(),
      gold: this.world.req(this.player, Inventory).gold,
      gearPower: averageItemPower(Object.values(this.world.req(this.player, Inventory).equipped)),
      bag: (() => {
        const grid = this.world.req(this.player, Inventory).grid;
        return { used: grid.filter((i) => i !== null).length, max: grid.length };
      })(),
      portraitUrl: this.renderer.assets.iconUrl(`icon.portrait_${this.world.req(this.player, SkillUser).classId}`, import.meta.env.BASE_URL),
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
          matrixUnlocked: prog.level >= PROGRESSION.maxLevel,
          matrixPoints: this.ctx.endgame?.matrixPoints ?? 0,
          refundCost: refundCost(t3, prog.level),
        };
      },
      {
        learn: (id) => this.learnNode(id),
        reset: () => this.resetSkillTree(),
        refund: (id) => this.refundNode(id),
        assign: (slot, id) => this.assignSlot(slot, id),
        iconUrl: (id) => this.renderer.assets.iconUrl(id, import.meta.env.BASE_URL),
      },
    );
    // The Neural Matrix (endgame) is a second view of the skill panel; its stats join every recompute.
    setExtraEffects(() => matrix.matrixEffects(this.ctx.endgame));
    this.matrixPanel = new MatrixPanel(
      uiRoot,
      () => ({ endgame: matrix.ensureEndgame(this.ctx), gold: this.world.req(this.player, Inventory).gold }),
      {
        allocate: (id) => this.matrixChange(matrix.allocateNode(this.ctx, id)),
        respec: () => this.matrixRespec(),
        attach: (gate, board, rotation) => this.matrixChange(matrix.attachBoard(this.ctx, gate, board, rotation)),
        rotate: (board, rotation) => this.matrixChange(matrix.rotateBoard(this.ctx, board, rotation)),
        detach: (board) => this.matrixChange(matrix.detachBoard(this.ctx, board)),
        socket: (glyph, node) => this.matrixChange({ ok: matrix.socketGlyph(this.ctx, glyph, node) } as { ok: boolean; reason?: string }),
      },
    );
    this.skillTreePanel.setMatrix(this.matrixPanel);
    this.hud.setSkillResolvers(
      (id) => this.world.get(this.player, SkillUser)?.compiled[id]?.def ?? skill(id),
      (id) => this.renderer.assets.iconUrl(skillIconId(id), import.meta.env.BASE_URL),
    );
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
        setNavOverlay: (on) => this.renderer.setNavOverlay(on),
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
      NAV_OVERLAY,
    );
    this.renderer.setNavOverlay(NAV_OVERLAY);
    this.devtools.setMoveMode(this.settings.moveMode);
    this.devtools.setTouchControls(this.settings.touchControls);
    this.refreshHint();
    this.hud.setReduceFlashing(this.settings.reduceFlashing);
    this.mapUi.reduceFlashing = this.settings.reduceFlashing;

    // Settings panel (sound, display, controls) and the registration of every panel with the stack.
    this.settingsPanel = new SettingsPanel(uiRoot, {
      settings: () => this.settings,
      apply: (patch) => this.applySettings(patch),
      soundUi: this.soundUi,
      toggleMute: () => this.toggleMute(),
    });
    this.soundUi.openSettings = () => this.settingsPanel.toggle('sound');
    this.pauseMenu = new PauseMenu(uiRoot, {
      exportSave: () => this.exportSave(),
      toCharacterSelect: () => {
        // The save is written; a reload brings the character select screen back with a clean world.
        this.autosave();
        location.reload();
      },
      canOpen: () => this.playing,
    });
    registerGamePanels(uiRoot, {
      pause: this.pauseMenu,
      inventory: this.inventoryPanel,
      character: this.characterPanel,
      skills: this.skillTreePanel,
      map: this.mapUi,
      quests: this.questLog,
      settings: this.settingsPanel,
      service: this.servicePanel,
      tier: this.tierPanel,
      rift: this.riftPanel,
      lore: this.loreReader,
      closeDialogue: () => this.closeDialogue(),
    });
    uiRoot.style.setProperty('--paused-label', JSON.stringify(t('panels.paused')));
    this.coach = new CoachMarks(uiRoot, { toast: (m) => this.toasts.show(m) });
    this.feelUi = new FeelUi(uiRoot, this.fade);

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

  /**
   * Boot loading. Models and ground textures now load per zone (`prepareZone`, `settleAssets`), so the character
   * select appears at once; `?preload=all` keeps the old everything-up-front behaviour (debugging, offline play).
   */
  async loadAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (new URLSearchParams(location.search).get('preload') !== 'all') return;
    await Promise.all([
      this.renderer.assets.preload(import.meta.env.BASE_URL, onProgress),
      this.renderer.preloadGround(ZONES.map((z) => z.ground)),
    ]);
  }

  /** Class and zone a saved character starts in, so main.ts can fetch their models before the game starts. */
  slotStart(slot: number): { classId: string; zoneId: string } | null {
    try {
      const data = this.saves.read(slotKey(slot));
      return data ? { classId: data.character.classId, zoneId: hasZone(data.world.zone) ? data.world.zone : START_ZONE.id } : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch what a zone (and the class playing in it) shows from the start: models and ground textures.
   * Never rejects; whatever is missing falls back to placeholders that swap in when they load.
   */
  async prepareZone(zoneId: string, classId?: string, onProgress?: (done: number, total: number) => void): Promise<void> {
    const def = hasZone(zoneId) ? zoneDef(zoneId) : START_ZONE;
    const ids = [...(classId ? classAssetIds(classId) : []), ...zoneAssetIds(def)];
    await Promise.all([this.renderer.assets.ensure(ids, onProgress), this.renderer.preloadGround([def.ground])]).catch(() => undefined);
    const own = classId ? classDef(classId).assetId : null;
    if (own && !this.renderer.assets.hasModel(own)) this.toasts.show(t('game.modelFailed'), 'error', 12000);
  }

  /**
   * Load models for what really spawned (set pieces, quest NPCs, bosses: everything the data sets don't
   * name), then quietly prefetch the zone's dungeons so entering one doesn't show placeholders.
   */
  async settleAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
    const ids = new Set<string>();
    for (const e of this.world.query(Renderable)) ids.add(this.world.req(e, Renderable).assetId);
    await this.renderer.assets.ensure(ids, onProgress).catch(() => undefined);
    void this.renderer.assets.ensure(zoneInstanceAssetIds(this.zoneDef));
  }

  start(): void {
    this.playing = true;
    // The player chose a character after the recovery notice: the rebuilt account may be saved now.
    if (this.ctx.account) acknowledgeAccountRecovery(this.ctx.account);
    this.loop.start();
    window.addEventListener('beforeunload', () => this.autosave());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
    });
  }

  // ---- Characters -------------------------------------------------------------

  /** What is in each character slot, for the select screen. */
  characterSlots(): { index: number; character: { name: string; classId: string; level: number; savedAt: string; zoneKey?: string; gear?: number } | null; corrupt?: boolean; newer?: boolean }[] {
    return Array.from({ length: CHARACTER_SLOTS }, (_, index) => {
      try {
        const data = this.saves.read(slotKey(index));
        if (!data) return { index, character: null };
        return {
          index,
          character: {
            name: data.character.name,
            classId: data.character.classId,
            level: data.progression.level,
            savedAt: data.savedAt,
            zoneKey: hasZone(data.world.zone) ? zoneDef(data.world.zone).key : undefined,
            gear: meanItemPower(Object.values(data.inventory?.equipped ?? {}).filter((i): i is NonNullable<typeof i> => !!i)),
          },
        };
      } catch (err) {
        return { index, character: null, corrupt: true, ...(err instanceof NewerSaveError ? { newer: true } : {}) };
      }
    });
  }

  /** Start a brand-new character in a slot (overwrites a corrupt slot). */
  newCharacter(slot: number, classId: string, name: string): void {
    this.respawnAs(classId);
    this.resetWorld();
    // A new character starts with empty endgame state (recipes, materials), not the last one's.
    this.ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
    setQuestState(this.ctx.quests!, { active: {}, done: {}, tracked: null });
    this.enterZone(START_ZONE.id, START_ZONE.playerSpawn.x, START_ZONE.playerSpawn.z);
    // A slot that failed to parse (damaged, or from a newer build) is copied aside before it is overwritten.
    this.saves.quarantineIfUnreadable(slotKey(slot));
    this.autosaveSuppressed = false;
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
    this.saves.quarantineIfUnreadable(slotKey(slot));
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
    if (this.builtZone !== id) {
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
      const a = this.ctx.rng.range(0, Math.PI * 2);
      const tr = this.world.req(m, Transform);
      // (A hovering guardian light keeps its height.)
      Object.assign(tr, makeTransform(x + Math.sin(a) * 2, tr.y, z + Math.cos(a) * 2, 0));
    }
    this.closeDialogue();
    this.servicePanel.close();
    this.tierPanel.close();
    this.lastTarget = null;
    // Arriving in another region: its painting and name sweep in, once the zone is drawing.
    if (old?.def.id !== id) {
      const slug = id.replace(/^zone\./, '');
      const card = artUrl(`regions/${slug}`);
      if (card) this.pendingCard = { image: card, name: t(`zones.${def.key}.name`), sub: t('hud.regionNumber', { n: def.region }), frames: 4 };
    }
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
    const beacon = TIER_BEACONS[zone.def.id];
    const obelisk = riftObeliskAt(zone.def.id);
    spawnInteractables(this.world, zone, [...(stash ? [{ poi: 'stash', kind: 'stash' as const, ...stash }] : []), ...(beacon ? [{ poi: 'tierBeacon', kind: 'beacon' as const, ...beacon }] : []), ...(obelisk ? [{ poi: 'riftObelisk', kind: 'riftObelisk' as const, ...obelisk }] : [])]);
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
    if (!target || this.fading) return;
    this.fadeTo(() => {
      this.enterZone(gate.to.zone, target.arrive.x, target.arrive.z);
      this.hud.showBanner(t(`zones.${this.zoneDef.key}.name`), 2.6);
      this.autosave();
    }, { name: t(`zones.${zoneDef(gate.to.zone).key}.name`), tip: true, prepare: this.prepareZone(gate.to.zone) });
  }

  private fading = false;

  /**
   * Black fade around a zone change (the swap happens while the screen is dark). The screen stays black until two
   * frames of the new place have been drawn and for at least `minBlack` seconds, so the card (where, and a tip) can be
   * read and a slow swap never shows a half-built frame (F013).
   */
  private fadeTo(swap: () => void, opts: { name?: string; tip?: boolean; minBlack?: number; prepare?: Promise<unknown> } = {}): void {
    if (this.fading) return;
    this.fading = true;
    const started = performance.now();
    this.feelUi.setCard(opts.name ?? '', opts.tip ?? false);
    this.fade.classList.add('on');
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const swapAndShow = () => {
      try {
        swap();
      } finally {
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          this.fade.classList.remove('on');
          this.fading = false;
        };
        const hold = blackHoldMs(performance.now() - started, (opts.minBlack ?? 0.9) * 1000);
        // Models the new place spawned that nobody prefetched load while the screen is still black (capped).
        const settled = Promise.race([this.settleAssets().catch(() => undefined), wait(ASSET_WAIT_MS)]);
        // Two frames of the new place, then whatever is left of the minimum; a timer stands in if frames are not coming.
        void settled.then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(release, blackHoldMs(performance.now() - started, (opts.minBlack ?? 0.9) * 1000)))));
        setTimeout(release, hold + 1500 + ASSET_WAIT_MS);
      }
    };
    setTimeout(() => {
      // The other zone's models and ground load during the fade; the swap waits for them (capped).
      if (opts.prepare) void Promise.race([opts.prepare.catch(() => undefined), wait(ASSET_WAIT_MS)]).then(swapAndShow);
      else swapAndShow();
    }, ZONE_FADE * 1000);
  }

  /** Last-chance save for the crash and context-loss handlers (src/bootGuard.ts). */
  saveNow(): void {
    this.autosave();
  }

  private autosave(): void {
    const account = this.ctx.account ? saveAccount(this.storage, this.ctx.account) : ({ ok: true } as const);
    if (this.slot === null || this.autosaveSuppressed || this.world.has(this.player, Dead)) return;
    let result: SaveWriteResult;
    try {
      const written = this.saves.write(slotKey(this.slot), this.snapshot());
      result = written.ok ? account : written;
    } catch {
      result = { ok: false, reason: 'unknown' };
    }
    if (result.ok) {
      if (this.autosaveFailures > 0) this.toasts.show(t('save.autosaveRecovered'));
      this.autosaveFailures = 0;
      return;
    }
    // Autosave is the only save most players trigger: say so, once, then again every few failed tries.
    if (this.autosaveFailures % 5 === 0) this.toasts.show(t(`save.autosaveFailed.${result.reason}`), 'error', 30000);
    this.autosaveFailures += 1;
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
    if (input.wasPressed('respawn') && this.world.has(this.player, Dead) && !this.hud.respawnLocked) this.respawn();
    if (input.wasPressed('inventory')) this.inventoryPanel.toggle();
    if (input.wasPressed('character')) this.characterPanel.toggle();
    if (input.wasPressed('skills')) this.skillTreePanel.toggle();
    if (input.wasPressed('map')) this.mapUi.toggle();
    if (input.wasPressed('quests')) this.questLog.toggle();
    if (input.wasPressed('toggleMute')) this.toggleMute();
    if (this.loreReader.open && (input.wasPressed('pickup') || input.wasPressed('map'))) this.loreReader.close();
    // A menu is open and nothing threatens the player: the world waits (settings: pause in menus).
    if (this.menuPaused()) {
      input.endTick();
      return;
    }

    // World Tiers: the play time clock, and the enemy scaling every new spawn picks up.
    tickPlaytime(this.ctx, dt);
    setEnemyScaling(tierMods(this.ctx));
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
    // A short slow-motion beat (big kills, the hero's death); a freeze takes precedence and the beat resumes after it.
    if (this.slowmoLeft > 0) {
      this.slowmoLeft -= frameDt;
      if (this.loop.timeScale !== 0) this.loop.timeScale = this.slowmoLeft > 0 ? this.slowmoScale : 1;
    }
    this.renderer.animationTimeScale = this.loop.timeScale;

    const zoom = this.input.consumeWheel();
    if (zoom !== 0) this.renderer.rig.zoom(zoom);

    this.updateStormLook();
    this.updateMemoryLook();
    if (this.ctx.instance?.extra.drained) this.renderer.updateInstanceWater(this.ctx.instance.extra.drained);
    if (this.zone) {
      const zone = this.zone;
      this.renderer.updateCooled(zone.cooled, this.ctx.time);
      this.renderer.updateCore(this.ctx.time);
      if (zone.def.dark) {
        // Floodlights switched on and burning flares light the dark.
        // Only rebuilt when a floodlight is found or a flare lands or burns out (expired flares are dropped each tick).
        const st = undergroundState(zone);
        const lightKey = `${zone.def.id}:${zone.found.size}:${st.flares.length}:${st.flares[st.flares.length - 1]?.until ?? 0}`;
        if (lightKey !== this.dynamicLightKey) {
          this.dynamicLightKey = lightKey;
          this.renderer.setDynamicLights([
            ...litFloodlights(zone).map((f) => ({ x: f.x, z: f.z, color: '#ffe2b0', intensity: 140, distance: f.radius * 1.5, height: 6 })),
            ...st.flares.filter((f) => f.until > this.ctx.time).map((f) => ({ x: f.x, z: f.z, color: '#ff6a4a', intensity: 90, distance: UNDERGROUND.flare.radius * 1.6, height: 1.2 })),
          ]);
        }
      }
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
    this.renderer.updateMinds(this.world, this.ctx.nav, this.ctx.time);
    this.renderer.sync(this.world, alpha, frameDt);
    const tr = this.playerTransform;
    const px = tr.prevX + (tr.x - tr.prevX) * alpha;
    const pz = tr.prevZ + (tr.z - tr.prevZ) * alpha;
    this.renderer.render(frameDt, px, 0, pz, this.zone ? lumenCameraFocus(this.world, this.zone, px, pz) : undefined);
    audio.setListener(px, pz, this.ctx.cameraYaw);
    this.updateAudio(px, pz, frameDt);
    this.damageNumbers.update(frameDt, (x, y, z, out) => this.renderer.toScreen(x, y, z, out));
    this.updateEnemyBars(frameDt, px, pz);
    this.lootLabels.update(this.world, px, pz, this.input.isDown('showLabels'), (x, y, z, out) =>
      this.renderer.toScreen(x, y, z, out),
    );
    if (this.characterPanel.open && Math.floor(this.realTime * 4) !== Math.floor((this.realTime - frameDt) * 4)) {
      this.characterPanel.refresh();
    }
    this.announceBosses();
    if (this.tierPanel.open && Math.floor(this.realTime * 2) !== Math.floor((this.realTime - frameDt) * 2)) this.tierPanel.refresh();
    if (this.pendingCard && --this.pendingCard.frames <= 0) {
      this.hud.regionCard(this.pendingCard.image, this.pendingCard.name, this.pendingCard.sub);
      this.pendingCard = null;
    }
    const hudState = this.hudState();
    this.hud.update(hudState, frameDt);
    this.touchControls.sync(hudState.combat ?? false, hudState.xp.skillPoints);
    this.touchControls.setUnassigned(hudState.unassignedSkills ?? 0);
    this.worldBossHud.update(this.ctx);
    this.riftHudUi.update(this.ctx.instance?.rift ? riftHud(this.ctx.instance.rift) : null);
    this.endgameChip.update(frameDt);
    this.updateBossArrow();
    this.questTracker.tick(frameDt, hudState.combat ?? false);
    this.frameQuestMarkers = questMarkers(this.world, this.ctx);
    this.mapUi.markers = this.ctx.instance
      ? this.instanceMarkers()
      : this.frameQuestMarkers.map((m) => ({ x: m.x, z: m.z, color: m.main ? '#ffd23a' : '#e8e0d0' }));
    const worldBoss = worldBossMarker(this.ctx);
    if (worldBoss) this.mapUi.markers.push({ ...worldBoss, shape: 'diamond' });
    const harvest = harvestView(this.ctx);
    this.mapUi.harvest = harvest;
    this.harvestHud.update(harvest, this.ctx.endgame?.ashShards ?? 0, frameDt);
    this.mapUi.update(frameDt);
    this.updateInteractPrompt(px, pz);
    this.updateQuestUi(px, pz);
    this.updateFeelFrame(px, pz, frameDt, hudState);

    this.devtools.frame(frameDt, () => ({
      entities: this.world.entityCount,
      ...this.renderer.stats,
      position: { x: tr.x, z: tr.z },
      seed: this.ctx.rng.seed,
      tick: this.ctx.tick,
      enemies: this.world.query(EnemyAI).filter((e) => !this.world.has(e, Dead)).length,
      wave: this.encounter?.wave ?? 0,
      kills: this.ctx.stats.kills,
      assetsFailed: this.renderer.assets.failed.length,
    }));
  }

  /**
   * Extra freeze and shake on top of what skills ask for (F001, F009): a hit taken, a crit, a kill, an elite or boss
   * kill with a slow-motion beat, and the slow fall of the hero's death (F014). Shake and slow motion follow the
   * screen-shake setting (they are camera motion); the freeze is a few milliseconds and always plays.
   */
  private applyFeel(events: GameEvent[]): void {
    const w = this.world;
    const max = w.get(this.player, Health)?.max ?? 0;
    const feel = frameFeel(events, max, (e) => (w.has(e, Boss) ? 'boss' : w.has(e, Elite) ? 'elite' : null));
    if (feel.hitstopMs > 0) {
      this.hitstop = Math.max(this.hitstop, feel.hitstopMs / 1000);
      this.loop.timeScale = 0;
    }
    if (!this.renderer.screenShake) return;
    if (feel.trauma > 0) this.renderer.rig.addTrauma(feel.trauma);
    if (feel.slowmoS > 0) {
      this.slowmoLeft = Math.max(this.slowmoLeft, feel.slowmoS);
      this.slowmoScale = FEEL.slowmoScale;
    }
    if (events.some((e) => e.type === 'death' && e.isPlayer)) {
      this.slowmoLeft = 0.9;
      this.slowmoScale = 0.3;
    }
  }

  /** Tactile cues for the big moments (src/ui/haptics.ts): a heavy hit taken, death, a legendary drop. */
  private hapticFor(event: GameEvent): void {
    if (event.type === 'damage' && event.toPlayer && !event.dot) {
      const max = this.world.get(this.player, Health)?.max ?? 0;
      if (max > 0 && event.amount > max * 0.1) haptic('bigHit');
    } else if (event.type === 'death' && event.isPlayer) haptic('death');
    else if (event.type === 'loot' && (event.rarity === 'legendary' || event.rarity === 'unique' || event.rarity === 'mythic')) haptic('legendary');
  }

  private handleEvents(events: GameEvent[]): void {
    this.renderer.handleEvents(events);
    this.applyFeel(events);
    // Sounds are chosen for the whole frame at once (a kill plays its death sound only; Lightbearer's blows ring).
    for (const cue of soundsForEvents(events)) audio.play(cue.id, cue.x !== undefined && cue.z !== undefined ? { x: cue.x, z: cue.z } : {});
    for (const event of events) {
      this.damageNumbers.handle(event);
      this.enemyBars.handle(event);
      this.hapticFor(event);
      this.coach.signalEvent(event);
      switch (event.type) {
        case 'hitstop':
          this.hitstop = Math.max(this.hitstop, event.ms / 1000);
          this.loop.timeScale = 0;
          break;
        case 'damage':
          if (!event.toPlayer && this.world.has(event.target, EnemyAI)) {
            // On a phone there is no cursor to re-aim with: the frame stays longer (and while it is near, see hudState).
            this.lastTarget = { entity: event.target, until: this.realTime + (this.touchControls.shown ? TARGET_MEMORY_TOUCH : TARGET_MEMORY) };
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
          // The best drops land with a short freeze.
          if (dropHitstopMs(event.rarity) > 0) {
            this.hitstop = Math.max(this.hitstop, dropHitstopMs(event.rarity) / 1000);
            this.loop.timeScale = 0;
          }
          if (rarityRank(event.rarity) >= rarityRank('legendary')) this.mapUi.addPip(event.x, event.z, 5000);
          break;
        case 'pickup':
          if (event.kind === 'gold') playGoldSound();
          else {
            playPickupSound();
            this.touchControls.setDot('inventory', true);
          }
          this.inventoryPanel.refresh();
          break;
        case 'levelUp':
          this.music.sting();
          this.vendorRestockAt = -Infinity;
          this.hud.levelUp(this.world.req(this.player, Progression).skillPoints, t('ui.levelUp', { level: event.level }), t('hud.levelUpSub'), () => this.input.pressAction('skills'));
          this.toasts.show(t('ui.skillPoint'));
          this.characterPanel.refresh();
          this.skillTreePanel.refresh();
          this.autosave();
          break;
        case 'overheat':
          this.notice('combat.overheat', 'error', false);
          break;
        case 'notice':
          // Desktop: a refused press for lack of resource shakes the slots and flashes the orb instead of a toast (A004).
          if (event.key === 'combat.notEnoughResource' && this.hud.denyResource()) {
            if (this.realTime - (this.lastNotice.get(event.key) ?? -Infinity) >= 1.5) {
              this.lastNotice.set(event.key, this.realTime);
              audio.play('ui.error');
            }
            break;
          }
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
        case 'beat':
          this.lumenBeat();
          break;
        case 'epilogue':
          this.showEnding(event.choice);
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

  private questLogEntries(): { active: QuestLogEntry[]; done: QuestLogDone[] } {
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
          rewards: t('questUi.rewards', { xp: Math.round(def.rewards.xp * tierMods(this.ctx).xp), gold: def.rewards.gold }),
          tracked: rt.tracked === id,
        };
      }),
      done: [...rt.done.keys()].map((id) => {
        const def = questDef(id);
        return {
          id,
          title: t(`quests.${id}.title`),
          summary: t(`quests.${id}.summary`),
          rewards: t('questUi.rewards', { xp: Math.round(def.rewards.xp * tierMods(this.ctx).xp), gold: def.rewards.gold }),
        };
      }),
    };
  }

  /**
   * Life bars over hurt enemies, plates (name, affix chips, bar) over elites, and the minimap's hostile blips
   * (src/ui/enemyBars.ts): one pass over the enemies near the player.
   */
  private updateEnemyBars(dt: number, px: number, pz: number): void {
    const infos = this.enemyInfos;
    infos.length = 0;
    const blips = this.blipBuf;
    blips.length = 0;
    const exposure = this.zone?.storm.exposure ?? 0;
    for (const e of this.world.query(EnemyAI, Health, Transform)) {
      if (this.world.has(e, Dead)) continue;
      const hp = this.world.req(e, Health);
      if (hp.current <= 0) continue;
      const tr = this.world.req(e, Transform);
      const dist = Math.hypot(tr.x - px, tr.z - pz);
      if (dist > 45) continue;
      const elite = this.world.get(e, Elite);
      const boss = this.world.has(e, Boss);
      blips.push({ x: tr.x, z: tr.z, kind: boss ? 'boss' : elite ? (elite.kind === 'champion' ? 'champion' : 'rare') : 'normal' });
      if (dist > ELITE_RANGE) continue;
      const scale = this.world.get(e, Renderable)?.scale ?? 1;
      const info: EnemyBarInfo = {
        id: e,
        x: tr.x,
        y: tr.y + (elite ? 2.6 : 2.1) * scale,
        z: tr.z,
        dist,
        frac: hp.max > 0 ? hp.current / hp.max : 1,
        tier: boss ? 'boss' : (elite?.kind ?? 'normal'),
        targeted: e === this.hudTarget,
      };
      if (elite) {
        // Ash Storms hide name plates until enemies are close; the target frame already names the phone's target.
        if (dist > ELITE_RANGE - 18 * exposure || (e === this.hudTarget && this.hud.portrait)) continue;
        const dn = this.world.get(e, DisplayName);
        const ai = this.world.get(e, EnemyAI);
        info.name = dn ? (dn.literal ? dn.key : t(dn.key)) : `${t('elites.champion')} ${t(`enemies.${ai?.defId ?? ''}`)}`;
        info.color = ELITE_COLORS[elite.kind];
        info.affixes = elite.affixes.map((a) => ({ id: a, name: t(`elites.affixes.${a}`) }));
      }
      infos.push(info);
    }
    this.mapUi.blips = blips;
    this.enemyBars.update(dt, infos, (x, y, z, out) => this.renderer.toScreen(x, y, z, out));
  }

  private inCombat = false;
  private crowdAt = 0;

  /**
   * Per-frame feel: camera look-ahead toward the cursor in a fight and a pull-back in a crowd (F018), the colour drain
   * of death (F014), the tips watching the HUD (F006) and the golden guide to the first objective (F007).
   */
  private updateFeelFrame(px: number, pz: number, _dt: number, hud: HudState): void {
    this.inCombat = hud.combat ?? false;
    this.coach.observe(hud);
    this.renderer.setDeathLook(hud.dead);
    const rig = this.renderer.rig;
    const aim = this.inCombat && !hud.dead && !this.touchControls.shown ? this.ctx.pickGround() : null;
    const ahead = aim ? lookAheadOffset(aim.x - px, aim.z - pz) : { x: 0, z: 0 };
    rig.setLookAhead(ahead.x, ahead.z);
    if (this.realTime >= this.crowdAt) {
      this.crowdAt = this.realTime + 0.3;
      let near = 0;
      for (const e of this.world.query(EnemyAI, Transform)) {
        if (this.world.has(e, Dead)) continue;
        const tr = this.world.req(e, Transform);
        if (Math.abs(tr.x - px) < CROWD_RANGE && Math.abs(tr.z - pz) < CROWD_RANGE && Math.hypot(tr.x - px, tr.z - pz) < CROWD_RANGE) near++;
      }
      rig.setCrowd(near);
    }
    // The golden trail: only for the first main quest, and only once the tip banner has been shown.
    const goal = hud.dead ? null : guideGoal(this.ctx.quests?.tracked ?? null, this.frameQuestMarkers, px, pz);
    if (goal && this.feelUi.takeGuideBanner()) this.hud.showBanner(t('feel.guideBanner'), 3);
    this.renderer.setGuide(goal, px, pz);
  }

  private updateQuestUi(px: number, pz: number): void {
    const rt = this.ctx.quests;
    if (!rt) return;
    // Distance and direction to the tracked quest's nearest marker (H056): the arrow points the way on screen.
    let where: { dist: number; angle: number } | null = null;
    if (rt.tracked) {
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const m of this.frameQuestMarkers) {
        if (m.quest !== rt.tracked) continue;
        const d = Math.hypot(m.x - px, m.z - pz);
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      const a = { x: 0, y: 0 };
      const b = { x: 0, y: 0 };
      if (best && this.renderer.toScreen(px, 0, pz, a) && this.renderer.toScreen(best.x, 0, best.z, b)) {
        where = { dist: bestD, angle: (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI };
      }
    }
    const tracked: TrackedQuest[] = this.orderedQuests().map((id) => ({
      id,
      title: t(`quests.${id}.title`),
      step: this.stepText(id),
      kind: questDef(id).kind,
      tracked: rt.tracked === id,
      ...(rt.tracked === id && where ? where : {}),
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
    // Leaving the hub closes its services.
    if (this.servicePanel.open && !this.zone?.inHub) this.servicePanel.close();
    if (this.tierPanel.open && !this.zone?.inHub) this.tierPanel.close();
    if (this.riftPanel.current === 'select' && !this.zone?.inHub) this.riftPanel.close();
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

  /** Touch: tapping an NPC's name plate walks there and talks (like clicking the NPC with a mouse). */
  private walkToNpc(id: string): void {
    if (this.world.has(this.player, Dead)) return;
    const npc = this.world.query(Npc, Transform).find((e) => this.world.req(e, Npc).id === id);
    if (npc === undefined) return;
    this.world.remove(this.player, MoveTarget);
    this.world.remove(this.player, AttackTarget);
    this.world.remove(this.player, InteractTarget);
    this.world.remove(this.player, PickupTarget);
    const tr = this.world.req(npc, Transform);
    this.world.add(this.player, InteractTarget, { target: npc });
    this.world.add(this.player, MoveTarget, { x: tr.x, z: tr.z });
    haptic('tap');
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
    return this.page(npc, t(greetingKey(rt, npc)), buttons);
  }

  private questOffer(npc: string, id: string): void {
    const def = questDef(id);
    // The offer shows as a card (title, level, reward chips); Accept is the filled button and comes last.
    const page = this.page(npc, t(`quests.${id}.offer`), [
      { label: t('questUi.decline'), onClick: () => this.dialogue.show(this.npcRoot(npc)) },
      {
        label: t('questUi.accept'),
        primary: true,
        onClick: () => {
          startQuest(this.world, this.ctx, id);
          this.world.flushDestroyed();
          this.dialogue.show(this.npcRoot(npc));
        },
      },
    ]);
    page.offer = { title: t(`quests.${id}.title`), level: def.level, xp: Math.round(def.rewards.xp * tierMods(this.ctx).xp), gold: def.rewards.gold };
    this.dialogue.show(page);
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
    this.vendorStock = rollVendorStock(this.ctx.loot.rng, level, user.classId, () => nextItemUid(this.ctx), (id) => t(`items.bases.${id}`), tierMods(this.ctx), this.ctx.zone?.def.key);
    this.vendorRestockAt = this.ctx.time + VENDOR.refreshSeconds;
    this.vendorBuyback = [];
  }

  private serviceResult(r: { ok: true } | { ok: false; reason: string }): void {
    if (!r.ok) this.notice(`services.cannot.${r.reason}`, 'error');
    else playPickupSound();
    this.afterInventoryChange();
    this.servicePanel.refresh();
  }

  private onQuestEvent(id: string, state: 'started' | 'progress' | 'step' | 'completed' | 'failed'): void {
    const title = t(`quests.${id}.title`);
    this.touchControls.setDot('quests', true);
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
        this.music.sting();
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

  /** Lumen's phase 2: the arena wears the memory that is playing. */
  private updateMemoryLook(): void {
    if (!this.zone || this.ctx.instance) return;
    this.renderer.setMemoryLook(activeMemory(this.world)?.look ?? null);
    // A closed choice dialogue comes back while Lumen still waits for an answer.
    if (!this.dialogue.open && !this.epilogue.open && this.world.query(Boss).some((b) => inBeat(this.world, b))) this.lumenBeat();
  }

  /** Phase 3: Lumen, in a friend's shape, asks you to listen. Both answers go on to the last phase. */
  private lumenBeat(): void {
    const zone = this.zone;
    if (!zone || this.world.has(this.player, Dead)) return;
    const speaker = t('npcs.okafor.name');
    const role = t('bosses.lumen.role');
    const answer = (choice: LumenChoice) => {
      if (!chooseLumen(this.world, zone, choice)) return this.closeDialogue();
      this.dialogue.show({ speaker, role, text: t(`bosses.lumen.reply.${choice}`), buttons: [{ label: t('questUi.continue'), onClick: () => this.closeDialogue() }] });
      this.autosave();
    };
    this.dialogue.show({
      speaker,
      role,
      text: t('bosses.lumen.speech'),
      buttons: [
        { label: t('bosses.lumen.choice.listen'), onClick: () => answer('listen') },
        { label: t('bosses.lumen.choice.fight'), onClick: () => answer('fight') },
      ],
    });
  }

  /** The end: the epilogue card for the choice made, the credits, then back to the Last Camp. */
  private showEnding(choice: LumenChoice | null): void {
    this.closeDialogue();
    this.world.add(this.player, Invulnerable, { remaining: 600 });
    const keys = epilogueKeys(choice);
    this.epilogue.show({ title: t(keys.title), text: t(keys.text) }, { title: t('ending.credits.title'), lines: CREDIT_KEYS.map((k) => t(k)) }, () => {
      this.world.remove(this.player, Invulnerable);
      const camp = this.zoneDef.teleporters.find((tp) => tp.id === 'tp.camp');
      if (camp && !this.ctx.instance) this.placePlayer(camp.x + 2, camp.z + 2);
      this.autosave();
    });
  }

  private updateInteractPrompt(px: number, pz: number): void {
    const near = this.world.has(this.player, Dead) ? null : nearestInteractable(this.world, px, pz, this.ctx.time);
    // The Endless Shaft's way down is a portal that goes the other way.
    const target = near !== null ? { ...this.world.req(near, Transform), kind: this.world.req(near, Interactable).poi === 'deeper' ? 'deeper' : this.world.req(near, Interactable).kind } : null;
    // A prompt that cannot be used right now says why instead of the action (A041).
    const blocked =
      target?.kind === 'lockedChest' && (this.ctx.zone?.keycards.size ?? 0) === 0 ? t('interact.blocked.keycard') : target?.kind === 'riftObelisk' && !riftsUnlocked(this.ctx) ? t('interact.blocked.dormant') : null;
    this.interactPrompt.update(target, this.touchControls.shown ? t('touch.use') : keyLabel(resolveKeybindings(this.settings).pickup[0] ?? 'KeyE'), (x, y, z, out) =>
      this.renderer.toScreen(x, y, z, out),
      blocked,
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
      case 'codex':
        if (detail && id) this.toasts.show(t('crafting.codex.unlocked', { aspect: t(`aspects.${detail}.name`), dungeon: t(`instances.names.${id}`) }));
        saveAccount(this.storage, this.ctx.account!);
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
      case 'beacon':
        this.closeDialogue();
        this.servicePanel.close();
        this.tierPanel.show();
        break;
      case 'riftObelisk':
        this.closeDialogue();
        this.servicePanel.close();
        this.tierPanel.close();
        this.riftPanel.showSelect();
        break;
      case 'riftCleared':
        // The guardian fell in time: the account and tiers changed, the glyph attempts wait in the panel.
        recomputePlayer(this.world, this.player);
        saveAccount(this.storage, this.ctx.account!);
        this.autosave();
        this.riftPanel.showResult();
        break;
      case 'riftCache':
        if (detail) {
          const [shards, recipe, legendaries] = detail.split('|');
          this.toasts.show(t('rifts.cache', { legendaries: legendaries ?? 0, shards: shards ?? 0 }));
          if (recipe) this.toasts.show(t('rifts.recipe', { name: t(`endgame.recipes.${recipe}.name`) }));
        }
        this.autosave();
        break;
      case 'riftAbandon':
        this.notice('rifts.abandonWarn', 'info');
        break;
      case 'riftExit':
        // Out of time: the rift throws you out.
        this.riftPanel.close();
        this.exitInstance();
        this.toasts.show(t('rifts.collapsed'));
        break;
      case 'tierUnlock':
        saveAccount(this.storage, this.ctx.account!);
        this.toasts.show(t('worldTiers.unlockedToast'), 'info', 7000);
        this.toasts.show(t('worldTiers.unlockedIntro', { minutes: WORLD_BOSS.interval / 60 }), 'info', 12000);
        break;
      case 'feature':
        if (detail) this.hud.showBanner(t(`features.${detail}.used`), 2);
        break;
      case 'harvestCache': {
        const [dust, recipe] = (detail ?? '').split(',');
        this.toasts.show(t('harvest.cacheOpened', { dust: dust ?? 0 }));
        if (recipe) this.toasts.show(t('harvest.cacheRecipe'));
        this.autosave();
        break;
      }
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
        // The Endless Shaft's way down: the next floor is already built, only the camera has to follow.
        if (id === 'deeper' && this.ctx.instance) this.placePlayer(this.ctx.instance.start.x, this.ctx.instance.start.z);
        else this.exitInstance();
        break;
      default:
        break;
    }
  }

  /** Toast with a per-key cooldown so spammed buttons don't flood the screen. */
  /** A toast; errors also play the interface error sound unless the event already has its own. */
  private notice(key: string, kind: 'info' | 'error', sound = true): void {
    const last = this.lastNotice.get(key) ?? -Infinity;
    if (this.realTime - last < 1.5) return;
    this.lastNotice.set(key, this.realTime);
    this.toasts.show(t(key), kind);
    if (kind === 'error' && sound) audio.play('ui.error');
  }

  // ---- Sound ---------------------------------------------------------------------

  toggleMute(): void {
    audio.setMuted(!this.settings.audio.muted);
    saveSettings(this.storage, this.settings);
    this.soundUi.refresh();
    // The toast stays readable even though the sound is off.
    this.toasts.show(t(this.settings.audio.muted ? 'sound.off' : 'sound.on'));
  }

  /** What the music controller needs to know about the game right now. */
  private audioScene(): AudioScene {
    if (!this.playing) return MENU_SCENE;
    const zone = this.zone;
    const inInstance = !!this.ctx.instance;
    let bossEngaged = false;
    for (const b of this.world.query(Boss)) {
      if (this.world.req(b, Boss).engaged && !this.world.has(b, Dead)) {
        bossEngaged = true;
        break;
      }
    }
    return {
      phase: 'play',
      zoneId: zone?.def.id ?? '',
      inHub: !inInstance && !!zone?.inHub,
      bossEngaged,
      playerDead: this.world.has(this.player, Dead),
      storm: inInstance ? 0 : (zone?.storm.exposure ?? 0),
      ...this.threatInputs(),
    };
  }

  /** For the combat layer: enemies hunting the player within earshot, and the player's life. */
  private threatInputs(): Pick<AudioScene, 'aggroCount' | 'healthFraction'> {
    const health = this.world.get(this.player, Health);
    const healthFraction = health && health.max > 0 ? health.current / health.max : 1;
    const tr = this.playerTransform;
    let aggroCount = 0;
    for (const e of this.world.query(EnemyAI, Transform)) {
      if (!this.world.req(e, EnemyAI).aggro || this.world.has(e, Dead)) continue;
      const et = this.world.req(e, Transform);
      if (Math.hypot(et.x - tr.x, et.z - tr.z) <= THREAT_RANGE) aggroCount++;
    }
    return { aggroCount, healthFraction };
  }

  /** Per frame: music and ambience follow the scene, and the player's footsteps keep time. */
  private updateAudio(px: number, pz: number, dt: number): void {
    // The Escape menu freezes the world: the music and ambience drop and dull with it (they come back on resume).
    this.music.setPaused(this.pauseMenu.pausing);
    this.music.update(this.audioScene(), dt);
    const moved = dt > 0 ? Math.hypot(px - this.lastFoot.x, pz - this.lastFoot.z) / dt : 0;
    this.lastFoot.x = px;
    this.lastFoot.z = pz;
    const p = this.player;
    const walking = !this.world.has(p, Dead) && !this.world.has(p, Mounted) && !this.world.has(p, ForcedMove) && !this.fading;
    // A jump of many metres in one frame is a teleport or zone change, not a stride.
    if (this.footsteps.update(dt, walking && moved < 25 ? moved : 0)) audio.play('footstep', footstepPlay(surfaceOf(this.zone?.def.id ?? '')));
  }

  /** Audio state for the ?debug API: format, sprite, music, voices and the last sounds played. */
  get audioDebug(): ReturnType<typeof audio.debugState> {
    return audio.debugState();
  }

  private get encounter(): EncounterState | undefined {
    const e = this.world.first(EncounterState);
    return e === undefined ? undefined : this.world.req(e, EncounterState);
  }

  /** Region and subzone (or hub) under the player, for the HUD. */
  private locationLabel(): { title: string; sub: string } {
    const inst = this.ctx.instance;
    if (inst) return { title: t(`instances.names.${inst.def.kind === 'bunker' ? inst.poi.replace(/\./g, '_') : inst.def.id}`), sub: objectiveText(this.world, inst, t) };
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
    if (te === null && this.lastTarget && isAlive(w, this.lastTarget.entity)) {
      const last = this.lastTarget.entity;
      const lt = w.get(last, Transform);
      const pt = this.playerTransform;
      const near = this.touchControls.shown && lt !== undefined && Math.hypot(lt.x - pt.x, lt.z - pt.z) < TARGET_NEAR;
      if (this.realTime < this.lastTarget.until || near) te = last;
    }
    this.hudTarget = te;
    if (te !== null && isAlive(w, te)) {
      const ai = w.req(te, EnemyAI);
      const th = w.req(te, Health);
      const statuses = [...new Set(w.get(te, StatusEffects)?.list.map((s) => s.id) ?? [])];
      const dn = w.get(te, DisplayName);
      const elite = w.get(te, Elite);
      const name = dn ? (dn.literal ? dn.key : t(dn.key)) : t(`enemies.${ai.defId}`);
      const portrait = artUrl(`bosses/${worldBossPortrait(ai.defId) ?? ai.defId}`);
      target = {
        name,
        current: th.current,
        max: th.max,
        statuses,
        ...(portrait ? { portrait } : {}),
        ...bossPhaseTicks(w.get(te, Boss)?.script ?? undefined),
        ...(elite ? { tier: elite.kind, color: ELITE_COLORS[elite.kind], affixes: elite.affixes.map((a) => t(`elites.affixes.${a}`)), affixIds: [...elite.affixes] } : {}),
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
      potion: {
        charges: user.potionCharges,
        max: cls.potion.charges + (w.get(p, AccountBonuses)?.potionCharges ?? 0),
        recharge: user.potionRecharge,
        rechargeMax: cls.potion.recharge,
      },
      combat: enemyNear(w, this.ctx, this.playerTransform.x, this.playerTransform.z, 15) !== null,
      wave: enc && enc.wave > 0 ? { wave: enc.wave, alive: enc.alive, phase: enc.phase, timer: enc.timer } : null,
      ...(this.zone ? { location: this.locationLabel() } : {}),
      // Inside a rift the rift row replaces the tier badge (the tier outside does not apply there).
      ...((this.ctx.account?.endgame.tierUnlocked ?? 1) >= 2 && !this.ctx.instance?.rift ? { tier: tierBadgeText(currentTier(this.ctx)) } : {}),
      ...(() => {
        const tr = this.playerTransform;
        const ev = this.ctx.instance ? null : activeEvent(this.zone, tr.x, tr.z);
        return ev ? { event: { title: t(`worldEvents.${ev.type}.title`), text: t(ev.text, ev.params) } } : {};
      })(),
      target,
      // Everything affecting the player, boons first, above the action bar.
      buffs: playerStatuses(w.get(p, StatusEffects)?.list ?? []),
      exposure: this.ctx.instance ? 0 : sporeExposure(),
      flares: !this.ctx.instance && this.zone?.def.dark ? { charges: undergroundState(this.zone).flareCharges, max: UNDERGROUND.flare.charges, key: keyLabel(resolveKeybindings(this.settings).flare[0] ?? 'F') } : undefined,
      dead: w.has(p, Dead),
      ...(w.has(p, Dead) ? { deathCause: deathCauseLine(health.lastHitSource, this.ctx.time) } : {}),
      xp: (() => {
        const prog = w.req(p, Progression);
        return { level: prog.level, current: prog.xp, next: xpToNext(prog.level), skillPoints: prog.skillPoints };
      })(),
      unassignedSkills: this.offBarSkills(user),
    };
  }

  private offBarCount = 0;
  private offBarAt = -Infinity;
  /** Learned active skills not on the action bar (B036), recounted four times a second (the tree walk is not per-frame work). */
  private offBarSkills(user: SkillUser): number {
    if (this.realTime - this.offBarAt >= 0.25 || this.realTime < this.offBarAt) {
      this.offBarAt = this.realTime;
      this.offBarCount = unassignedSkills(tree(user.classId), user.tree, user.slots).length;
    }
    return this.offBarCount;
  }

  // ---- Player lifecycle -----------------------------------------------------

  /** Rise after dying: a short fade out and in around the move, a rising cue, then 2 s of golden grace (F014). */
  respawn(): void {
    if (!this.world.has(this.player, Dead) || this.fading) return;
    this.fadeTo(
      () => {
        this.doRespawn();
        audio.play('heal');
      },
      { name: t('feel.rose'), minBlack: 0.6 },
    );
  }

  private doRespawn(): void {
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
    // The Endless Shaft ends with your death: you wake outside it.
    // A Deep Rift collapses with it: no upgrades.
    if (this.ctx.instance?.def.floors || this.ctx.instance?.rift) {
      if (this.ctx.instance.rift) this.toasts.show(t('rifts.collapsed'));
      this.riftPanel.close();
      this.exitInstance();
      w.add(p, Invulnerable, { remaining: 2 });
      return;
    }
    // The death toll (G018): a little gold and half the potion charges.
    const lost = applyDeathPenalty(w, p);
    if (lost.gold > 0 || lost.potions > 0) this.toasts.show(t('death.penalty', { gold: lost.gold, potions: lost.potions }));
    // Back at the nearest discovered teleporter (docs/world-and-gameplay.md §13).
    const tr = this.playerTransform;
    // Inside a dungeon you come back at its entrance; bosses reset (docs/world-and-gameplay.md §13).
    setPiecesOnDeath(w, this.zone);
    for (const b of w.query(Boss)) resetBoss(w, b);
    // A conversation held by a boss (Lumen's choice) ends with the fight.
    this.closeDialogue();
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
    // Anything not built yet (the Core's heart is still a marker) says so instead of crashing.
    if (!hasInstance(defId)) return this.notice('interact.notBuilt', 'info');
    const level = monsterLevel(this.world, this.ctx) + (poi.kind === 'dungeon' ? 1 : 0);
    this.startInstance(defId, poiId, Math.min(level, monsterLevelCap(this.ctx) + 1), { x: poi.x + 3, z: poi.z + 3 });
  }

  /** Enter a Deep Rift of this level from the Rift Obelisk (docs/endgame.md). */
  enterRift(level: number): void {
    const zone = this.zone;
    const at = zone ? riftObeliskAt(zone.def.id) : undefined;
    if (!zone || !at || this.ctx.instance || this.fading || this.world.has(this.player, Dead)) return;
    const problem = riftEntryProblem(this.ctx, level);
    if (problem) return this.notice(problem === 'locked' ? 'rifts.locked' : 'rifts.badLevel', 'error');
    this.startInstance(RIFT_ID, 'riftObelisk', RIFT.monsterLevel, { x: at.x + 3, z: at.z + 3 }, level);
  }

  private startInstance(defId: string, poiId: string, level: number, exit: { x: number; z: number }, riftLevel?: number): void {
    const zone = this.zone;
    if (!zone) return;
    // Wake-up packs far away would only sit there: put them back to sleep.
    for (const st of zone.packs.values()) {
      if (st.state !== 'active') continue;
      for (const m of st.members) this.world.destroyDeferred(m);
      st.members = [];
      st.state = 'dormant';
    }
    this.world.flushDestroyed();
    const rt = buildInstance(this.world, this.ctx, defId, poiId, `${this.ctx.rng.seed}-${this.instanceCount++}`, level, exit, riftLevel);
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
      (rt.extra.env ?? []).flatMap((f) => (f.kind === 'water' ? [{ id: f.id, x: f.x, z: f.z, r: f.radius }] : [])),
    );
    this.placePlayer(rt.start.x, rt.start.z);
    this.closeDialogue();
    this.servicePanel.close();
    this.tierPanel.close();
    this.hud.showBanner(this.locationLabel().title, 2.4);
  }

  /** A glyph's display name (Neural Matrix strings), falling back to its id. */
  private glyphName(id: string): string {
    return GLYPH_DEFS.has(id) ? t(`matrix.glyphs.${id}.name`) : id;
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
      if (this.world.has(e, Dead) || this.world.get(e, DisplayName)?.key === 'instances.choirPillar') continue;
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
    }, { name: t(`zones.${def.key}.name`), tip: true, prepare: this.prepareZone(def.id) });
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
  /** A region card waiting for the new zone's first frames (building it can stall the page). */
  private pendingCard: { image: string; name: string; sub: string; frames: number } | null = null;

  /** Bosses already announced with the intro card (once per spawn). */
  private readonly announced = new Set<Entity>();

  /** A boss engaging the player gets its portrait and name swept onto the screen. */
  /** A chevron on the screen edge towards an engaged boss (or the world boss) that is off the visible field (H070). */
  private updateBossArrow(): void {
    let boss: Entity | null = null;
    for (const e of this.world.query(Boss, Transform)) {
      if (this.world.req(e, Boss).engaged && !this.world.has(e, Dead)) {
        boss = e;
        break;
      }
    }
    const wb = worldBossRuntime(this.ctx).entity;
    if (boss === null && wb !== null && this.world.isAlive(wb) && !this.world.has(wb, Dead)) boss = wb;
    const tr = boss !== null ? this.world.get(boss, Transform) : undefined;
    const pt = this.playerTransform;
    const from = { x: 0, y: 0 };
    const to = { x: 0, y: 0 };
    if (!tr || !this.renderer.toScreen(pt.x, pt.y, pt.z, from) || !this.renderer.toScreen(tr.x, tr.y, tr.z, to)) {
      this.bossArrow.update(null);
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Touch: the free band under the hero and above the thumb controls (clear of the top chrome and the left column).
    // Desktop: the whole playfield except the minimap/quest column, the target frame and the action bar (A017).
    this.bossArrow.update(placeEdgeArrow(from, to, { w, h }, edgeInsets(h, this.touchControls.shown)));
  }

  private announceBosses(): void {
    for (const e of this.world.query(Boss, EnemyAI)) {
      if (this.announced.has(e) || !this.world.req(e, Boss).engaged || this.world.has(e, Dead)) continue;
      this.announced.add(e);
      // A soft push-in and cinema bars for 1.2 s; input stays live. Camera motion, so it follows the screen-shake setting (F021).
      if (this.renderer.screenShake) {
        this.renderer.rig.pulseZoom(1.2, 0.82);
        this.feelUi.bossBeat(1.4);
      }
      const ai = this.world.req(e, EnemyAI);
      const portrait = artUrl(`bosses/${worldBossPortrait(ai.defId) ?? ai.defId}`);
      if (!portrait) continue;
      const dn = this.world.get(e, DisplayName);
      const name = dn ? (dn.literal ? dn.key : t(dn.key)) : t(`enemies.${ai.defId}`);
      this.hud.bossIntro(name, portrait, t('hud.bossIntro'));
      haptic('boss');
    }
    for (const e of this.announced) if (!this.world.isAlive(e)) this.announced.delete(e);
  }

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
      endgame: structuredClone(this.ctx.endgame ?? SaveDataSchema.shape.endgame.parse(undefined)),
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
    this.ctx.endgame = structuredClone(data.endgame);
    // A character already at the cap gets the starting board and glyphs (older saves, first load after the update).
    if (this.world.req(this.player, Progression).level >= PROGRESSION.maxLevel) matrix.ensureMatrixStarted(this.ctx);
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

  equipItem(index: number, slot?: Slot): void {
    const user = this.world.req(this.player, SkillUser);
    const r = equipFromGrid(this.world.req(this.player, Inventory), index, user.classId, slot);
    if (!r.ok) this.notice(`loot.cannot.${r.reason}`, 'error');
    else audio.play('ui.equip');
    this.afterInventoryChange();
  }

  unequipItem(slot: Slot): void {
    const r = unequip(this.world.req(this.player, Inventory), slot);
    if (!r.ok) this.notice(`loot.cannot.${r.reason}`, 'error');
    this.afterInventoryChange();
  }

  salvageItem(index: number): void {
    const inv = this.world.req(this.player, Inventory);
    if (inv.grid[index]?.locked) return;
    const dust = inv.grid[index] ? grantSalvageDust(this.ctx, inv.grid[index]!) : 0;
    const gold = salvage(inv, index);
    if (gold > 0) this.toasts.show(t('loot.salvaged', { gold }));
    if (dust > 0) this.toasts.show(t('crafting.salvageDust', { n: dust }));
    this.afterInventoryChange();
  }

  /** Salvage several backpack items at once (multi-select): one toast for the lot. */
  salvageItems(indices: number[]): void {
    const inv = this.world.req(this.player, Inventory);
    let gold = 0;
    let dust = 0;
    for (const index of indices) {
      const item = inv.grid[index];
      if (!item || item.locked) continue;
      dust += grantSalvageDust(this.ctx, item);
      gold += salvage(inv, index);
    }
    if (gold > 0) this.toasts.show(t('loot.salvaged', { gold }));
    if (dust > 0) this.toasts.show(t('crafting.salvageDust', { n: dust }));
    this.afterInventoryChange();
  }

  /** Reorder the backpack (Sort button); the cells keep their items, only the order changes. */
  sortInventory(mode: SortMode): void {
    const inv = this.world.req(this.player, Inventory);
    inv.grid.splice(0, inv.grid.length, ...sortGrid(inv.grid, mode));
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
  private compare(item: Item, forSlot?: Slot): { stats: { stat: import('./data/loot/schemas').StatKey; delta: number }[]; damagePct: number; life: number } | null {
    const inv = this.world.req(this.player, Inventory);
    const base = BASE_ITEMS.get(item.base);
    if (!base || slotsFor(base.type).length === 0) return null;
    const slot: Slot | null = forSlot && slotsFor(base.type).includes(forSlot)
      ? forSlot
      : slotsFor(base.type).length > 1 ? (targetSlot(inv, item) ?? null) : (slotsFor(base.type)[0] ?? null);
    if (!slot) return null;
    return this.compareIn(item, slot, inv.equipped);
  }

  /** What wearing `item` in `slot` changes against the gear in `equipped` (a snapshot, so Equip best can try moves ahead). */
  private compareIn(item: Item, slot: Slot, equipped: Partial<Record<Slot, Item>>): { stats: { stat: import('./data/loot/schemas').StatKey; delta: number }[]; damagePct: number; life: number } | null {
    const base = BASE_ITEMS.get(item.base);
    if (!base || !slotsFor(base.type).includes(slot)) return null;
    const user = this.world.req(this.player, SkillUser);
    return compareGear(classDef(user.classId), this.world.req(this.player, Progression).level, item, slot, equipped);
  }

  /** The upgrades "Equip best" would make now (also the number on its button). */
  bestEquipMoves(): EquipMove[] {
    const inv = this.world.req(this.player, Inventory);
    const user = this.world.req(this.player, SkillUser);
    return bestLoadout(inv.grid, inv.equipped, user.classId, (item, slot, equipped) => this.compareIn(item, slot, equipped));
  }

  /** Wear the best gear from the bag in one go: one sound, one save, one toast. */
  equipBest(): void {
    const inv = this.world.req(this.player, Inventory);
    const user = this.world.req(this.player, SkillUser);
    const moves = this.bestEquipMoves();
    let done = 0;
    for (const m of moves) if (equipFromGrid(inv, m.index, user.classId, m.slot).ok) done++;
    if (done === 0) {
      this.toasts.show(t('loot.equipBestNone'));
      return;
    }
    audio.play('ui.equip');
    this.afterInventoryChange();
    this.autosave();
    this.toasts.show(t(done === 1 ? 'loot.equipBestOne' : 'loot.equipBestMany', { n: done }));
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

  /** After a Neural Matrix action: stats and panels follow, or the reason it failed is shown. */
  private matrixChange(r: { ok: boolean; reason?: string }): void {
    if (!r.ok) {
      this.notice(`matrix.cannot.${r.reason ?? 'failed'}`, 'error');
      return;
    }
    recomputePlayer(this.world, this.player);
    this.skillTreePanel.refresh();
    this.characterPanel.refresh();
    this.autosave();
  }

  private matrixRespec(): void {
    const e = matrix.ensureEndgame(this.ctx);
    const inv = this.world.req(this.player, Inventory);
    const cost = matrix.respecCost(e);
    if (e.nodes.length === 0) return;
    if (inv.gold < cost) {
      this.notice('tree.cannot.gold', 'error');
      return;
    }
    inv.gold -= cost;
    matrix.respecMatrix(this.ctx);
    this.inventoryPanel.refresh();
    this.matrixChange({ ok: true });
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

  /** Take one rank of a learned node back for a little gold (B032). */
  refundNode(id: string): void {
    const user = this.world.req(this.player, SkillUser);
    const prog = this.world.req(this.player, Progression);
    const inv = this.world.req(this.player, Inventory);
    const t = tree(user.classId);
    const cost = refundCost(t, prog.level);
    const r = canRefund(t, user.tree, id);
    if (!r.ok) {
      this.notice(`tree.cannot.refund_${r.reason}`, 'error');
      return;
    }
    if (inv.gold < cost) {
      this.notice('tree.cannot.gold', 'error');
      return;
    }
    refundRank(t, user.tree, id);
    inv.gold -= cost;
    prog.skillPoints++;
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
      const result = this.saves.write(slotKey(this.slot), this.snapshot());
      if (!result.ok) this.toasts.show(t(`save.autosaveFailed.${result.reason}`), 'error', 8000);
      else if (!quiet) this.toasts.show(t('save.saved'));
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
      if (!this.applyChecked(data, this.slot)) return false;
      this.toasts.show(t('save.loaded'));
      return true;
    } catch (err) {
      const reason = err instanceof SaveError ? err.message : String(err);
      this.toasts.show(t('save.loadFailed', { reason }), 'error');
      return false;
    }
  }

  /**
   * Applies a parsed save: unknown ids are removed first (and the original kept as a backup), and if
   * any step throws the previous state is put back. When that is not possible autosave stays off so a
   * half-applied world is never written over the slot. Returns false when the save was not applied.
   */
  private applyChecked(parsed: SaveData, slot: number | null): boolean {
    const { data, dropped } = sanitizeSave(parsed);
    if (dropped.length > 0 && slot !== null) this.saves.keepOriginal(slotKey(slot), 'dropped');
    const outcome = runSaveApply(
      { apply: (d) => this.applySave(d), snapshot: () => (this.playing ? this.snapshot() : null) },
      data,
    );
    if (!outcome.ok) {
      console.error('[ashfall] applying a save failed', outcome.error);
      this.autosaveSuppressed = !outcome.restored;
      this.toasts.show(t(outcome.restored ? 'save.restoreFailed' : 'save.loadHalfApplied'), 'error', 6000);
      return false;
    }
    this.autosaveSuppressed = false;
    if (dropped.length > 0) this.toasts.show(t('save.droppedRefs', { count: dropped.length }), 'info', 5000);
    return true;
  }

  exportSave(): void {
    const blob = new Blob([serializeSave(this.snapshot(), true)], { type: 'application/json' });
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
      if (!this.applyChecked(parseSave(json), null)) return;
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
    this.touchControls.setLayout(this.settings.touchLayout, this.settings.buttonScale);
    this.hud.setTouch(on);
    setTouchWording(on);
  }

  /** The settings panel changes settings here: apply each one at once and save. */
  applySettings(patch: Partial<Settings>): void {
    Object.assign(this.settings, patch);
    if (patch.textScale !== undefined) document.documentElement.style.setProperty('--text-scale', String(patch.textScale));
    if (patch.graphics !== undefined) this.renderer.setQuality(patch.graphics);
    if (patch.screenShake !== undefined) this.renderer.screenShake = patch.screenShake;
    if (patch.showFps !== undefined) this.devtools.setShowFps(patch.showFps);
    if (patch.haptics !== undefined) setHaptics(patch.haptics);
    if (patch.reduceFlashing !== undefined) this.hud.setReduceFlashing(patch.reduceFlashing);
    if (patch.reduceFlashing !== undefined) this.renderer.reduceFlashing = patch.reduceFlashing;
    if (patch.reduceFlashing !== undefined) this.mapUi.reduceFlashing = patch.reduceFlashing;
    if (patch.brightness !== undefined) this.renderer.setBrightness(patch.brightness);
    if (patch.keybindings !== undefined) {
      this.input.setBindings(resolveKeybindings(this.settings));
      this.refreshHint();
    }
    if (patch.moveMode !== undefined) {
      this.devtools.setMoveMode(patch.moveMode);
      this.refreshHint();
    }
    if (patch.touchControls !== undefined) this.devtools.setTouchControls(patch.touchControls);
    if (patch.touchControls !== undefined || patch.touchLayout !== undefined || patch.buttonScale !== undefined) this.applyTouchControls();
    saveSettings(this.storage, this.settings);
  }

  /** True while a full-screen menu is open, nothing is close by and the setting asks for a pause. */
  private menuPaused(): boolean {
    // The Escape pause menu (and Settings opened from it) always freezes the world, enemies near or not.
    if (this.pauseMenu.pausing) {
      this.menuPausedNow = false;
      this.uiRoot.classList.add('menu-paused');
      return true;
    }
    const open = this.settings.pauseInMenus && this.uiRoot.classList.contains('touch-ui') && this.uiRoot.classList.contains('has-panel') && !this.world.has(this.player, Dead);
    if (!open) {
      this.menuPausedNow = false;
    } else if (this.pauseFrame++ % 10 === 0) {
      // Re-check the surroundings a few times a second: safe in a hub, else no live enemy within 12 m.
      const tr = this.playerTransform;
      const hub = !!this.zone?.inHub;
      this.menuPausedNow =
        hub ||
        !this.world.query(EnemyAI, Transform).some((e) => {
          if (this.world.has(e, Dead)) return false;
          const et = this.world.req(e, Transform);
          return Math.hypot(et.x - tr.x, et.z - tr.z) < PAUSE_ENEMY_RANGE;
        });
    }
    this.uiRoot.classList.toggle('menu-paused', open && this.menuPausedNow);
    return open && this.menuPausedNow;
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
