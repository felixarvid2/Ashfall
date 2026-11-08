/**
 * Settings > Data (round 4 B07, B08, B18): save backups to restore, export and a checked import (the player sees what
 * will change before anything is replaced), and a copyable log of the last console warnings and errors.
 * Built apart from settingsPanel.ts; the panel adds the page and the game supplies the actions.
 */
import { t } from '../data/i18n';
import { zoneDef } from '../data/zones';
import type { SaveBackup } from '../core/save';
import type { ImportCheck, ImportSummary } from '../core/saveImport';
import './dataTab.css';
import { confirmSheet } from './confirmSheet';

export interface DataTabDeps {
  /** Backups of the current character's slot, newest first. */
  backups: () => SaveBackup[];
  /** Puts a backup back (the game reloads the character from it). Returns an error text, or null when it worked. */
  restoreBackup: (stamp: number) => string | null;
  exportSave: () => void;
  /** Checks a file's text without changing anything. */
  checkImport: (json: string) => ImportCheck;
  /** Summary of the running character, for the before/after lines. */
  current: () => ImportSummary | null;
  /** Replaces the running character with an already checked import. Returns an error text, or null. */
  applyImport: (check: Extract<ImportCheck, { ok: true }>) => string | null;
  /** The text of the error log, and a way to put it on the clipboard. */
  logText?: () => string;
  logCount?: () => number;
  copy?: (text: string) => Promise<boolean>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, testid: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'settings-action', label);
  b.type = 'button';
  b.dataset.testid = testid;
  b.addEventListener('click', onClick);
  return b;
}

