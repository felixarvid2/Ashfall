/**
 * In-game HUD: life and resource orbs, action bar with cooldowns, wave tracker,
 * target frame and death screen. DOM is only touched when a value changes.
 */
import { classDef, skill } from '../data/db';
import { t } from '../data/i18n';
import type { Action, MoveMode } from '../data/settings';
import type { SkillDef } from '../data/schemas';

/** "KeyW" → "W", "Digit1" → "1", "F3" → "F3". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Backquote') return '§';
  if (code === 'Space') return 'Space';
  if (code.startsWith('Shift')) return 'Shift';
  return code;
}

export interface SlotState {
  id: string | null;
  cooldown: number;
  cooldownMax: number;
  affordable: boolean;
}

export interface HudState {
  life: { current: number; max: number; barrier: number };
  resource: { kind: string; current: number; max: number; overheating: boolean };
  slots: SlotState[];
  dodge: { cooldown: number; max: number };
  potion: { charges: number; max: number };
  wave: { wave: number; alive: number; phase: 'intermission' | 'active'; timer: number } | null;
  /** Open world: region and subzone name, shown where the wave tracker sits in the arena. */
  location?: { title: string; sub: string };
  target: { name: string; current: number; max: number; statuses: string[]; color?: string; affixes?: string[] } | null;
  /** World event in progress near the player. */
  event?: { title: string; text: string };
  /** Timed buffs on the player (Stim Pylons). */
  buffs?: { id: string; remaining: number; color: string }[];
  /** Spore exposure 0..1 (Hydroponic Vaults). */
  exposure?: number;
  /** Flares left (Deep Mines). */
  flares?: { charges: number; max: number; key: string };
  dead: boolean;
  xp: { level: number; current: number; next: number; skillPoints: number };
}

const SLOT_LABELS = ['LMB', 'RMB', '1', '2', '3', '4'];

class Orb {
  readonly el: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly shield: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private last = '';

  private kind: string;

  constructor(kind: string, label: string) {
    this.kind = kind;
    this.el = document.createElement('div');
    this.el.className = `orb orb-${kind}`;
    this.el.title = label;
    this.fill = document.createElement('div');
    this.fill.className = 'orb-fill';
    this.shield = document.createElement('div');
    this.shield.className = 'orb-shield';
    this.text = document.createElement('div');
    this.text.className = 'orb-text';
    const glass = document.createElement('div');
    glass.className = 'orb-glass';
    this.el.append(this.fill, this.shield, glass, this.text);
  }

  /** Switch colour scheme and label (Heat, Focus, Biomass). */
  setKind(kind: string, label: string): void {
    if (kind === this.kind) return;
    this.el.classList.replace(`orb-${this.kind}`, `orb-${kind}`);
    this.kind = kind;
    this.el.title = label;
  }

  set(current: number, max: number, extra = 0, warn = false): void {
    const key = `${Math.ceil(current)}/${max}/${Math.ceil(extra)}/${warn}`;
    if (key === this.last) return;
    this.last = key;
    const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.fill.style.height = `${pct * 100}%`;
    this.shield.style.height = `${Math.min(1, extra / Math.max(1, max)) * 100}%`;
    this.text.textContent = `${Math.ceil(current)} / ${Math.round(max)}`;
    this.el.classList.toggle('warn', warn);
  }
}

class Slot {
  readonly el: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly cd: HTMLDivElement;
  private readonly cdText: HTMLDivElement;
  private last = '';

  constructor(label: string, private readonly onHover: (slot: Slot | null) => void) {
    this.el = document.createElement('div');
    this.el.className = 'slot';
    const key = document.createElement('div');
    key.className = 'slot-key';
    key.textContent = label;
    this.name = document.createElement('div');
    this.name.className = 'slot-name';
    this.cd = document.createElement('div');
    this.cd.className = 'slot-cd';
    this.cdText = document.createElement('div');
    this.cdText.className = 'slot-cd-text';
    this.el.append(this.name, this.cd, this.cdText, key);
    this.el.addEventListener('mouseenter', () => this.onHover(this));
    this.el.addEventListener('mouseleave', () => this.onHover(null));
  }

  skillId: string | null = null;

