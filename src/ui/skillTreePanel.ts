/**
 * Skill tree panel (K): branches that unlock with points spent, node cards with ranks,
 * enhancement → choose-one modifiers, ranked passives, one key passive, the 6-slot action
 * bar editor and a full respec for gold.
 *
 * Touch (useSheet()): a tap on a node selects it and opens the details sheet; the sheet's button spends the
 * point (choosing a modifier or key passive is a two-tap armConfirm there), so one stray tap never spends
 * (P061). Reset sits in a "..." menu (P063), a chip row jumps to a branch and locked branches fold (P065), the
 * action bar dims what a picked slot cannot take (P064) and a blocked node shows its lock and reason (P066).
 * Mouse: hover tooltip and click-to-learn as before.
 */
import { placeTooltipForPortrait } from './itemTooltip';
import type { MatrixPanel } from './matrixPanel';
import { t, touchText } from '../data/i18n';
import { armConfirm, confirmSheet } from './confirmSheet';
import { haptic } from './haptics';
import { tooltipSheet, useSheet, type SheetAction } from './tooltipSheet';
import { artUrl } from './art';
import { classDef, skill } from '../data/db';
import type { SkillTree, TreeNode } from '../data/skillTree/schema';
import { BRANCHES } from '../data/skillTree/schema';
import type { CompiledSkill } from '../systems/skillCompile';
import { branchUnlocked, canLearn, canRefund, maxRank, pointsInTree, pointsSpent, type TreeState } from '../systems/skillTree';
import { nextRankPercent, slotForKey } from './serviceLogic';

export interface SkillTreeView {
  tree: SkillTree;
  state: TreeState;
  unspent: number;
  slots: (string | null)[];
  compiled: Record<string, CompiledSkill>;
  respecCost: number;
  gold: number;
  /** The Neural Matrix tab shows from the level cap on. */
  matrixUnlocked: boolean;
  /** Unspent Neural Matrix points, shown as a badge on the Matrix button (B031). */
  matrixPoints?: number;
  /** Gold for taking one rank back (B032). */
  refundCost?: number;
}

export interface SkillTreeActions {
  learn(nodeId: string): void;
  reset(): void;
  /** Take one rank of a learned node back for gold (B032, desktop right-click). */
  refund?(nodeId: string): void;
  assign(slot: number, skillId: string | null): void;
  iconUrl(iconId: string): string | null;
}

const SLOT_LABELS = ['LMB', 'RMB', '1', '2', '3', '4'];
const DRAG_TYPE = 'application/x-ashfall-skill';

/** Display name of a tree node. */
export function nodeName(n: TreeNode): string {
  if (n.type === 'skill') {
    const [cls, name] = n.skill.split('.') as [string, string];
    return t(`skills.${cls}.${name}.name`);
  }
  return t(`tree.${n.id}.name`);
}

export function nodeDescription(n: TreeNode): string {
  if (n.type === 'skill') {
    const [cls, name] = n.skill.split('.') as [string, string];
    return t(`skills.${cls}.${name}.desc`);
  }
  return t(`tree.${n.id}.desc`);
}

/** Skill icons are generated per skill: icon.skill_<name>. */
export function skillIconId(skillId: string): string {
  return `icon.skill_${skillId.split('.')[1]}`;
}

/**
 * What a node shows when it cannot be learned (P066): the reason for `data-reason` and whether a lock is drawn.
 * Learned nodes and a maxed rank show nothing; "no points" and "no gold" are not locks.
 */
export function blockedInfo(rank: number, reason: string | null): { reason: string; lock: boolean } | null {
  if (rank > 0 || !reason || reason === 'maxed') return null;
  return { reason, lock: reason === 'locked' || reason === 'requires' || reason === 'exclusive' };
}