function zoneName(id: string): string {
  try {
    return t(`zones.${zoneDef(id).key}.name`);
  } catch {
    return id;
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** The lines of a before/after list: only what differs for the import, then what is just worth knowing. */
export function importLines(now: ImportSummary | null, incoming: ImportSummary): { label: string; before?: string; after: string }[] {
  const cls = (s: ImportSummary) => t(`items.classes.${s.classId}`);
  const fmt = (n: number) => n.toLocaleString('en-US');
  const rows: { label: string; before?: string; after: string; value: (s: ImportSummary) => string | number }[] = [
    { label: t('saveData.import.character'), after: '', value: (s) => `${s.name} (${cls(s)})` },
    { label: t('saveData.import.level'), after: '', value: (s) => s.level },
    { label: t('saveData.import.zone'), after: '', value: (s) => zoneName(s.zone) },
    { label: t('saveData.import.gold'), after: '', value: (s) => fmt(s.gold) },
    { label: t('saveData.import.items'), after: '', value: (s) => s.items },
    { label: t('saveData.import.saved'), after: '', value: (s) => when(s.savedAt) },
  ];
  return rows.map((r) => {
    const after = String(r.value(incoming));
    const before = now ? String(r.value(now)) : undefined;
    return before !== undefined && before !== after ? { label: r.label, before, after } : { label: r.label, after };
  });
}

export function buildDataPage(page: HTMLElement, deps: DataTabDeps): () => void {
  const refreshers: (() => void)[] = [];
  const group = (title: string, hint?: string): HTMLElement => {
    const box = el('section', 'settings-group-box');
    box.append(el('h3', 'settings-group', title));
    if (hint) box.append(el('p', 'settings-hint', hint));
    page.append(box);
    return box;
  };
  const status = (): HTMLElement => {
    const p = el('p', 'settings-status');
    p.setAttribute('role', 'status');
    p.setAttribute('aria-live', 'polite');
    return p;
  };

  // ---- Backups (B07) ----
  const backups = group(t('saveData.backups.title'), t('saveData.backups.hint'));
  const list = el('ul', 'backup-list');
  list.dataset.testid = 'backup-list';
  const backupStatus = status();
  backupStatus.dataset.testid = 'backup-status';
  backups.append(list, backupStatus);
  const renderBackups = () => {
    const items = deps.backups();
    list.replaceChildren();
    if (items.length === 0) {
      list.append(Object.assign(el('li', 'backup-empty', t('saveData.backups.none')), {}));
      return;
    }
    for (const b of items) {
      const li = el('li', 'backup-row');
      li.dataset.testid = `backup-${b.stamp}`;
      const label =
        b.level !== undefined
          ? t('saveData.backups.entry', { time: new Date(b.stamp).toLocaleString(), level: b.level, name: b.name ?? '' })
          : t('saveData.backups.unreadable', { time: new Date(b.stamp).toLocaleString() });
      li.append(el('span', 'backup-label', label));
      const restore = button(t('saveData.backups.restore'), `backup-restore-${b.stamp}`, async () => {
        const ok = await confirmSheet({
          title: t('saveData.backups.confirmTitle'),
          body: t('saveData.backups.confirmBody', { time: new Date(b.stamp).toLocaleString() }),
          confirmLabel: t('saveData.backups.restore'),
          danger: true,
        });
        if (!ok) return;
        const err = deps.restoreBackup(b.stamp);
        backupStatus.textContent = err ? t('saveData.backups.failed', { reason: err }) : t('saveData.backups.restored');
        renderBackups();
      });
      if (b.level === undefined) restore.disabled = true;
      li.append(restore);
      list.append(li);
    }
  };
  refreshers.push(renderBackups);

  // ---- Export and import (B08) ----
  const files = group(t('saveData.files.title'), t('saveData.files.hint'));
  const importStatus = status();
  importStatus.dataset.testid = 'import-status';
  const input = el('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.dataset.testid = 'import-file';
  const runImport = async (json: string) => {
    const check = deps.checkImport(json);
    if (!check.ok) {
      importStatus.textContent = t('saveData.import.rejected', { reason: t(`saveData.reasons.${check.key}`) });
      importStatus.classList.add('error');
      return;
    }
    importStatus.classList.remove('error');
    const body = el('div', 'import-summary');
    body.dataset.testid = 'import-summary';
    const dl = el('dl');
    for (const line of importLines(deps.current(), check.summary)) {
      dl.append(el('dt', undefined, line.label), el('dd', line.before ? 'changed' : undefined, line.before ? `${line.before} -> ${line.after}` : line.after));
    }
    body.append(dl);
    if (check.summary.migrated) body.append(el('p', 'settings-hint', t('saveData.import.migrated', { from: check.summary.fromVersion })));
    if (check.summary.dropped > 0) body.append(el('p', 'settings-hint', t('saveData.import.dropped', { count: check.summary.dropped })));
    body.append(el('p', 'settings-hint', t('saveData.import.replaces')));
    const ok = await confirmSheet({ title: t('saveData.import.confirmTitle'), body, confirmLabel: t('saveData.import.confirm'), danger: true });
    if (!ok) {
      importStatus.textContent = t('saveData.import.cancelled');
      return;
    }
    const err = deps.applyImport(check);
    importStatus.textContent = err ? t('saveData.import.failed', { reason: err }) : t('saveData.import.done');
    renderBackups();
  };
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await runImport(await file.text());
    } catch (err) {
      importStatus.textContent = t('saveData.import.rejected', { reason: err instanceof Error ? err.message : String(err) });
      importStatus.classList.add('error');
    }
  });
  files.append(
    button(t('saveData.files.export'), 'data-export', () => deps.exportSave()),
    button(t('saveData.files.import'), 'data-import', () => input.click()),
    input,
    importStatus,
  );

  // ---- Error log (B18) ----
  if (deps.logText && deps.copy) {
    const log = group(t('saveData.log.title'), t('saveData.log.hint'));
    const logStatus = status();
    logStatus.dataset.testid = 'log-status';
    const count = el('p', 'settings-hint');
    count.dataset.testid = 'log-count';
    refreshers.push(() => (count.textContent = t('saveData.log.count', { count: deps.logCount?.() ?? 0 })));
    log.append(
      count,
      button(t('saveData.log.copy'), 'data-copy-log', async () => {
        const ok = await deps.copy!(deps.logText!());
        logStatus.textContent = ok ? t('saveData.log.copied') : t('saveData.log.copyFailed');
      }),
      logStatus,
    );
  }

  const refresh = () => refreshers.forEach((fn) => fn());
  refresh();
  return refresh;
}
