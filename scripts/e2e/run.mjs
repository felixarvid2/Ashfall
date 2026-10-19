#!/usr/bin/env node
// Headless-browser check kit: `node scripts/e2e/run.mjs --scenario <name> --out <dir> [options]`.
// Prints one JSON summary line; exit code 1 on page errors or a timeout. See README.md.
import { resolve } from 'node:path';
import { hideHud, launch, shot, startGame } from './lib.mjs';

const ARGS = {
  scenario: { value: true }, out: { value: true }, url: { value: true }, viewport: { value: true },
  class: { value: true }, poi: { value: true }, zone: { value: true }, at: { value: true }, timeout: { value: true }, mobile: {},
};

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(.+)$/.exec(argv[i]);
    const spec = m && ARGS[m[1]];
    if (!spec) throw new Error(`Unknown argument: ${argv[i]}`);
    o[m[1]] = spec.value ? argv[++i] : true;
  }
  return o;
}

const wait = (page, ms) => page.waitForTimeout(ms);

/** Each scenario gets { page, errors, opts, out } and returns { screenshots, notes }. */
const SCENARIOS = {
  async boot({ page, opts, out, start }) {
    const screenshots = [];
    await start({ onSelect: async () => screenshots.push(await shot(page, out, 'boot-class')) });
    await wait(page, 3000);
    screenshots.push(await shot(page, out, 'boot-hud'));
    return { screenshots, notes: { fps: await page.evaluate(() => document.querySelector('.fps-meter')?.textContent ?? null) } };
  },

  async portrait({ page, out, start }) {
    const screenshots = [];
    await start();
    await wait(page, 2000);
    await page.evaluate(() => { window.ashfall.ctx.debug.godMode = true; });
    screenshots.push(await shot(page, out, 'portrait-hud'));
    const panelsAfterClose = {};
    for (const [id, name] of [['inventory', 'inv'], ['skills', 'skills'], ['map', 'map'], ['quests', 'quests']]) {
      await page.tap(`[data-testid=touch-menu-${id}]`);
      await wait(page, 1000);
      screenshots.push(await shot(page, out, `portrait-${name}`));
      const close = page.locator('.panel:not([hidden]) [data-testid=panel-close]').first();
      if (await close.isVisible().catch(() => false)) await close.tap();
      await wait(page, 800);
      panelsAfterClose[id] = await page.evaluate(() => [...document.querySelectorAll('.panel:not([hidden])')].map((e) => e.className));
    }
    const slots = await page.evaluate(() => [...document.querySelectorAll('.slots .slot')].map((e) => {
      const b = e.getBoundingClientRect();
      return { display: getComputedStyle(e).display, rect: [b.left, b.top, b.right, b.bottom].map(Math.round) };
    }));
    return { screenshots, notes: { slots, panelsAfterClose } };
  },

  async tooltip({ page, out, start }) {
    const screenshots = [];
    await start();
    await wait(page, 2000);
    const tip = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.item-tooltip')].find((e) => !e.hidden);
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { class: t.className, rect: [r.left, r.top, r.width, r.height].map(Math.round) };
    });
    const notes = {};
    await page.tap('[data-testid=touch-menu-inventory]');
    await wait(page, 800);
    const cells = page.locator('.inventory-panel .inv-cell:has(img)');
    notes.equippedCells = await cells.count();
    await cells.first().tap();
    await wait(page, 600);
    screenshots.push(await shot(page, out, 'tooltip-item'));
    notes.itemTooltip = await tip();
    await page.locator('.panel:not([hidden]) [data-testid=panel-close]').first().tap().catch(() => {});
    await wait(page, 500);
    await page.tap('[data-testid=touch-menu-skills]');
    await wait(page, 800);
    await page.locator('.tree-nodes > *').nth(5).tap();
    await wait(page, 600);
    screenshots.push(await shot(page, out, 'tooltip-node'));
    notes.nodeTooltip = await tip();
    return { screenshots, notes };
  },

  async instance({ page, out, opts, start }) {
    const id = opts.poi ?? 'dungeon.drainage';
    await start();
    const known = await page.evaluate(() => window.ashfall.zone.def.pois.filter((p) => p.kind === 'dungeon' || p.kind === 'bunker').map((p) => p.id));
    if (!known.includes(id)) throw new Error(`Unknown --poi ${id}; this zone has: ${known.join(', ')}`);
    await page.evaluate((id) => { const g = window.ashfall; g.ctx.debug.godMode = true; g.enterInstance(id); }, id);
    await wait(page, 5000);
    const inInstance = await page.evaluate(() => !!window.ashfall.ctx.instance);
    await hideHud(page, '.quest-tracker, .region-card');
    const screenshots = [await shot(page, out, `instance-${id}`)];
    await page.evaluate(() => window.ashfall.exitInstance());
    await wait(page, 2000);
    const exited = await page.evaluate(() => !window.ashfall.ctx.instance);
    if (!inInstance || !exited) throw new Error(`enterInstance(${id}) did not enter (${inInstance}) or exit (${exited})`);
    return { screenshots, notes: { poi: id, availablePois: known } };
  },

  async zone({ page, out, opts, start }) {
    const id = opts.zone;
    if (!id) throw new Error('--zone <id> is required (e.g. zone.deep_mines)');
    await start();
    // --at x,z: where to stand (metres; default 0,0). The Core: the Gardens are around -460,200, the Heart at 0,620.
    const [ax = 0, az = 0] = (opts.at ?? '0,0').split(',').map(Number);
    await page.evaluate(([id, x, z]) => { const g = window.ashfall; g.ctx.debug.godMode = true; g.enterZone(id, x, z); }, [id, ax, az]);
    await wait(page, 9000);
    const zoneId = await page.evaluate(() => window.ashfall.zone.def.id);
    if (zoneId !== id) throw new Error(`Expected zone ${id}, now in ${zoneId}`);
    await page.evaluate(() => { const g = window.ashfall; g.killAllEnemies(); g.renderer.rig.zoom(-10); });
    await hideHud(page);
    await wait(page, 4000);
    return { screenshots: [await shot(page, out, `zone-${id}`)], notes: { zone: zoneId } };
  },

  async audio({ page, out, start, mobile }) {
    const screenshots = [];
    const notes = { notFound: [] };
    page.on('response', (r) => { if (r.url().includes('/assets/audio/') && r.status() >= 400) notes.notFound.push(`${r.status()} ${r.url()}`); });
    const dbg = () => page.evaluate(() => window.ashfall.audioDebug);
    await start();
    await wait(page, 3000);
    notes.afterStart = await dbg();
    await page.evaluate(() => { const g = window.ashfall; g.ctx.debug.godMode = true; g.spawnHorde(8); });
    await wait(page, 8000);
    await page.evaluate(() => window.ashfall.killAllEnemies());
    await wait(page, 2000);
    notes.afterFight = await dbg();
    await hideHud(page, '.fps-meter, .debug-panel');
    screenshots.push(await shot(page, out, 'audio-hud'));
    const open = mobile ? '[data-testid=touch-menu-sound-settings]' : '[data-testid=sound-open]';
    if (mobile) await page.tap('[data-testid=touch-menu-more]'); // sound lives in the overflow popover
    await (mobile ? page.tap(open) : page.click(open));
    await wait(page, 800);
    screenshots.push(await shot(page, out, 'audio-panel'));
    // The volume sliders are the Sound tab of the settings panel.
    await page.evaluate(() => document.querySelector('.settings-panel')?.getBoundingClientRect()).then((r) => { notes.panelRect = r && [r.left, r.top, r.right, r.bottom].map(Math.round); });
    notes.panelSliders = await page.evaluate(() => document.querySelectorAll('.settings-panel input[type=range]').length);
    const closeSettings = '.settings-panel [data-testid=panel-close]';
    await (mobile ? page.tap(closeSettings) : page.click(closeSettings)).catch(() => {});
    await wait(page, 500);
    await page.evaluate(() => { const g = window.ashfall; g.enterZone('zone.deep_mines', 0, 0); });
    await wait(page, 9000);
    notes.deepMines = await dbg();
    const mute = mobile ? '[data-testid=touch-menu-sound]' : '[data-testid=sound-mute]';
    if (mobile) await page.tap('[data-testid=touch-menu-more]');
    await (mobile ? page.tap(mute) : page.click(mute));
    await wait(page, 500);
    notes.muted = (await dbg()).muted;
    notes.stored = await page.evaluate(() => localStorage.getItem('ashfall.settings'));
    screenshots.push(await shot(page, out, 'audio-muted'));
    await page.reload();
    await page.waitForSelector('[data-testid=slot-0]', { timeout: 180000 });
    notes.storedAfterReload = await page.evaluate(() => localStorage.getItem('ashfall.settings'));
    return { screenshots, notes };
  },

  /** Panel framework: header close, Back, tab bar, swipe down, settings, confirm sheet (phone portrait). */
  async panels({ page, out, start }) {
    const screenshots = [];
    const notes = {};
    await start();
    await wait(page, 2000);
    const state = () => page.evaluate(() => ({
      root: document.querySelector('#ui').className,
      open: [...document.querySelectorAll('.panel:not([hidden])')].map((e) => e.dataset.panel ?? e.className),
      closes: [...document.querySelectorAll('.panel:not([hidden]) .panel-close')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
    }));
    await page.tap('[data-testid=touch-menu-inventory]');
    await wait(page, 1500);
    notes.inventory = await state();
    screenshots.push(await shot(page, out, 'panels-inventory'));
    await page.goBack();
    await wait(page, 1000);
    notes.afterBack = await state();
    await page.tap('[data-testid=touch-menu-inventory]');
    await wait(page, 1000);
    await page.tap('[data-testid=panel-tab-skills]');
    await wait(page, 1000);
    notes.afterTab = await state();
    screenshots.push(await shot(page, out, 'panels-skills'));
    await page.locator('.panel:not([hidden]) [data-testid=panel-close]').first().tap();
    await wait(page, 1000);
    notes.afterClose = await state();
    await page.tap('[data-testid=touch-menu-more]');
    await page.tap('[data-testid=touch-menu-sound-settings]');
    await wait(page, 1000);
    notes.settings = await state();
    screenshots.push(await shot(page, out, 'panels-settings'));
    await page.tap('[data-testid=settings-tab-display]');
    screenshots.push(await shot(page, out, 'panels-settings-display'));
    await page.keyboard.press('Escape');
    await wait(page, 800);
    notes.afterEscape = await state();
    return { screenshots, notes };
  },

  async landscape({ page, out, start }) {
    await start();
    await page.evaluate(() => { const g = window.ashfall; g.ctx.debug.godMode = true; g.killAllEnemies(); });
    await wait(page, 3000);
    return { screenshots: [await shot(page, out, 'landscape-hud')], notes: {} };
  },
};

