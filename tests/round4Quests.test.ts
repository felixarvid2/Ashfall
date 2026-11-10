// @vitest-environment happy-dom
/** C08 quest pinning: the runtime rules, the save round trip, the tracker's choice of rows and the log's pin button. */
import { describe, expect, it, vi } from 'vitest';
import { createQuestRuntime, MAX_PINNED, saveQuests, setQuestState, togglePinned } from '../src/systems/quests';
import { QuestLog, QuestTracker, visibleQuests, type TrackedQuest, type QuestLogEntry } from '../src/ui/questUi';
import { QUESTS } from '../src/data/quests/db';

const ids = [...QUESTS.keys()].slice(0, 5);

function runtime(active = ids) {
  const rt = createQuestRuntime();
  for (const id of active) rt.active.set(id, { step: 0, progress: 0 });
  rt.tracked = active[0] ?? null;
  return rt;
}

describe('pinning rules (C08)', () => {
  it('pins up to three, refuses a fourth, unpins freely', () => {
    const rt = runtime();
    expect(MAX_PINNED).toBe(3);
    expect(togglePinned(rt, ids[0]!)).toBe(true);
    expect(togglePinned(rt, ids[1]!)).toBe(true);
    expect(togglePinned(rt, ids[2]!)).toBe(true);
    expect(togglePinned(rt, ids[3]!)).toBe(false);
    expect(rt.pinned).toEqual([ids[0], ids[1], ids[2]]);
    expect(togglePinned(rt, ids[1]!)).toBe(true);
    expect(rt.pinned).toEqual([ids[0], ids[2]]);
    expect(togglePinned(rt, ids[3]!)).toBe(true);
  });

  it('cannot pin a quest that is not active', () => {
    const rt = runtime(ids.slice(0, 2));
    expect(togglePinned(rt, ids[4]!)).toBe(false);
  });

  it('saves and restores pins, dropping quests that are gone and old saves without pins', () => {
    const rt = runtime();
    togglePinned(rt, ids[2]!);
    togglePinned(rt, ids[3]!);
    const saved = saveQuests(rt);
    expect(saved.pinned).toEqual([ids[2], ids[3]]);
    const rt2 = createQuestRuntime();
    setQuestState(rt2, { ...saved, active: { [ids[3]!]: { step: 0, progress: 0 } }, tracked: ids[3]! });
    expect(rt2.pinned).toEqual([ids[3]]);
    const rt3 = createQuestRuntime();
    setQuestState(rt3, { active: { [ids[0]!]: { step: 0, progress: 0 } }, done: {}, tracked: null });
    expect(rt3.pinned).toEqual([]);
  });
});

const tq = (id: string, over: Partial<TrackedQuest> = {}): TrackedQuest => ({ id, title: id, step: 'step', kind: 'side', tracked: false, ...over });

describe('tracker rows (C08)', () => {
  it('shows the first three without pins', () => {
    const q = ['a', 'b', 'c', 'd'].map((i, n) => tq(i, { tracked: n === 0 }));
    expect(visibleQuests(q).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('shows only the pinned ones, plus the tracked one, with pins', () => {
    const q = [tq('a', { tracked: true }), tq('b'), tq('c', { pinned: true }), tq('d', { pinned: true })];
    expect(visibleQuests(q).map((x) => x.id)).toEqual(['a', 'c', 'd']);
    const full = [tq('a', { tracked: true }), tq('b', { pinned: true }), tq('c', { pinned: true }), tq('d', { pinned: true })];
    expect(visibleQuests(full).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('renders a pinned class and counts the hidden quests in the chip', () => {
    const root = document.createElement('div');
    const tracker = new QuestTracker(root);
    tracker.update([tq('a', { tracked: true }), tq('b'), tq('c', { pinned: true }), tq('d')]);
    expect(root.querySelectorAll('.quest-row')).toHaveLength(2);
    expect(root.querySelector('.quest-row.pinned')).toBeTruthy();
    expect(root.querySelector('.quest-more')!.textContent).toBe('+2');
  });
});

describe('quest log pin button (C08)', () => {
  function entry(id: string, pinned: boolean): QuestLogEntry {
    return { id, title: id, summary: 's', step: 'x', kind: 'side', level: 1, rewards: 'r', tracked: false, pinned };
  }
  it('has an accessible pin per quest that calls togglePin', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const pinned = new Set<string>();
    const toggle = vi.fn((id: string) => {
      if (pinned.has(id)) pinned.delete(id);
      else pinned.add(id);
      return true;
    });
    const log = new QuestLog(root, () => ({ active: ['q1', 'q2'].map((i) => entry(i, pinned.has(i))), done: [] }), () => {}, { togglePin: toggle });
    log.toggle();
    const pin = root.querySelector<HTMLButtonElement>('[data-testid=log-pin-q1]')!;
    expect(pin.getAttribute('aria-label')).toBeTruthy();
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    pin.click();
    expect(toggle).toHaveBeenCalledWith('q1');
    expect(root.querySelector('[data-testid=log-pin-q1]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
