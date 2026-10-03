/**
 * Skill tree panel (K): branches that unlock with points spent, node cards with ranks,
 * enhancement → choose-one modifiers, ranked passives, one key passive, the 6-slot action
 * bar editor and a full respec for gold.
 */
import { t } from '../data/i18n';
import { classDef, skill } from '../data/db';
import type { SkillTree, TreeNode } from '../data/skillTree/schema';
import { BRANCHES } from '../data/skillTree/schema';
import type { CompiledSkill } from '../systems/skillCompile';
import { branchUnlocked, canLearn, maxRank, pointsInTree, type TreeState } from '../systems/skillTree';

export interface SkillTreeView {
  tree: SkillTree;
  state: TreeState;
  unspent: number;
  slots: (string | null)[];
  compiled: Record<string, CompiledSkill>;
  respecCost: number;
  gold: number;
}

export interface SkillTreeActions {
  learn(nodeId: string): void;
  reset(): void;
  assign(slot: number, skillId: string | null): void;
  iconUrl(iconId: string): string | null;
}

const SLOT_LABELS = ['LMB', 'RMB', '1', '2', '3', '4'];

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

export class SkillTreePanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private selectedSlot: number | null = null;

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
    this.root.append(title, this.body);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'item-tooltip';
    this.tooltip.hidden = true;
    parent.append(this.root, this.tooltip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.selectedSlot = null;
    this.tooltip.hidden = true;
    if (this.open) this.refresh();
  }

  refresh(): void {
    if (!this.open) return;
    const v = this.view();
    const header = document.createElement('div');
    header.className = 'tree-header';
    const points = document.createElement('span');
    points.className = v.unspent > 0 ? 'tree-points has' : 'tree-points';
    points.textContent = t('tree.points', { points: v.unspent });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = t('tree.reset', { gold: v.respecCost });
    reset.disabled = v.gold < v.respecCost || pointsInTree(v.state) <= 1;
    reset.addEventListener('click', () => {
      if (confirm(t('tree.resetConfirm', { gold: v.respecCost }))) this.actions.reset();
    });
    header.append(points, reset);

    // Action bar editor: click a slot, then a learned skill. Right-click clears.
    const bar = document.createElement('div');
    bar.className = 'tree-bar';
    v.slots.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = `tree-slot${this.selectedSlot === i ? ' selected' : ''}`;
      const key = document.createElement('span');
      key.className = 'slot-key';
      key.textContent = SLOT_LABELS[i] ?? '';
      slot.appendChild(key);
      if (id) slot.appendChild(this.icon(id, skillIconId(id)));
      slot.title = id ? nodeName({ type: 'skill', id: '', branch: 'basic', skill: id, maxRank: 5 }) : t('hud.slotEmpty');
      slot.addEventListener('click', () => {
        this.selectedSlot = this.selectedSlot === i ? null : i;
        this.refresh();
      });
      slot.addEventListener('contextmenu', () => this.actions.assign(i, null));
      bar.appendChild(slot);
    });
    const barHint = document.createElement('div');
    barHint.className = 'inv-hint';
    // The touch layout swaps in the phone wording (style.css shows one of the two).
    barHint.append(
      Object.assign(document.createElement('span'), { className: 'hint-mouse', textContent: t('tree.barHint') }),
      Object.assign(document.createElement('span'), { className: 'hint-touch', textContent: t('tree.barHintTouch') }),
    );

    const branches = BRANCHES.map((branch) => {
      const row = document.createElement('div');
      const unlocked = branchUnlocked(v.tree, v.state, branch);
      row.className = `tree-branch${unlocked ? '' : ' locked'}`;
      const label = document.createElement('div');
      label.className = 'tree-branch-label';
      label.textContent = t(`tree.branches.${branch}`);
      const need = v.tree.unlockAt[branch] ?? 0;
      if (!unlocked) label.textContent += ` · ${t('tree.unlockAt', { points: need })}`;
      const nodes = document.createElement('div');
      nodes.className = 'tree-nodes';
      for (const n of v.tree.nodes.filter((x) => x.branch === branch)) nodes.appendChild(this.nodeCard(n, v));
      row.append(label, nodes);
      return row;
    });
    // Only the branches scroll; points, reset and the action bar stay in view.
    const scroll = document.createElement('div');
    scroll.className = 'tree-scroll';
    const prev = this.body.querySelector('.tree-scroll')?.scrollTop ?? 0;
    scroll.append(...branches);
    this.body.replaceChildren(header, bar, barHint, scroll);
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

  private nodeCard(n: TreeNode, v: SkillTreeView): HTMLElement {
    const rank = v.state.ranks[n.id] ?? 0;
    const max = maxRank(n);
    const check = canLearn(v.tree, v.state, n.id, v.unspent);
    const card = document.createElement('div');
    card.className = `tree-node t-${n.type}${rank > 0 ? ' learned' : ''}${check.ok ? ' available' : ''}`;
    if (n.type === 'skill') card.appendChild(this.icon(n.skill, skillIconId(n.skill)));
    const name = document.createElement('div');
    name.className = 'tree-node-name';
    name.textContent = nodeName(n);
    const ranks = document.createElement('div');
    ranks.className = 'tree-node-rank';
    ranks.textContent = max > 1 ? `${rank}/${max}` : rank ? '✓' : '';
    card.append(name, ranks);
    card.addEventListener('click', () => {
      if (n.type === 'skill' && rank > 0 && this.selectedSlot !== null) {
        this.actions.assign(this.selectedSlot, n.skill);
        this.selectedSlot = null;
        return;
      }
      this.actions.learn(n.id);
    });
    card.addEventListener('mouseenter', () => this.showTip(card, n, v, rank, check.ok ? null : check.reason));
    card.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
    return card;
  }

  private showTip(anchor: HTMLElement, n: TreeNode, v: SkillTreeView, rank: number, blocked: string | null): void {
    const tip = document.createElement('div');
    tip.className = 'item-tip';
    tip.style.setProperty('--rarity', n.type === 'keyPassive' ? '#ff8a2a' : n.type === 'skill' ? '#e8c86a' : '#8ab4ff');
    const add = (cls: string, text: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      tip.appendChild(d);
    };
    add('item-tip-name', nodeName(n));
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
    }
    if (n.type === 'modifier') add('muted', t('tree.chooseOne'));
    if (n.type === 'keyPassive') add('muted', t('tree.onlyOneKey'));
    if (blocked && blocked !== 'maxed') add('item-tip-req', t(`tree.cannot.${blocked}`));
    if (n.type === 'skill' && rank > 0) add('muted', t('tree.assignHint'));
    this.tooltip.replaceChildren(tip);
    this.tooltip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const tr = this.tooltip.getBoundingClientRect();
    let left = rect.right + 10;
    if (left + tr.width > window.innerWidth - 8) left = rect.left - tr.width - 10;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tr.height - 8, rect.top))}px`;
  }
}