  set(name: string, category: string, cooldown: number, max: number, usable: boolean, icon: string | null = null): void {
    const frac = max > 0 ? Math.min(1, cooldown / max) : 0;
    const key = `${name}|${category}|${frac.toFixed(2)}|${usable}|${cooldown > 0 ? Math.ceil(cooldown) : 0}|${icon}`;
    if (key === this.last) return;
    this.last = key;
    if (icon) {
      this.name.replaceChildren(Object.assign(document.createElement('img'), { src: icon, alt: name, className: 'slot-icon' }));
    } else {
      this.name.textContent = name;
    }
    this.el.dataset.category = category;
    this.cd.style.background =
      frac > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${frac * 360}deg, transparent 0deg)` : 'transparent';
    this.cdText.textContent = cooldown > 0.05 && max >= 1 ? String(Math.ceil(cooldown)) : '';
    this.el.classList.toggle('unusable', !usable);
  }
}

export class Hud {
  private readonly hint: HTMLDivElement;
  private readonly lifeOrb = new Orb('life', t('hud.life'));
  private readonly heatOrb = new Orb('heat', t('hud.heat'));
  private readonly slots: Slot[];
  private readonly dodgeSlot: Slot;
  private readonly potionSlot: Slot;
  private readonly waveTitle: HTMLDivElement;
  private readonly waveSub: HTMLDivElement;
  private readonly target: HTMLDivElement;
  private readonly targetName: HTMLDivElement;
  private readonly targetFill: HTMLDivElement;
  private readonly targetStatus: HTMLDivElement;
  private readonly buffBar: HTMLDivElement;
  private lastBuffs = '';
  private readonly exposure: HTMLDivElement;
  private readonly exposureFill: HTMLDivElement;
  private readonly exposureText: HTMLDivElement;
  private readonly flares: HTMLDivElement;
  private lastFlares = '';
  private lastExposure = -1;
  private readonly eventBox: HTMLDivElement;
  private lastEvent = '';
  private readonly banner: HTMLDivElement;
  private readonly death: HTMLDivElement;
  private readonly deathHint: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly xpText: HTMLDivElement;
  private lastXp = '';
  private bannerTimer = 0;
  private lastWave = '';
  private lastTarget = '';
  private respawnKey = 'R';
  private resolveSkill: (id: string) => SkillDef = skill;
  private resolveIcon: (id: string) => string | null = () => null;

  /** Use effective (compiled) skill numbers and generated icons in the bar and tooltips. */
  setSkillResolvers(def: (id: string) => SkillDef, icon: (id: string) => string | null): void {
    this.resolveSkill = def;
    this.resolveIcon = icon;
  }

  constructor(root: HTMLElement, onRespawn: () => void) {
    const title = document.createElement('div');
    title.className = 'hud-title';
    const h1 = document.createElement('h1');
    h1.textContent = t('game.title');
    const sub = document.createElement('p');
    sub.textContent = t('game.subtitle');
    this.hint = document.createElement('p');
    this.hint.className = 'hud-hint';
    title.append(h1, sub, this.hint);

    const bar = document.createElement('div');
    bar.className = 'action-bar';
    const slotRow = document.createElement('div');
    slotRow.className = 'slots';
    this.slots = SLOT_LABELS.map((label) => new Slot(label, (s) => this.showTooltip(s)));
    this.dodgeSlot = new Slot('Space', () => {});
    this.potionSlot = new Slot('Q', () => {});
    this.dodgeSlot.el.classList.add('slot-small');
    this.potionSlot.el.classList.add('slot-small');
    slotRow.append(...this.slots.map((s) => s.el), this.dodgeSlot.el, this.potionSlot.el);
    const middle = document.createElement('div');
    middle.className = 'bar-middle';
    const xp = document.createElement('div');
    xp.className = 'xp-bar';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'xp-fill';
    this.xpText = document.createElement('div');
    this.xpText.className = 'xp-text';
    xp.append(this.xpFill, this.xpText);
    middle.append(slotRow, xp);
    bar.append(this.lifeOrb.el, middle, this.heatOrb.el);

    const wave = document.createElement('div');
    wave.className = 'wave-tracker';
    this.waveTitle = document.createElement('div');
    this.waveTitle.className = 'wave-title';
    this.waveSub = document.createElement('div');
    this.waveSub.className = 'wave-sub';
    wave.append(this.waveTitle, this.waveSub);

    this.target = document.createElement('div');
    this.target.className = 'target-frame';
    this.targetName = document.createElement('div');
    this.targetName.className = 'target-name';
    const track = document.createElement('div');
    track.className = 'target-track';
    this.targetFill = document.createElement('div');
    this.targetFill.className = 'target-fill';
    track.appendChild(this.targetFill);
    this.targetStatus = document.createElement('div');
    this.targetStatus.className = 'target-status';
    this.target.append(this.targetName, track, this.targetStatus);
    this.target.hidden = true;

    this.banner = document.createElement('div');
    this.banner.className = 'center-banner';

    this.death = document.createElement('div');
    this.death.className = 'death-screen';
    const dt = document.createElement('h2');
    dt.textContent = t('hud.youDied');
    this.deathHint = document.createElement('p');
    this.death.append(dt, this.deathHint);
    this.death.hidden = true;
    this.death.addEventListener('click', onRespawn);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.hidden = true;

    this.eventBox = document.createElement('div');
    this.eventBox.className = 'event-box';
    this.eventBox.dataset.testid = 'event-box';
    this.eventBox.hidden = true;
    this.buffBar = document.createElement('div');
    this.buffBar.className = 'buff-bar';
    this.buffBar.dataset.testid = 'buff-bar';

    // Spore exposure meter: fills while you breathe spores, drains in clean air.
    this.exposure = document.createElement('div');
    this.exposure.className = 'exposure-meter';
    this.exposure.dataset.testid = 'exposure';
    this.exposureFill = document.createElement('div');
    this.exposureFill.className = 'exposure-fill';
    this.exposureText = document.createElement('div');
    this.exposureText.className = 'exposure-text';
    this.exposure.append(this.exposureFill, this.exposureText);
    this.exposure.hidden = true;
    // Flares: charges left in the dark.
    this.flares = document.createElement('div');
    this.flares.className = 'flare-count';
    this.flares.dataset.testid = 'flares';
    this.flares.hidden = true;

    root.append(title, bar, wave, this.target, this.banner, this.death, this.tooltip, this.buffBar, this.eventBox, this.exposure, this.flares);
  }

  updateHint(moveMode: MoveMode, bindings: Record<Action, string[]>): void {
    const first = (a: Action) => keyLabel(bindings[a][0] ?? '?');
    const move =
      moveMode === 'wasd'
        ? [first('moveUp'), first('moveLeft'), first('moveDown'), first('moveRight')].join('')
        : t('moveMode.clickHint');
    this.hint.textContent = t(moveMode === 'click' ? 'hud.controlsHintClick' : 'hud.controlsHint', {
      move,
      lmb: 'LMB',
      rmb: 'RMB',
      dodge: first('dodge'),
      potion: first('potion'),
      inv: first('inventory'),
      skills: first('skills'),
      map: first('map'),
      quests: first('quests'),
      pickup: first('pickup'),
      debug: first('toggleDebug'),
    });
    this.respawnKey = first('respawn');
    this.deathHint.textContent = this.touch ? t('hud.respawnTap') : t('hud.respawnHint', { key: this.respawnKey });
  }

  private touch = false;

  /** Touch controls on: the action bar becomes on-screen buttons (styled by `.touch-ui`). */
  setTouch(on: boolean): void {
    this.touch = on;
    this.deathHint.textContent = on ? t('hud.respawnTap') : t('hud.respawnHint', { key: this.respawnKey });
  }

  /** The action bar's slot elements in bar order: LMB, RMB, 1–4, dodge, potion. */
  get slotElements(): HTMLElement[] {
    return [...this.slots.map((s) => s.el), this.dodgeSlot.el, this.potionSlot.el];
  }

  /** Big centred message (wave start/clear). */
  showBanner(text: string, seconds = 2): void {
    this.banner.textContent = text;
    this.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  update(state: HudState, dt: number): void {
    const evKey = state.event ? `${state.event.title}|${state.event.text}` : '';
    if (evKey !== this.lastEvent) {
      this.lastEvent = evKey;
      this.eventBox.hidden = !state.event;
      if (state.event) {
        this.eventBox.replaceChildren(
          Object.assign(document.createElement('div'), { className: 'event-title', textContent: state.event.title }),
          Object.assign(document.createElement('div'), { className: 'event-text', textContent: state.event.text }),
        );
      }
    }
    const buffs = state.buffs ?? [];
    const buffKey = buffs.map((b) => `${b.id}:${Math.ceil(b.remaining)}`).join('|');
    if (buffKey !== this.lastBuffs) {
      this.lastBuffs = buffKey;
      this.buffBar.replaceChildren(
        ...buffs.map((b) => {
          const el = document.createElement('div');
          el.className = 'buff';
          el.style.borderColor = b.color;
          el.style.color = b.color;
          el.textContent = `${t(`statuses.${b.id}`)} ${Math.ceil(b.remaining)}s`;
          return el;
        }),
      );
    }
    const exposure = Math.round((state.exposure ?? 0) * 100);
    if (exposure !== this.lastExposure) {
      this.lastExposure = exposure;
      this.exposure.hidden = exposure <= 0;
      this.exposureFill.style.width = `${exposure}%`;
      this.exposureText.textContent = t('hud.exposure', { pct: exposure });
      this.exposure.classList.toggle('high', exposure >= 70);
    }
    const flares = state.flares ? `${state.flares.charges}/${state.flares.max}/${state.flares.key}` : '';
    if (flares !== this.lastFlares) {
      this.lastFlares = flares;
      this.flares.hidden = !state.flares;
      if (state.flares) {
        this.flares.textContent = t('hud.flares', { n: state.flares.charges, max: state.flares.max, key: state.flares.key });
        this.flares.classList.toggle('empty', state.flares.charges === 0);
      }
    }
    this.lifeOrb.set(state.life.current, state.life.max, state.life.barrier, state.life.current / state.life.max < 0.3);
    this.heatOrb.setKind(state.resource.kind, t(`resources.${state.resource.kind}`));
    this.heatOrb.set(state.resource.current, state.resource.max, 0, state.resource.overheating);

    state.slots.forEach((s, i) => {
      const slot = this.slots[i]!;
      slot.skillId = s.id;
      if (!s.id) {
        slot.set('', 'empty', 0, 0, false);
        return;
      }
      const def = this.resolveSkill(s.id);
      const [cls, name] = s.id.split('.') as [string, string];
      slot.set(t(`skills.${cls}.${name}.name`), def.category, s.cooldown, s.cooldownMax, s.affordable && s.cooldown <= 0, this.resolveIcon(s.id));
    });
    this.dodgeSlot.set(t('hud.dodge'), 'dodge', state.dodge.cooldown, state.dodge.max, state.dodge.cooldown <= 0);
    this.potionSlot.set(`${t('hud.potion')} ×${state.potion.charges}`, 'potion', 0, 0, state.potion.charges > 0);

    let waveKey = '';
    if (state.wave) {
      waveKey =
        state.wave.phase === 'active'
          ? `${t('hud.wave', { wave: state.wave.wave })}|${t('hud.hostiles', { count: state.wave.alive })}`
          : `${t('hud.wave', { wave: state.wave.wave })}|${t('hud.nextWave', { seconds: Math.ceil(state.wave.timer) })}`;
    } else if (state.location) {
      waveKey = `${state.location.title}|${state.location.sub}`;
    }
    if (waveKey !== this.lastWave) {
      this.lastWave = waveKey;
      const [a = '', b = ''] = waveKey.split('|');
      this.waveTitle.textContent = a;
      this.waveSub.textContent = b;
    }

    const targetKey = state.target
      ? `${state.target.name}|${Math.ceil(state.target.current)}|${state.target.max}|${state.target.statuses.join(',')}`
      : '';
    if (targetKey !== this.lastTarget) {
      this.lastTarget = targetKey;
      this.target.hidden = !state.target;
      if (state.target) {
        this.targetName.textContent = state.target.name;
        this.targetName.style.color = state.target.color ?? '';
        this.targetFill.style.width = `${Math.max(0, state.target.current / state.target.max) * 100}%`;
        // Elite affixes first (in the elite's colour), then statuses.
        const affixes = state.target.affixes?.join(' · ') ?? '';
        const statuses = state.target.statuses.map((s) => t(`statuses.${s}`)).join(' · ');
        this.targetStatus.textContent = [affixes, statuses].filter(Boolean).join('  |  ');
      }
    }

    this.death.hidden = !state.dead;

    const xpKey = `${state.xp.level}|${Math.floor(state.xp.current)}|${state.xp.next}|${state.xp.skillPoints}`;
    if (xpKey !== this.lastXp) {
      this.lastXp = xpKey;
      this.xpFill.style.width = `${Math.min(100, (state.xp.current / Math.max(1, state.xp.next)) * 100)}%`;
      const points = state.xp.skillPoints > 0 ? ` · ${state.xp.skillPoints} SP` : '';
      this.xpText.textContent = `${t('ui.level', { level: state.xp.level })} · ${t('ui.xp', {
        xp: Math.floor(state.xp.current),
        next: state.xp.next,
      })}${points}`;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }

  private showTooltip(slot: Slot | null): void {
    if (!slot || !slot.skillId) {
      this.tooltip.hidden = true;
      return;
    }
    const def = this.resolveSkill(slot.skillId);
    const [cls, name] = def.id.split('.') as [string, string];
    const resource = t(`resources.${classDef(def.classId).resource.id}`);
    const lines = [`<strong>${t(`skills.${cls}.${name}.name`)}</strong>`, t(`skills.${cls}.${name}.desc`)];
    if (def.resourceCost > 0) lines.push(t('hud.cost', { amount: def.resourceCost, resource }));
    if (def.resourceGain > 0) lines.push(t('hud.generates', { amount: def.resourceGain, resource }));
    if (def.cooldown > 0) lines.push(t('hud.cooldown', { seconds: Number(def.cooldown.toFixed(1)) }));
    this.tooltip.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    const rect = slot.el.getBoundingClientRect();
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltip.style.top = `${rect.top - 8}px`;
  }
}