/** The first active skill a new character should learn next, per class (F004): the second basic skill, learnable at once. */
export const RECOMMENDED_FIRST: Readonly<Record<string, string>> = {
  bastion: 'n.piston_jab',
  lightbearer: 'n.holy_light',
  spectre: 'n.vibro_slash',
  xenomant: 'n.scalpel_slash',
};

/** The node to ring for a new player: shown until the first point is spent, and only while that node can be learned. */
export function recommendedNode(tree: SkillTree, state: TreeState, unspent: number): string | null {
  const id = RECOMMENDED_FIRST[tree.classId];
  if (!id || pointsSpent(tree, state) > 0) return null;
  return canLearn(tree, state, id, unspent).ok ? id : null;
}

export class SkillTreePanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private selectedSlot: number | null = null;
  /** Node whose details sheet is open (touch). */
  private selectedNode: string | null = null;
  /** Locked branches the player unfolded. */
  private readonly unfolded = new Set<string>();
  private menuOpen = false;
  /** Scroll of the branch list while the matrix is shown. */
  private treeScroll = 0;
  /** The Neural Matrix view (endgame) shown in place of the skill branches. */
  private matrix: MatrixPanel | null = null;
  /** Builds the matrix on first use: 36 kB of code that only players at the level cap ever open (T005). */
  private matrixLoader: (() => Promise<MatrixPanel>) | null = null;
  private matrixMode = false;
  /** The learned skill node under the pointer: number keys assign it (B029). Mouse only. */
  private hoverNode: string | null = null;
  /** The action bar slot that just took a skill flashes once (B029). */
  private flashSlot: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly view: () => SkillTreeView,
    private readonly actions: SkillTreeActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'tree-panel panel';
    this.root.hidden = true;
    const title = document.createElement('h2');
    title.textContent = t('tree.title');
    this.body = document.createElement('div');
    this.title = title;
    this.root.append(title, this.body);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'item-tooltip';
    this.tooltip.hidden = true;
    parent.append(this.root, this.tooltip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Capture phase: a number key over a learned skill assigns it instead of firing the slot underneath.
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  /** B029: with the pointer over a learned active skill, keys 1-4 put it on that action bar slot. */
  private onKey(e: KeyboardEvent): void {
    if (!this.open || this.matrixMode || !this.hoverNode || useSheet() || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const slot = slotForKey(e.key);
    if (slot === null) return;
    const v = this.view();
    const n = v.tree.nodes.find((x) => x.id === this.hoverNode);
    if (!n || n.type !== 'skill' || (v.state.ranks[n.id] ?? 0) <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.assignTo(slot, n.skill);
  }

  /** Assign and flash the slot; the game refreshes the panel, so the flash is drawn by that refresh. */
  private assignTo(slot: number, skillId: string): void {
    this.flashSlot = slot;
    this.actions.assign(slot, skillId);
    if (this.flashSlot !== null) this.refresh();
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Adds the Neural Matrix as a second view of this panel. */
  setMatrix(matrix: MatrixPanel): void {
    this.matrix = matrix;
    matrix.onBack = () => this.showMatrix(false);
  }

  /** Same, but the matrix is fetched and built the first time its tab is used. */
  setMatrixLoader(load: () => Promise<MatrixPanel>): void {
    this.matrixLoader = load;
  }

  get matrixOpen(): boolean {
    return this.open && this.matrixMode;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.selectedSlot = null;
    this.hoverNode = null;
    this.tooltip.hidden = true;
    this.menuOpen = false;
    tooltipSheet.hide();
    if (!this.open) this.matrix?.hide();
    if (this.open) {
      this.matrixMode = false;
      this.syncMode();
      this.refresh();
    }
  }

  /** Switch between the skill tree and the Neural Matrix. */
  showMatrix(on: boolean): void {
    if (!this.matrix) {
      if (!on || !this.matrixLoader) return;
      void this.matrixLoader()
        .then((m) => {
          this.setMatrix(m);
          if (this.open) this.showMatrix(true);
        })
        .catch((err) => console.warn('Neural Matrix failed to load', err));
      return;
    }
    // Coming back from the matrix: the branch list is where it was.
    if (on) this.treeScroll = this.body.querySelector('.tree-scroll')?.scrollTop ?? this.treeScroll;
    this.matrixMode = on;
    this.selectedSlot = null;
    this.tooltip.hidden = true;
    this.menuOpen = false;
    tooltipSheet.hide();
    this.syncMode();
    if (on) this.matrix.show();
    else this.matrix.hide();
    this.refresh();
  }

  private syncMode(): void {
    this.root.classList.toggle('matrix-mode', this.matrixMode);
    this.title.textContent = t(this.matrixMode ? 'matrix.title' : 'tree.title');
  }

  refresh(): void {
    if (!this.open) return;
    if (this.matrixMode && this.matrix) {
      this.body.replaceChildren(this.matrix.element);
      this.matrix.refresh();
      return;
    }
    const v = this.view();
    const header = document.createElement('div');
    header.className = 'tree-header';
    const points = document.createElement('span');
    points.className = v.unspent > 0 ? 'tree-points has' : 'tree-points';
    points.dataset.testid = 'tree-points';
    points.textContent = touchText('tree.points', { points: v.unspent });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'tree-reset';
    reset.textContent = t('tree.reset', { gold: v.respecCost });
    reset.disabled = v.gold < v.respecCost || pointsInTree(v.state) <= 1;
    reset.addEventListener('click', () => {
      this.menuOpen = false;
      void confirmSheet({
        title: t('tree.resetTitle'),
        body: t('tree.resetConfirm', { gold: v.respecCost }),
        confirmLabel: t('tree.resetButton'),
        danger: true,
      }).then((ok) => {
        if (ok) this.actions.reset();
        else this.refresh();
      });
    });
    const tools = document.createElement('span');
    tools.className = `tree-tools${this.menuOpen ? ' menu-open' : ''}`;
    if (v.matrixUnlocked && (this.matrix || this.matrixLoader)) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'matrix-tab';
      tab.textContent = t('matrix.tab');
      if ((v.matrixPoints ?? 0) > 0) {
        const badge = document.createElement('span');
        badge.className = 'matrix-badge';
        badge.dataset.testid = 'matrix-badge';
        badge.textContent = String(v.matrixPoints);
        badge.setAttribute('aria-label', t('matrix.points', { points: v.matrixPoints ?? 0 }));
        tab.append(badge);
      }
      tab.addEventListener('click', () => this.showMatrix(true));
      tools.append(tab);
    }
    // Touch: Reset hides behind "..." so a tap near the Matrix button cannot reach it (desktop shows it inline).
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tree-more';
    more.textContent = '⋯';
    more.setAttribute('aria-label', t('tree.more'));
    more.setAttribute('aria-expanded', String(this.menuOpen));
    more.addEventListener('click', () => {
      this.menuOpen = !this.menuOpen;
      tools.classList.toggle('menu-open', this.menuOpen);
      more.setAttribute('aria-expanded', String(this.menuOpen));
    });
    tools.append(more, reset);
    header.append(points, tools);

    // Action bar editor: tap a slot, then a learned skill. Right-click clears.
    const bar = document.createElement('div');
    bar.className = 'tree-bar';
    v.slots.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = `tree-slot${this.selectedSlot === i ? ' selected' : ''}${this.flashSlot === i ? ' flash' : ''}`;
      slot.dataset.testid = `tree-slot-${i}`;
      const key = document.createElement('span');
      key.className = 'slot-key';
      key.textContent = SLOT_LABELS[i] ?? '';
      slot.appendChild(key);
      if (id) slot.appendChild(this.icon(id, skillIconId(id)));
      slot.title = id ? nodeName({ type: 'skill', id: '', branch: 'basic', skill: id, maxRank: 5 }) : t('hud.slotEmpty');
      slot.addEventListener('click', () => {
        this.selectedSlot = this.selectedSlot === i ? null : i;
        tooltipSheet.hide();
        this.refresh();
      });
      slot.addEventListener('contextmenu', () => this.actions.assign(i, null));
      // Drag a learned skill from the tree onto a slot (B029, mouse).
      slot.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          slot.classList.add('drop');
        }
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
      slot.addEventListener('drop', (e) => {
        slot.classList.remove('drop');
        const skillId = e.dataTransfer?.getData(DRAG_TYPE);
        if (!skillId) return;
        e.preventDefault();
        this.assignTo(i, skillId);
      });
      bar.appendChild(slot);
    });
    this.flashSlot = null;
    const barHint = document.createElement('div');
    barHint.className = 'inv-hint';
    // The touch layout swaps in the phone wording (style.css shows one of the two).
    barHint.append(
      Object.assign(document.createElement('span'), { className: 'hint-mouse', textContent: t('tree.barHint') }),
      Object.assign(document.createElement('span'), { className: 'hint-touch', textContent: t('tree.barHintTouch') }),
    );
    const banner = document.createElement('div');
    banner.className = 'tree-assign-banner';
    banner.hidden = this.selectedSlot === null;
    if (this.selectedSlot !== null) banner.textContent = t('tree.pickForSlot', { slot: SLOT_LABELS[this.selectedSlot] ?? '' });
    const assigning = this.selectedSlot !== null;

    const rows = new Map<string, HTMLElement>();
    const branches = BRANCHES.filter((branch) => v.tree.nodes.some((x) => x.branch === branch)).map((branch) => {
      const row = document.createElement('div');
      const unlocked = branchUnlocked(v.tree, v.state, branch);
      // A locked branch folds into one 44 px row on touch; a tap unfolds it.
      const folded = !unlocked && !this.unfolded.has(branch);
      row.className = `tree-branch${unlocked ? '' : ' locked'}${folded ? ' collapsed' : ''}`;
      row.dataset.branch = branch;
      const label = document.createElement('div');
      label.className = 'tree-branch-label';
      label.textContent = t(`tree.branches.${branch}`);
      const need = v.tree.unlockAt[branch] ?? 0;
      if (!unlocked) {
        label.textContent += ` · ${t('tree.unlockAt', { points: need })}`;
        label.setAttribute('role', 'button');
        label.setAttribute('aria-expanded', String(!folded));
        label.addEventListener('click', () => {
          if (this.unfolded.has(branch)) this.unfolded.delete(branch);
          else this.unfolded.add(branch);
          this.refresh();
        });
      }
      const nodes = document.createElement('div');
      nodes.className = 'tree-nodes';
      const list = v.tree.nodes.filter((x) => x.branch === branch);
      for (let i = 0; i < list.length; i++) {
        const n = list[i]!;
        const next = list[i + 1];
        const card = this.nodeCard(n, v, assigning);
        // Two modifiers of one group exclude each other: they sit together with an "or" between them (P066).
        if (n.type === 'modifier' && next?.type === 'modifier' && next.group === n.group) {
          const pair = document.createElement('div');
          pair.className = 'tree-pair';
          pair.append(card, Object.assign(document.createElement('span'), { className: 'tree-or', textContent: t('tree.or') }), this.nodeCard(next, v, assigning));
          nodes.appendChild(pair);
          i++;
        } else nodes.appendChild(card);
      }
      row.append(label, nodes);
      rows.set(branch, row);
      return row;
    });
    // Only the branches scroll; points, reset, the action bar and the jump chips stay in view.
    const scroll = document.createElement('div');
    scroll.className = 'tree-scroll';
    const prev = this.body.querySelector('.tree-scroll')?.scrollTop ?? this.treeScroll;
    scroll.append(...branches);
    const jump = document.createElement('div');
    jump.className = 'tree-jump';
    for (const [branch, row] of rows) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.testid = `tree-jump-${branch}`;
      chip.textContent = t(`tree.branches.${branch}`);
      chip.addEventListener('click', () => {
        const top = row.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
        const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (typeof scroll.scrollTo === 'function' && !calm) scroll.scrollTo({ top, behavior: 'smooth' });
        else scroll.scrollTop = top;
      });
      jump.appendChild(chip);
    }
    this.body.replaceChildren(header, bar, barHint, banner, jump, scroll);
    scroll.scrollTop = prev;
  }

  private icon(skillId: string | null, iconId: string): HTMLElement {
    const url = this.actions.iconUrl(iconId);
    if (url) return Object.assign(document.createElement('img'), { src: url, alt: '', draggable: false });
    const span = document.createElement('span');
    span.className = 'abbr';
    span.textContent = skillId ? (skillId.split('.')[1] ?? '').slice(0, 2).toUpperCase() : '';
    return span;
  }

  private nodeCard(n: TreeNode, v: SkillTreeView, assigning: boolean): HTMLElement {
    const rank = v.state.ranks[n.id] ?? 0;
    const max = maxRank(n);
    const check = canLearn(v.tree, v.state, n.id, v.unspent);
    const reason = check.ok ? null : check.reason;
    const card = document.createElement('div');
    card.className = `tree-node t-${n.type}${rank > 0 ? ' learned' : ''}${check.ok ? ' available' : ''}${this.selectedNode === n.id ? ' selected' : ''}`;
    card.dataset.node = n.id;
    card.dataset.testid = `tree-node-${n.id}`;
    // A learned skill can take the picked action bar slot; with a slot picked, everything else steps back (P064).
    if (assigning) card.classList.add(n.type === 'skill' && rank > 0 ? 'assignable' : 'dim');
    // Why a node cannot be learned shows on the node itself (P066).
    const blocked = blockedInfo(rank, reason);
    if (blocked) {
      card.dataset.reason = blocked.reason;
      if (blocked.lock) {
        card.classList.add('blocked');
        card.appendChild(Object.assign(document.createElement('span'), { className: 'tree-lock', title: t(`tree.cannot.${blocked.reason}`) }));
      }
    }
    // A ring on the one skill a new player should learn first, until the first points are spent (F004).
    if (n.id === recommendedNode(v.tree, v.state, v.unspent)) {
      card.classList.add('recommended');
      card.title = t('tree.recommended');
    }
    // A learned active skill that no action bar slot holds gets a dot (B036).
    const offBar = n.type === 'skill' && rank > 0 && !v.slots.includes(n.skill);
    if (offBar) {
      card.classList.add('off-bar');
      card.appendChild(Object.assign(document.createElement('span'), { className: 'tree-dot', title: t('tree.notOnBar') }));
    }
    card.setAttribute('aria-label', `${nodeName(n)}${max > 1 ? `, ${rank}/${max}` : ''}${reason && rank === 0 ? `, ${t(`tree.cannot.${reason}`)}` : ''}${offBar ? `, ${t('tree.notOnBar')}` : ''}`);
    if (n.type === 'skill') card.appendChild(this.icon(n.skill, skillIconId(n.skill)));
    else if (n.type === 'passive') {
      // Passives show an emblem for the stat they raise.
      const stat = n.effects.find((e) => e.kind === 'stat');
      const url = (stat && 'stat' in stat && artUrl(`stats/${stat.stat.replace(/Pct$/, '')}`)) || artUrl('stats/generic');
      if (url) card.appendChild(Object.assign(document.createElement('img'), { src: url, alt: '', draggable: false, className: 'tree-node-emblem' }));
    }
    const name = document.createElement('div');
    name.className = 'tree-node-name';
    name.textContent = nodeName(n);
    const ranks = document.createElement('div');
    ranks.className = 'tree-node-rank';
    ranks.textContent = max > 1 ? `${rank}/${max}` : rank ? '✓' : '';
    card.append(name, ranks);
    if (max > 1) {
      // Ranks as small pips on touch (the "0/5" text stays for the mouse layout).
      const pips = document.createElement('div');
      pips.className = 'tree-pips';
      pips.dataset.rank = String(rank);
      for (let i = 0; i < max; i++) pips.appendChild(Object.assign(document.createElement('i'), { className: i < rank ? 'on' : '' }));
      card.appendChild(pips);
    }
    card.addEventListener('click', () => {
      if (n.type === 'skill' && rank > 0 && this.selectedSlot !== null) {
        this.actions.assign(this.selectedSlot, n.skill);
        this.selectedSlot = null;
        return;
      }
      if (useSheet()) {
        // Touch: select first; the sheet's button spends the point.
        this.selectedSlot = null;
        haptic('select');
        this.openSheet(n.id);
        return;
      }
      this.actions.learn(n.id);
    });
    if (!useSheet() && n.type === 'skill' && rank > 0) {
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData(DRAG_TYPE, n.skill);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        this.tooltip.hidden = true;
      });
    }
    card.addEventListener('mouseenter', () => {
      if (useSheet()) return; // touch emulates mouseenter on tap and never sends mouseleave
      this.hoverNode = n.id;
      this.showTip(card, n, v, rank, reason);
    });
    card.addEventListener('mouseleave', () => {
      if (this.hoverNode === n.id) this.hoverNode = null;
      this.tooltip.hidden = true;
    });
    // Right-click a learned node: take one rank back for gold, after a confirmation (B032).
    card.addEventListener('contextmenu', () => {
      if (useSheet() || rank <= 0 || !this.actions.refund) return;
      const refund = this.actions.refund;
      const gold = v.refundCost ?? 0;
      const check = canRefund(v.tree, v.state, n.id);
      if (!check.ok) {
        refund(n.id); // the game says why it cannot be done
        return;
      }
      void confirmSheet({
        title: t('tree.refundTitle', { name: nodeName(n) }),
        body: t('tree.refundConfirm', { gold }),
        confirmLabel: t('tree.refundButton', { gold }),
        danger: true,
      }).then((ok) => {
        if (ok) refund(n.id);
      });
    });
    return card;
  }

  /** The details sheet of a node with its Learn / Add rank and Equip buttons (touch). */
  private openSheet(nodeId: string): void {
    const v = this.view();
    const n = v.tree.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const rank = v.state.ranks[n.id] ?? 0;
    const max = maxRank(n);
    const check = canLearn(v.tree, v.state, n.id, v.unspent);
    const reason = check.ok ? null : check.reason;
    const exclusive = n.type === 'modifier' || n.type === 'keyPassive';
    const learn = () => {
      const before = this.view().unspent;
      this.actions.learn(n.id);
      if (this.view().unspent < before) haptic('success');
      // Same node again with its new rank (the game refreshed the panel).
      if (this.open && this.selectedNode === n.id) this.openSheet(n.id);
    };
    const learnLabel = reason ? (reason === 'maxed' ? t('tree.maxRank') : t(`tree.cannot.${reason}`)) : rank === 0 ? t('tree.learn') : t('tree.addRank', { rank: rank + 1, max });
    const actions: SheetAction[] = [
      // Choosing a modifier or key passive locks out the alternatives: that one asks again (armConfirm below).
      { label: learnLabel, primary: true, disabled: !check.ok, keepOpen: true, onClick: exclusive ? () => {} : learn },
    ];
    if (n.type === 'skill' && rank > 0) {
      const slots = this.view().slots;
      const onBar = slots.includes(n.skill);
      const target = this.selectedSlot ?? slots.indexOf(null);
      actions.push({
        label: onBar ? t('tree.onBar') : target < 0 ? t('tree.barFull') : t('tree.equip'),
        disabled: onBar || target < 0,
        onClick: () => {
          this.actions.assign(target, n.skill);
          this.selectedSlot = null;
        },
      });
    }
    tooltipSheet.show({
      title: nodeName(n),
      content: this.buildTip(n, v, rank, null, true),
      actions,
      onClose: () => {
        if (this.selectedNode === nodeId) this.selectedNode = null;
        this.body.querySelectorAll('.tree-node.selected').forEach((el) => el.classList.remove('selected'));
        this.refresh();
      },
    });
    // After show(): replacing an open sheet reports the old one closed first.
    this.selectedNode = nodeId;
    this.body.querySelectorAll('.tree-node.selected').forEach((el) => el.classList.remove('selected'));
    this.body.querySelector(`.tree-node[data-node="${nodeId}"]`)?.classList.add('selected');
    if (exclusive && check.ok) {
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="tooltip-sheet"] .sheet-action.primary');
      if (btn) armConfirm(btn, { armedLabel: t('tree.confirmChoose', { name: nodeName(n) }), run: learn });
    }
  }

  private buildTip(n: TreeNode, v: SkillTreeView, rank: number, blocked: string | null, inSheet = false): HTMLElement {
    const tip = document.createElement('div');
    tip.className = 'item-tip';
    tip.style.setProperty('--rarity', n.type === 'keyPassive' ? '#ff8a2a' : n.type === 'skill' ? '#e8c86a' : '#8ab4ff');
    const add = (cls: string, text: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      tip.appendChild(d);
    };
    // The sheet shows the name as its title.
    if (!inSheet) add('item-tip-name', nodeName(n));
    add('item-tip-type', t(`tree.types.${n.type}`));
    add('item-tip-implicits', nodeDescription(n));
    if (n.type === 'skill') {
      const compiled = v.compiled[n.skill];
      const def = compiled?.def ?? skill(n.skill);
      const e = def.effect as { coefficient?: number; landing?: { coefficient: number } };
      const coef = e.coefficient ?? e.landing?.coefficient;
      if (coef !== undefined) add('item-tip-stats', t('tree.damage', { pct: Math.round(coef * 100) }));
      if (def.resourceCost > 0) add('muted', t('hud.cost', { amount: Math.round(def.resourceCost), resource: t(`resources.${classDef(def.classId).resource.id}`) }));
      if (def.cooldown > 0) add('muted', t('hud.cooldown', { seconds: def.cooldown.toFixed(1) }));
      if (rank < (n.maxRank ?? 5)) add('muted', t('tree.perRank'));
      // B030: what the next rank gives, or that this is the last one.
      const max = n.maxRank ?? 5;
      const next = coef === undefined ? null : nextRankPercent(coef, rank, max);
      if (rank >= max) add('tip-next max', t('tree.maxRankLine'));
      else if (next !== null) add('tip-next', t('tree.nextRank', { pct: next, n: 1 }));
    }
    if (n.type === 'modifier') add('muted', t('tree.chooseOne'));
    if (n.type === 'keyPassive') add('muted', t('tree.onlyOneKey'));
    if (blocked && blocked !== 'maxed') add('item-tip-req', t(`tree.cannot.${blocked}`));
    if (n.type === 'skill' && rank > 0 && !useSheet()) add('muted', t('tree.assignHint'));
    if (rank > 0 && !useSheet() && v.refundCost !== undefined) add('muted', t('tree.refundHint', { gold: v.refundCost }));
    return tip;
  }

  private showTip(anchor: HTMLElement, n: TreeNode, v: SkillTreeView, rank: number, blocked: string | null): void {
    this.tooltip.replaceChildren(this.buildTip(n, v, rank, blocked));
    this.tooltip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    if (placeTooltipForPortrait(this.tooltip, rect)) return;
    const tr = this.tooltip.getBoundingClientRect();
    let left = rect.right + 10;
    if (left + tr.width > window.innerWidth - 8) left = rect.left - tr.width - 10;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tr.height - 8, rect.top))}px`;
  }
}
