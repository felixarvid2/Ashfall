#!/usr/bin/env node
// Headless-browser check kit: `node scripts/e2e/run.mjs --scenario <name> --out <dir> [options]`.
// Prints one JSON summary line; exit code 1 on page errors or a timeout. See README.md.
import { resolve } from 'node:path';
import { hideHud, launch, shot, startGame } from './lib.mjs';

const ARGS = {
  scenario: { value: true }, out: { value: true }, url: { value: true }, viewport: { value: true },
  class: { value: true }, poi: { value: true }, zone: { value: true }, timeout: { value: true }, mobile: {},
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
      if (await page.locator('.touch-close').isVisible().catch(() => false)) await page.tap('.touch-close');
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
    await page.tap('.touch-close').catch(() => {});
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
    await page.evaluate((id) => { const g = window.ashfall; g.ctx.debug.godMode = true; g.enterZone(id, 0, 0); }, id);
    await wait(page, 9000);
    const zoneId = await page.evaluate(() => window.ashfall.zone.def.id);
    if (zoneId !== id) throw new Error(`Expected zone ${id}, now in ${zoneId}`);
    await page.evaluate(() => { const g = window.ashfall; g.killAllEnemies(); g.renderer.rig.zoom(-10); });
    await hideHud(page);
    await wait(page, 4000);
    return { screenshots: [await shot(page, out, `zone-${id}`)], notes: { zone: zoneId } };
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
  landscape: { viewport: '844x390', mobile: true },
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const name = opts.scenario;
  if (!name || !SCENARIOS[name] || !opts.out) {
    console.error(`Usage: run.mjs --scenario <${Object.keys(SCENARIOS).join('|')}> --out <dir> [--url U] [--viewport WxH] [--mobile] [--class bastion|spectre|xenomant] [--poi id] [--zone id] [--timeout seconds]`);
    process.exit(2);
  }
  const out = resolve(opts.out);
  const def = DEFAULTS[name];
  const [width, height] = (opts.viewport ?? def.viewport).split('x').map(Number);
  const mobile = opts.mobile ?? def.mobile;
  const url = opts.url ?? 'http://localhost:5173/';
  const timeoutMs = Number(opts.timeout ?? 300) * 1000;

  const { browser, page, errors } = await launch({ width, height, mobile });
  const summary = { scenario: name, screenshots: [], errors, notes: {} };
  let timer;
  const watchdog = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs); });
  try {
    const start = (extra = {}) => startGame(page, { url, classId: opts.class ?? 'bastion', mobile, ...extra });
    const r = await Promise.race([SCENARIOS[name]({ page, errors, opts, out, start }), watchdog]);
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
