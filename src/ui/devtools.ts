/** Developer tools: FPS meter and a toggleable debug panel (F3). */
import { t } from '../data/i18n';
import type { MoveMode, Settings } from '../data/settings';

export interface DebugInfo {
  entities: number;
  drawCalls: number;
  triangles: number;
  position: { x: number; z: number };
  seed: string;
  tick: number;
  enemies: number;
  wave: number;
  kills: number;
}

export interface DebugActions {
  save(): void;
  load(): void;
  exportSave(): void;
  importSave(json: string): void;
  deleteSave(): void;
  setMoveMode(mode: MoveMode): void;
  nextWave(): void;
  killAll(): void;
  spawnHorde(): void;
  setGodMode(on: boolean): void;
  setScreenShake(on: boolean): void;
  setGraphics(quality: Settings['graphics']): void;
  addLevel(): void;
  spawnLoot(): void;
  switchCharacter(): void;
  /** Extra buttons (region test helpers). */
  extra?: { label: string; run: () => void; id: string }[];
}

export class DevTools {
  private readonly fpsEl: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly values = new Map<string, HTMLElement>();
  private readonly moveSelect: HTMLSelectElement;
  private frames = 0;
  private elapsed = 0;
  private worstFrame = 0;
  fps = 0;
  frameMs = 0;

  constructor(
    root: HTMLElement,
    actions: DebugActions,
    showFps: boolean,
    screenShake: boolean,
    graphics: Settings['graphics'],
  ) {
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps-meter';
    this.fpsEl.hidden = !showFps;

    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;

    const h2 = document.createElement('h2');
    h2.textContent = t('debug.title');
    const dl = document.createElement('dl');
    for (const key of ['fps', 'frameTime', 'entities', 'enemies', 'wave', 'kills', 'drawCalls', 'triangles', 'position', 'seed', 'tick']) {
      const dt = document.createElement('dt');
      dt.textContent = t(`debug.${key}`);
      const dd = document.createElement('dd');
      dd.textContent = '–';
      this.values.set(key, dd);
      dl.append(dt, dd);
    }

    const moveLabel = document.createElement('label');
    moveLabel.textContent = t('debug.moveMode');
    this.moveSelect = document.createElement('select');
    for (const mode of ['wasd', 'click'] as const) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = t(`moveMode.${mode}`);
      this.moveSelect.appendChild(opt);
    }
    this.moveSelect.addEventListener('change', () => {
      actions.setMoveMode(this.moveSelect.value as MoveMode);
      this.moveSelect.blur();
    });
    moveLabel.appendChild(this.moveSelect);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) actions.importSave(await file.text());
      fileInput.value = '';
    });

    const checkbox = (label: string, initial: boolean, onChange: (on: boolean) => void) => {
      const l = document.createElement('label');
      l.textContent = label;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = initial;
      box.addEventListener('change', () => {
        onChange(box.checked);
        box.blur();
      });
      l.appendChild(box);
      return l;
    };
    const gfxLabel = document.createElement('label');
    gfxLabel.textContent = t('debug.graphics');
    const gfx = document.createElement('select');
    for (const q of ['low', 'medium', 'high'] as const) {
      gfx.appendChild(Object.assign(document.createElement('option'), { value: q, textContent: t(`debug.quality.${q}`) }));
    }
    gfx.value = graphics;
    gfx.addEventListener('change', () => {
      actions.setGraphics(gfx.value as Settings['graphics']);
      gfx.blur();
    });
    gfxLabel.appendChild(gfx);
    const godLabel = checkbox(t('debug.godMode'), false, actions.setGodMode);
    const shakeLabel = checkbox(t('debug.screenShake'), screenShake, actions.setScreenShake);

    const combatRow = document.createElement('div');
    combatRow.className = 'row';
    const row = document.createElement('div');
    row.className = 'row';
    let target = combatRow;
    const button = (label: string, onClick: () => void, testId: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.testid = testId;
      b.addEventListener('click', () => {
        onClick();
        b.blur();
      });
      target.appendChild(b);
    };
    button(t('debug.nextWave'), actions.nextWave, 'debug-next-wave');
    button(t('debug.killAll'), actions.killAll, 'debug-kill-all');
    button(t('debug.spawnHorde'), actions.spawnHorde, 'debug-spawn-horde');
    button(t('debug.addLevel'), actions.addLevel, 'debug-add-level');
    button(t('debug.spawnLoot'), actions.spawnLoot, 'debug-spawn-loot');
    target = row;
    button(t('debug.save'), actions.save, 'debug-save');
    button(t('debug.load'), actions.load, 'debug-load');
    button(t('debug.export'), actions.exportSave, 'debug-export');
    button(t('debug.import'), () => fileInput.click(), 'debug-import');
    button(t('debug.deleteSave'), actions.deleteSave, 'debug-delete');
    button(t('debug.switchCharacter'), actions.switchCharacter, 'debug-switch-character');

    const regionRow = document.createElement('div');
    regionRow.className = 'row';
    target = regionRow;
    for (const x of actions.extra ?? []) button(x.label, x.run, x.id);

    this.panel.append(h2, dl, moveLabel, gfxLabel, godLabel, shakeLabel, combatRow, row, regionRow, fileInput);
    root.append(this.fpsEl, this.panel);
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
  }

  get panelOpen(): boolean {
    return !this.panel.hidden;
  }

  setMoveMode(mode: MoveMode): void {
    this.moveSelect.value = mode;
  }

  /** Call once per rendered frame with real elapsed seconds. */
  frame(frameDt: number, info: () => DebugInfo): void {
    this.frames++;
    this.elapsed += frameDt;
    this.worstFrame = Math.max(this.worstFrame, frameDt);
    if (this.elapsed < 0.5) return;
    this.fps = this.frames / this.elapsed;
    this.frameMs = (this.elapsed / this.frames) * 1000;
    this.fpsEl.textContent = `${this.fps.toFixed(0)} FPS · ${this.frameMs.toFixed(1)} ms (max ${(this.worstFrame * 1000).toFixed(0)})`;
    if (!this.panel.hidden) {
      const d = info();
      this.set('fps', this.fps.toFixed(1));
      this.set('frameTime', `${this.frameMs.toFixed(2)} ms`);
      this.set('entities', d.entities);
      this.set('drawCalls', d.drawCalls);
      this.set('triangles', d.triangles.toLocaleString('en-US'));
      this.set('position', `${d.position.x.toFixed(1)}, ${d.position.z.toFixed(1)}`);
      this.set('seed', d.seed);
      this.set('tick', d.tick);
      this.set('enemies', d.enemies);
      this.set('wave', d.wave);
      this.set('kills', d.kills);
    }
    this.frames = 0;
    this.elapsed = 0;
    this.worstFrame = 0;
  }

  private set(key: string, value: string | number): void {
    const el = this.values.get(key);
    if (el) el.textContent = String(value);
  }
}
