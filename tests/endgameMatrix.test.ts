import { afterEach, describe, expect, it } from 'vitest';
import { DerivedStats, Health, Progression } from '../src/core/components';
import type { GameContext } from '../src/core/context';
import { World } from '../src/core/ecs';
import { EffectSchema } from '../src/data/effects';
import { classDef } from '../src/data/db';
import {
  BOARDS,
  BOARD_IDS,
  GATE_CELLS,
  GLYPHS,
  GLYPH_DEFS,
  GLYPH_MAX_LEVEL,
  GLYPH_LEVEL_SCALE,
  GLYPH_RADIUS,
  MATRIX_MAX_POINTS,
  MATRIX_NODES,
  START_NODE,
  STARTER_GLYPHS,
  gateId,
} from '../src/data/endgame/matrix';
import { PROGRESSION } from '../src/data/loot/db';
import { attackerConditions } from '../src/systems/combat';
import {
  allocateNode,
  attachBoard,
  availableBoards,
  canAllocate,
  detachBoard,
  ensureEndgame,
  ensureMatrixStarted,
  glyphMultiplier,
  glyphReports,
  glyphUpgradeChance,
  grantGlyph,
  grantMatrixXp,
  layoutBoards,
  matrixEffects,
  matrixPointCost,
  neighbors,
  nodePosition,
  nodesInRadius,
  pointsEarned,
  respecCost,
  respecMatrix,
  rotateBoard,
  socketGlyph,
  upgradeGlyph,
} from '../src/systems/endgame/matrix';
import { xpToNext } from '../src/systems/loot/generate';
import { grantXp } from '../src/systems/loot/rewards';
import { computePlayerStats, recomputePlayer, setExtraEffects } from '../src/systems/stats';
import { spawnPlayer } from '../src/world/spawn';
import { makeCtx } from './helpers';

afterEach(() => setExtraEffects(undefined));

/** A context with a started matrix and plenty of points. */
function started(points = 100): GameContext {
  const ctx = makeCtx();
  ensureMatrixStarted(ctx);
  ctx.endgame!.matrixPoints = points;
  return ctx;
}

/** Shortest path of node ids from the start node (exclusive) to `target`, over the current layout. */
function pathTo(ctx: GameContext, target: string): string[] {
  const layout = layoutBoards(ctx.endgame!.boards);
  const prev = new Map<string, string>([[START_NODE, '']]);
  const queue = [START_NODE];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === target) break;
    for (const n of neighbors(layout, cur)) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  const out: string[] = [];
  for (let at = target; at !== START_NODE; at = prev.get(at)!) out.unshift(at);
  return out;
}

function takePath(ctx: GameContext, target: string): void {
  for (const id of pathTo(ctx, target)) {
    if (ctx.endgame!.nodes.includes(id)) continue;
    expect(allocateNode(ctx, id).ok).toBe(true);
  }
}

