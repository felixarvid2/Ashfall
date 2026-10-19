/**
 * World boss tracker (docs/endgame.md): a line under the title while a world boss is announced or alive
 * ("World boss: The Ashen Colossus in 4:12 — Refinery District"; "The Ashen Colossus  4:12" on a phone), plus the toasts for its announcement,
 * its appearance, its leaving and what its chest paid.
 */
import type { GameContext } from '../core/context';
import { zoneDef } from '../data/zones';
import { t } from '../data/i18n';
import { activeWorldBoss, worldBossRuntime } from '../world/worldBoss';

/** 4:12, 12:05. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The tracker text for the current status, or '' when nothing is announced. */
export function worldBossLine(ctx: GameContext): string {
  const st = activeWorldBoss(ctx);
  if (!st) return '';
  const boss = t(`worldBoss.${st.event.def.id}.name`);
  const region = t(`zones.${zoneDef(st.event.spot.zone).key}.name`);
  return t(st.phase === 'warning' ? 'worldBoss.hudWarning' : 'worldBoss.hudAlive', { boss, time: clock(st.secondsLeft), region });
}

/** The short phone form: "The Ashen Colossus  4:12", with the region after a tag only when the player is elsewhere. */
export function worldBossShortLine(ctx: GameContext): string {
  const st = activeWorldBoss(ctx);
  if (!st) return '';
  const boss = t(`worldBoss.${st.event.def.id}.name`);
  const time = clock(st.secondsLeft);
  const here = ctx.zone?.def.id === st.event.spot.zone;
  if (here) return t('worldBoss.hudShort', { boss, time });
  return t('worldBoss.hudShortRegion', { boss, time, region: t(`zones.${zoneDef(st.event.spot.zone).key}.name`) });
}

export class WorldBossHud {
  private readonly el: HTMLDivElement;
  private readonly long: HTMLSpanElement;
  private readonly short: HTMLSpanElement;
  private text = '';
  private shortText = '';
  /** What was announced last: `phase:index`. */
  private seen = '';
  private seenIndex = 0;
  private seenReward = 0;

  constructor(
    root: HTMLElement,
    private readonly toast: (message: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'worldboss-hud';
    this.el.hidden = true;
    this.long = Object.assign(document.createElement('span'), { className: 'wb-long' });
    this.short = Object.assign(document.createElement('span'), { className: 'wb-short' });
    this.el.append(this.long, this.short);
    root.append(this.el);
  }

  /** The row, for the phone's endgame chip. */
  get element(): HTMLElement {
    return this.el;
  }

  update(ctx: GameContext): void {
    const text = worldBossLine(ctx);
    const shortText = worldBossShortLine(ctx);
    if (text !== this.text || shortText !== this.shortText) {
      this.text = text;
      this.shortText = shortText;
      this.long.textContent = text;
      this.short.textContent = shortText;
      this.el.hidden = text === '';
    }
    const rt = worldBossRuntime(ctx);
    const st = activeWorldBoss(ctx);
    const key = st ? `${st.phase}:${st.event.index}` : '';
    if (key !== this.seen) {
      if (st) {
        const boss = t(`worldBoss.${st.event.def.id}.name`);
        const region = t(`zones.${zoneDef(st.event.spot.zone).key}.name`);
        if (st.phase === 'warning') this.toast(t('worldBoss.warning', { boss, region, minutes: Math.max(1, Math.round(st.secondsLeft / 60)) }));
        else this.toast(t('worldBoss.appeared', { boss, region }));
      } else if (this.seen.startsWith('alive:') && rt.killed !== this.seenIndex) {
        this.toast(t('worldBoss.gone'));
      }
      this.seen = key;
      this.seenIndex = st?.event.index ?? this.seenIndex;
    }
    const reward = rt.reward;
    if (reward && reward.seq !== this.seenReward) {
      this.seenReward = reward.seq;
      this.toast(t('worldBoss.chest'));
      if (reward.unique) this.toast(t('worldBoss.unique'));
      for (const id of reward.recipes) this.toast(t('worldBoss.recipe', { name: t(`crafting.recipes.${id}.name`) }));
      if (reward.dust > 0) this.toast(t('worldBoss.dust', { n: reward.dust, name: t('crafting.materials.lumen_dust') }));
    }
  }
}