// Per-scenario defaults; --viewport and --mobile override them.
const DEFAULTS = {
  boot: { viewport: '1100x760', mobile: false },
  portrait: { viewport: '390x844', mobile: true },
  tooltip: { viewport: '390x844', mobile: true },
  instance: { viewport: '1100x760', mobile: false },
  zone: { viewport: '1100x760', mobile: false },
  panels: { viewport: '390x844', mobile: true },
  landscape: { viewport: '844x390', mobile: true },
  audio: { viewport: '1280x720', mobile: false },
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const name = opts.scenario;
  if (!name || !SCENARIOS[name] || !opts.out) {
    console.error(`Usage: run.mjs --scenario <${Object.keys(SCENARIOS).join('|')}> --out <dir> [--url U] [--viewport WxH] [--mobile] [--class bastion|spectre|xenomant] [--poi id] [--zone id] [--at x,z] [--timeout seconds]`);
    process.exit(2);
  }
  const out = resolve(opts.out);
  const def = DEFAULTS[name];
  const [width, height] = (opts.viewport ?? def.viewport).split('x').map(Number);
  const mobile = opts.mobile ?? def.mobile;
  const url = opts.url ?? 'http://localhost:5173/';
  const timeoutMs = Number(opts.timeout ?? 300) * 1000;

  const { browser, page, errors } = await launch({ width, height, mobile, autoplay: name === 'audio' });
  const summary = { scenario: name, screenshots: [], errors, notes: {} };
  let timer;
  const watchdog = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs); });
  try {
    const start = (extra = {}) => startGame(page, { url, classId: opts.class ?? 'bastion', mobile, ...extra });
    const r = await Promise.race([SCENARIOS[name]({ page, errors, opts, out, start, mobile }), watchdog]);
    summary.screenshots = r.screenshots;
    summary.notes = r.notes;
  } catch (e) {
    errors.push(`scenario: ${e.message}`);
    // Keep the evidence of where it died.
    summary.screenshots.push(await shot(page, out, `${name}-failure`).catch(() => null));
    summary.screenshots = summary.screenshots.filter(Boolean);
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => {});
  }
  console.log(JSON.stringify(summary));
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