describe('Matrix experience', () => {
  it('costs 60 % of the last campaign level, rising 2 % of that per point', () => {
    const last = xpToNext(PROGRESSION.maxLevel - 1);
    expect(matrixPointCost(0)).toBe(Math.round(last * 0.6));
    expect(matrixPointCost(10)).toBe(Math.round(last * 0.6 * 1.2));
    expect(matrixPointCost(199)).toBeGreaterThan(matrixPointCost(198));
  });

  it('turns experience into points and keeps the remainder', () => {
    const ctx = makeCtx();
    const first = matrixPointCost(0);
    expect(grantMatrixXp(ctx, first - 1)).toBe(0);
    expect(grantMatrixXp(ctx, 1)).toBe(1);
    expect(ctx.endgame!.matrixPoints).toBe(1);
    expect(ctx.endgame!.matrixXp).toBe(0);
    // Two points at once: the second costs a little more.
    const two = matrixPointCost(1) + matrixPointCost(2) + 5;
    expect(grantMatrixXp(ctx, two)).toBe(2);
    expect(ctx.endgame!.matrixXp).toBe(5);
    expect(ctx.events.peek().some((e) => e.type === 'banner' && e.key === 'matrix.pointBanner')).toBe(true);
  });

  it('stops at 200 points and spent points still count', () => {
    const ctx = started(0);
    expect(grantMatrixXp(ctx, 1e12)).toBe(MATRIX_MAX_POINTS);
    expect(ctx.endgame!.matrixPoints).toBe(MATRIX_MAX_POINTS);
    expect(ctx.endgame!.matrixXp).toBe(0);
    expect(grantMatrixXp(ctx, 1e12)).toBe(0);
    // Spending a point does not make room for another.
    expect(allocateNode(ctx, 'start:5,4').ok).toBe(true);
    expect(pointsEarned(ctx.endgame!)).toBe(MATRIX_MAX_POINTS);
    expect(grantMatrixXp(ctx, 1e12)).toBe(0);
  });

  it('level 50 sends experience to the matrix instead of levelling', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const prog = world.req(player, Progression);
    prog.level = PROGRESSION.maxLevel;
    expect(grantXp(world, ctx, player, matrixPointCost(0) + matrixPointCost(1) + matrixPointCost(2))).toBe(0);
    expect(prog.level).toBe(PROGRESSION.maxLevel);
    expect(ctx.endgame!.matrixPoints).toBe(3);
  });

  it('reaching level 50 starts the matrix with three glyphs and spills the excess', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const prog = world.req(player, Progression);
    prog.level = PROGRESSION.maxLevel - 1;
    prog.xp = 0;
    expect(grantXp(world, ctx, player, xpToNext(prog.level) + matrixPointCost(0))).toBe(1);
    expect(ctx.endgame!.glyphs.map((g) => g.id)).toEqual([...STARTER_GLYPHS]);
    expect(ctx.endgame!.boards.map((b) => b.id)).toEqual(['start']);
    expect(ctx.endgame!.matrixPoints).toBe(1);
    // Asking again changes nothing.
    ensureMatrixStarted(ctx);
    expect(ctx.endgame!.glyphs).toHaveLength(3);
  });
});

describe('Board data', () => {
  it('has the start board and four more, about 45 nodes each', () => {
    expect([...BOARDS.keys()]).toEqual([...BOARD_IDS]);
    expect(BOARD_IDS).toEqual(['start', 'ash', 'forge', 'bloom', 'deep']);
    for (const board of BOARDS.values()) {
      expect(board.nodes.length).toBeGreaterThanOrEqual(43);
      expect(board.nodes.length).toBeLessThanOrEqual(48);
      const count = (k: string) => board.nodes.filter((n) => n.kind === k).length;
      expect(count('legendary')).toBe(1);
      expect(count('socket')).toBe(1);
      expect(count('gate')).toBe(4);
      expect(count('rare')).toBeGreaterThanOrEqual(3);
      expect(count('start')).toBe(board.id === 'start' ? 1 : 0);
    }
  });

  it('puts the gates at the edge midpoints and keeps every board connected', () => {
    for (const board of BOARDS.values()) {
      for (let side = 0; side < 4; side++) {
        const [x, y] = GATE_CELLS[side]!;
        expect(MATRIX_NODES.get(gateId(board.id, side))).toMatchObject({ kind: 'gate', x, y, side });
      }
      const seen = new Set<string>([board.nodes[0]!.id]);
      const queue = [board.nodes[0]!];
      while (queue.length) {
        const n = queue.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const o = MATRIX_NODES.get(`${board.id}:${n.x + dx},${n.y + dy}`);
          if (o && !seen.has(o.id)) {
            seen.add(o.id);
            queue.push(o);
          }
        }
      }
      expect(seen.size).toBe(board.nodes.length);
    }
  });

  it('gives every node valid effects: flat attributes, percent stats, conditional rares', () => {
    for (const n of MATRIX_NODES.values()) {
      for (const fx of n.effects) expect(EffectSchema.safeParse(fx).success).toBe(true);
      if (n.kind === 'normal') expect(n.effects[0]).toMatchObject({ kind: 'stat', value: expect.any(Number) });
      if (n.kind === 'rare') {
        expect(n.conditions.length).toBe(1);
        expect(n.effects.some((fx) => fx.kind === 'damage' && fx.when === n.conditions[0])).toBe(true);
      }
    }
  });

  it('has twelve glyphs of four attributes', () => {
    expect(GLYPHS).toHaveLength(12);
    expect(new Set(GLYPHS.map((g) => g.id)).size).toBe(12);
    for (const attr of ['strength', 'dexterity', 'intelligence', 'willpower']) expect(GLYPHS.filter((g) => g.attribute === attr)).toHaveLength(3);
  });
});

