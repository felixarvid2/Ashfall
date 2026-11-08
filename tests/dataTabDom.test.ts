// @vitest-environment happy-dom
/** Settings > Data (round 4 B07, B08, B18) against a real DOM: backups list, restore, checked import, copy log. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { panelStack } from '../src/ui/panelStack';
import { SaveStore, parseSave, serializeSave, BACKUP_EVERY_MS } from '../src/core/save';
import { checkImport, summarizeSave } from '../src/core/saveImport';
import { defaultSettings } from '../src/data/settings';

import { importLines } from '../src/ui/dataTab';
import { SettingsPanel } from '../src/ui/settingsPanel';
import { SoundUi } from '../src/ui/soundPanel';
import { MemoryStorage } from './fixtures/memoryStorage';

const V8 = readFileSync(join(__dirname, 'fixtures/save-v8.json'), 'utf8');
const level = (n: number) => {
  const d = structuredClone(parseSave(V8));
  d.progression.level = n;
  return d;
};

let root: HTMLElement;
let store: SaveStore;
let applied: number[];
let copied: string[];
let panel: SettingsPanel;
const q = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
  // The confirm sheet is one element for the whole page, so the panel stack's root outlives the tests.
  const stackRoot = document.createElement('div');
  document.body.append(stackRoot);
  panelStack.init(stackRoot);
});

beforeEach(() => {
  root?.remove();
  root = document.createElement('div');
  document.body.append(root);
  store = new SaveStore(new MemoryStorage());
  store.write('slot0', level(3), 0);
  store.write('slot0', level(4), BACKUP_EVERY_MS + 1);
  applied = [];
  copied = [];
  const settings = defaultSettings();
  const soundUi = new SoundUi(root, () => settings.audio, { apply: () => {}, save: () => {}, toggleMute: () => {}, muteKey: () => 'N' });
  panel = new SettingsPanel(root, {
    settings: () => settings,
    apply: () => {},
    soundUi,
    toggleMute: () => {},
    data: {
      backups: () => store.backups('slot0'),
      restoreBackup: (stamp) => {
        applied.push(store.restoreBackup('slot0', stamp).progression.level);
        return null;
      },
      exportSave: () => {},
      checkImport,
      current: () => summarizeSave(level(4)),
      applyImport: (c) => {
        applied.push(c.data.progression.level);
        return null;
      },
      logText: () => 'LOG TEXT',
      logCount: () => 7,
      copy: async (text) => {
        copied.push(text);
        return true;
      },
    },
  });
});

describe('Data tab', () => {
  it('adds a Data tab only when the game supplies the actions', () => {
    expect([...root.querySelectorAll('.settings-tab')].map((b) => b.textContent)).toContain('Data');
    panel.show('data');
    expect(panel.tab).toBe('data');
    expect(q('settings-page-data').hidden).toBe(false);
  });

  it('lists the backups and restores one after a confirmation', async () => {
    panel.show('data');
    const rows = root.querySelectorAll('[data-testid^="backup-"][class="backup-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('level 3');
    (rows[0]!.querySelector('button') as HTMLButtonElement).click();
    await flush();
    expect(applied).toEqual([]);
    (document.querySelector('[data-testid="confirm-ok"]') as HTMLButtonElement).click();
    await flush();
    expect(applied).toEqual([3]);
    expect(q('backup-status').textContent).toContain('restored');
  });

  it('shows what an import changes before replacing anything, and rejects a corrupt file in words', async () => {
    panel.show('data');
    const input = q('import-file') as HTMLInputElement;
    const send = async (text: string) => {
      Object.defineProperty(input, 'files', { value: [{ text: async () => text }], configurable: true });
      input.dispatchEvent(new Event('change'));
      await flush();
      await flush();
    };
    await send('{"broken":');
    expect(q('import-status').textContent).toContain('not a save file');
    expect(document.querySelector('[data-testid="confirm-sheet"]:not([hidden])')).toBeNull();
    expect(applied).toEqual([]);

    await send(serializeSave(level(30)));
    const summary = document.querySelector('[data-testid="import-summary"]')!;
    expect(summary.textContent).toContain('4 -> 30');
    expect(applied).toEqual([]);
    (document.querySelector('[data-testid="confirm-ok"]') as HTMLButtonElement).click();
    await flush();
    expect(applied).toEqual([30]);
    expect(q('import-status').textContent).toContain('imported');
  });

  it('cancelling the import changes nothing', async () => {
    panel.show('data');
    const input = q('import-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [{ text: async () => serializeSave(level(9)) }], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    await flush();
    (document.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    await flush();
    expect(applied).toEqual([]);
    expect(q('import-status').textContent).toContain('cancelled');
  });

  it('copies the log', async () => {
    panel.show('data');
    expect(q('log-count').textContent).toContain('7');
    q('data-copy-log').click();
    await flush();
    expect(copied).toEqual(['LOG TEXT']);
    expect(q('log-status').textContent).toContain('copied');
  });
});

describe('import lines', () => {
  it('marks only what differs', () => {
    const lines = importLines(summarizeSave(level(4)), summarizeSave(level(30)));
    expect(lines.find((l) => l.label === 'Level')).toMatchObject({ before: '4', after: '30' });
    expect(lines.find((l) => l.label === 'Gold')!.before).toBeUndefined();
  });
});