describe('Allocation', () => {
  it('only takes nodes that touch the start or an allocated node', () => {
    const ctx = started(5);
    const e = ctx.endgame!;
    expect(canAllocate(e, 'start:6,4')).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(allocateNode(ctx, 'start:6,4').ok).toBe(false);
    expect(allocateNode(ctx, 'start:5,4').ok).toBe(true);
    expect(allocateNode(ctx, 'start:6,4').ok).toBe(true);
    expect(e.nodes).toEqual(['start:5,4', 'start:6,4']);
    expect(e.matrixPoints).toBe(3);
    expect(canAllocate(e, 'start:6,4')).toMatchObject({ ok: false, reason: 'owned' });
    expect(canAllocate(e, 'nowhere:1,1')).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('needs a free point', () => {
    const ctx = started(1);
    expect(allocateNode(ctx, 'start:5,4').ok).toBe(true);
    expect(allocateNode(ctx, 'start:6,4')).toMatchObject({ ok: false, reason: 'points' });
  });

  it('does not allow nodes on boards that are not attached', () => {
    const ctx = started(5);
    expect(canAllocate(ctx.endgame!, 'ash:4,8')).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('refunds everything on respec, unsockets glyphs and keeps the boards', () => {
    const ctx = started(10);
    takePath(ctx, 'start:4,6');
    expect(socketGlyph(ctx, 'brawn', 'start:4,6')).toBe(true);
    const spent = ctx.endgame!.nodes.length;
    expect(respecCost(ctx.endgame!)).toBeGreaterThan(0);
    expect(respecMatrix(ctx)).toBe(spent);
    expect(ctx.endgame!.nodes).toEqual([]);
    expect(ctx.endgame!.matrixPoints).toBe(10);
    expect(ctx.endgame!.glyphs.every((g) => g.socket === undefined)).toBe(true);
    expect(ctx.endgame!.boards.map((b) => b.id)).toEqual(['start']);
    expect(respecCost(ctx.endgame!)).toBe(0);
    expect(matrixEffects(ctx.endgame)).toEqual([]);
  });
});

describe('Boards at gates', () => {
  it('attaches a board to an allocated gate and joins the two gates', () => {
    const ctx = started();
    const north = gateId('start', 0);
    expect(attachBoard(ctx, north, 'ash', 0)).toMatchObject({ ok: false, reason: 'gate' });
    takePath(ctx, north);
    expect(attachBoard(ctx, north, 'ash', 0).ok).toBe(true);
    const layout = layoutBoards(ctx.endgame!.boards);
    expect(layout.get('ash')).toMatchObject({ cx: 0, cy: -10, entry: gateId('ash', 2), gate: north });
    expect(neighbors(layout, north)).toContain(gateId('ash', 2));
    expect(neighbors(layout, gateId('ash', 2))).toContain(north);
    // The entry gate can be taken, and the board's nodes beyond it.
    expect(allocateNode(ctx, gateId('ash', 2)).ok).toBe(true);
    expect(allocateNode(ctx, 'ash:4,7').ok).toBe(true);
    // One board per gate, each board once.
    expect(attachBoard(ctx, north, 'forge', 0)).toMatchObject({ ok: false });
    expect(attachBoard(ctx, gateId('start', 1), 'ash', 0)).toMatchObject({ ok: false, reason: 'board' });
    expect(availableBoards(ctx.endgame!)).toEqual(['forge', 'bloom', 'deep']);
  });

  it('rotates so that a different gate of the new board meets the host', () => {
    for (const [deg, side] of [[0, 2], [90, 1], [180, 0], [270, 3]] as const) {
      const ctx = started();
      const north = gateId('start', 0);
      takePath(ctx, north);
      expect(attachBoard(ctx, north, 'ash', deg).ok).toBe(true);
      const layout = layoutBoards(ctx.endgame!.boards);
      const entry = MATRIX_NODES.get(gateId('ash', side))!;
      expect(layout.get('ash')!.entry).toBe(entry.id);
      // The entry cell sits one empty cell beyond the host's gate (start gate N is at 0,-4).
      expect(nodePosition(layout, entry)).toEqual({ x: 0, y: -6 });
      expect(nodePosition(layout, MATRIX_NODES.get(north)!)).toEqual({ x: 0, y: -4 });
    }
  });

  it('turns an untouched board and refuses once it has allocated nodes', () => {
    const ctx = started();
    const north = gateId('start', 0);
    takePath(ctx, north);
    attachBoard(ctx, north, 'ash', 0);
    expect(rotateBoard(ctx, 'ash', 90).ok).toBe(true);
    expect(layoutBoards(ctx.endgame!.boards).get('ash')!.entry).toBe(gateId('ash', 1));
    expect(allocateNode(ctx, gateId('ash', 1)).ok).toBe(true);
    expect(rotateBoard(ctx, 'ash', 0)).toMatchObject({ ok: false, reason: 'locked' });
    expect(detachBoard(ctx, 'ash')).toMatchObject({ ok: false, reason: 'locked' });
    respecMatrix(ctx);
    expect(detachBoard(ctx, 'ash').ok).toBe(true);
    expect(ctx.endgame!.boards.map((b) => b.id)).toEqual(['start']);
  });

  it('refuses a board that would land on another', () => {
    const ctx = started(200);
    // forge north-east via ash (north, then its east side) ...
    takePath(ctx, gateId('start', 0));
    attachBoard(ctx, gateId('start', 0), 'ash', 0);
    takePath(ctx, gateId('ash', 1));
    expect(attachBoard(ctx, gateId('ash', 1), 'forge', 0).ok).toBe(true);
    // ... and bloom east then deep north would be at the same spot.
    takePath(ctx, gateId('start', 1));
    expect(attachBoard(ctx, gateId('start', 1), 'bloom', 0).ok).toBe(true);
    takePath(ctx, gateId('bloom', 0));
    expect(attachBoard(ctx, gateId('bloom', 0), 'deep', 0)).toMatchObject({ ok: false, reason: 'space' });
  });
});

describe('Glyphs', () => {
  it('covers the nodes within radius 3 of its socket on the same board', () => {
    const socket = MATRIX_NODES.get('start:4,6')!;
    const got = new Set(nodesInRadius(socket.id).map((n) => n.id));
    const expected = new Set<string>();
    for (const n of BOARDS.get('start')!.nodes) {
      const d = Math.hypot(n.x - socket.x, n.y - socket.y);
      if (n.id !== socket.id && d <= GLYPH_RADIUS) expected.add(n.id);
    }
    expect(got).toEqual(expected);
    expect(got.has('start:4,3')).toBe(true); // distance 3
    expect(got.has('start:4,2')).toBe(false); // distance 4
    expect(got.has('start:6,5')).toBe(true); // 2.24
    expect(got.has('start:7,7')).toBe(false); // 3.16
  });

  it('scales normal and magic nodes of its family and gives the bonus at the threshold', () => {
    const ctx = started();
    const e = ctx.endgame!;
    const socket = 'start:4,6';
    const inRange = nodesInRadius(socket);
    const strength = inRange.filter((n) => n.kind === 'normal' && (n.effects[0] as { stat: string }).stat === 'strength');
    expect(strength.length).toBeGreaterThan(0);
    // Own every node in range plus the socket (the adjacency rule is tested above).
    e.nodes = [socket, ...inRange.map((n) => n.id)];
    e.glyphs.find((g) => g.id === 'brawn')!.level = 4;
    expect(socketGlyph(ctx, 'brawn', socket)).toBe(true);
    const [report] = glyphReports(e);
    expect(report!.glyph.id).toBe('brawn');
    const attrPoints = strength.reduce((s, n) => s + (n.effects[0] as { value: number }).value, 0);
    expect(report!.attributePoints).toBe(attrPoints);
    expect(report!.bonusActive).toBe(attrPoints >= GLYPH_DEFS.get('brawn')!.threshold);
    const mult = 1 + GLYPH_LEVEL_SCALE * 4;
    for (const n of strength) expect(glyphMultiplier([report!], n.id)).toBeCloseTo(mult);
    // Rare nodes and nodes of other stats are not scaled.
    for (const n of inRange.filter((x) => x.kind === 'rare' || x.kind === 'socket')) expect(glyphMultiplier([report!], n.id)).toBe(1);
    const total = matrixEffects(e)
      .filter((fx) => fx.kind === 'stat' && fx.stat === 'strength')
      .reduce((s, fx) => s + (fx.kind === 'stat' ? (fx.value as number) : 0), 0);
    expect(total).toBeCloseTo(attrPoints * mult, 3);
  });

  it('adds the bonus only while enough of its attribute is in range', () => {
    const ctx = started();
    const e = ctx.endgame!;
    const socket = 'start:4,6';
    const inRange = nodesInRadius(socket);
    const def = GLYPH_DEFS.get('brawn')!;
    const strength = inRange.filter((n) => n.kind === 'normal' && (n.effects[0] as { stat: string }).stat === 'strength');
    let sum = 0;
    const few: string[] = [];
    for (const n of strength) {
      if (sum >= def.threshold) break;
      sum += (n.effects[0] as { value: number }).value;
      few.push(n.id);
    }
    expect(sum).toBeGreaterThanOrEqual(def.threshold);
    socketGlyph(ctx, 'brawn', null);
    e.nodes = [socket, ...few.slice(0, -1)];
    socketGlyph(ctx, 'brawn', socket);
    expect(glyphReports(e)[0]!.bonusActive).toBe(false);
    expect(matrixEffects(e).some((fx) => fx.kind === 'stat' && fx.stat === 'meleeDamage')).toBe(false);
    e.nodes = [socket, ...few];
    expect(glyphReports(e)[0]!.bonusActive).toBe(true);
    expect(matrixEffects(e)).toContainEqual(def.bonus[0]);
  });

  it('sockets one glyph per socket, only in allocated sockets', () => {
    const ctx = started();
    expect(socketGlyph(ctx, 'brawn', 'start:4,6')).toBe(false);
    takePath(ctx, 'start:4,6');
    expect(socketGlyph(ctx, 'brawn', 'start:4,6')).toBe(true);
    expect(socketGlyph(ctx, 'precision', 'start:4,6')).toBe(true);
    expect(ctx.endgame!.glyphs.find((g) => g.id === 'brawn')!.socket).toBeUndefined();
    expect(socketGlyph(ctx, 'nope', 'start:4,6')).toBe(false);
    expect(socketGlyph(ctx, 'precision', 'start:5,4')).toBe(false);
    expect(socketGlyph(ctx, 'precision', null)).toBe(true);
  });

  it('grants glyphs once at level 1', () => {
    const ctx = makeCtx();
    expect(grantGlyph(ctx, 'voltage')).toBe(true);
    expect(grantGlyph(ctx, 'voltage')).toBe(false);
    expect(grantGlyph(ctx, 'unknown')).toBe(false);
    expect(ctx.endgame!.glyphs).toEqual([{ id: 'voltage', level: 1 }]);
  });
});

describe('Glyph upgrades', () => {
  it('always works up to rift level / 5, then falls 25 % per level to a floor', () => {
    expect(glyphUpgradeChance(1, 5)).toBe(1);
    expect(glyphUpgradeChance(20, 100)).toBe(1);
    expect(glyphUpgradeChance(2, 5)).toBeCloseTo(0.75);
    expect(glyphUpgradeChance(3, 5)).toBeCloseTo(0.5);
    expect(glyphUpgradeChance(12, 50)).toBeCloseTo(0.5);
    expect(glyphUpgradeChance(20, 5)).toBe(0.05);
    expect(glyphUpgradeChance(21, 100)).toBeCloseTo(0.75);
  });

  it('raises the level on success and stops at 21', () => {
    const ctx = makeCtx();
    grantGlyph(ctx, 'brawn');
    expect(upgradeGlyph(ctx, 'brawn', 100)).toBe(2);
    expect(upgradeGlyph(ctx, 'unknown', 100)).toBeNull();
    ctx.endgame!.glyphs[0]!.level = GLYPH_MAX_LEVEL;
    expect(upgradeGlyph(ctx, 'brawn', 100)).toBeNull();
    expect(ctx.endgame!.glyphs[0]!.level).toBe(GLYPH_MAX_LEVEL);
  });

  it('fails when the roll misses', () => {
    const ctx = makeCtx();
    grantGlyph(ctx, 'brawn');
    ctx.endgame!.glyphs[0]!.level = 10;
    const rolls: number[] = [];
    ctx.loot.rng = { chance: (p: number) => (rolls.push(p), false) } as unknown as GameContext['loot']['rng'];
    expect(upgradeGlyph(ctx, 'brawn', 10)).toBeNull();
    expect(rolls[0]).toBeCloseTo(0.05);
    expect(ctx.endgame!.glyphs[0]!.level).toBe(10);
  });
});

describe('Stats', () => {
  it('adds allocated nodes to the character through the stat aggregation', () => {
    const cls = classDef('bastion');
    const ctx = started();
    takePath(ctx, 'start:4,6');
    const effects = matrixEffects(ctx.endgame);
    const base = computePlayerStats(cls, 50, {});
    const withMatrix = computePlayerStats(cls, 50, {}, effects);
    const gained = effects.filter((fx) => fx.kind === 'stat');
    expect(gained.length).toBeGreaterThan(0);
    const attrs = ['strength', 'dexterity', 'intelligence', 'willpower'] as const;
    const total = (a: typeof base.attributes) => attrs.reduce((s, k) => s + a[k], 0);
    expect(total(withMatrix.attributes)).toBeGreaterThan(total(base.attributes));
  });

  it('feeds recomputePlayer through the registered provider', () => {
    const world = new World();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const ctx = makeCtx();
    setExtraEffects(() => matrixEffects(ctx.endgame));
    recomputePlayer(world, player);
    const before = world.req(player, DerivedStats).attributes.strength;
    const node = [...MATRIX_NODES.values()].find((n) => n.kind === 'normal' && (n.effects[0] as { stat: string }).stat === 'strength')!;
    ensureEndgame(ctx).nodes = [node.id];
    recomputePlayer(world, player);
    expect(world.req(player, DerivedStats).attributes.strength).toBe(before + (node.effects[0] as { value: number }).value);
  });

  it('turns rare nodes into conditional damage', () => {
    const rare = [...MATRIX_NODES.values()].find((n) => n.kind === 'rare' && n.conditions[0] === 'highLife')!;
    const ctx = makeCtx();
    ensureEndgame(ctx).nodes = [rare.id];
    const fx = matrixEffects(ctx.endgame);
    expect(fx.some((f) => f.kind === 'damage' && f.when === 'highLife')).toBe(true);
    const stats = computePlayerStats(classDef('bastion'), 50, {}, fx);
    expect(stats.combat.additive.some((b) => b.when === 'highLife')).toBe(true);
  });

  it('counts an attacker above 80 % life as highLife', () => {
    const world = new World();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const hp = world.req(player, Health);
    hp.current = hp.max;
    expect(attackerConditions(world, player)).toContain('highLife');
    hp.current = hp.max * 0.8;
    expect(attackerConditions(world, player)).not.toContain('highLife');
  });
});
