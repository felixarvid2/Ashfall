// Shared helpers for the headless-browser checks (see README.md). Plain JS on purpose: tsc must not care.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const CHROMIUM_DEFAULTS = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'];

/** Chromium is preinstalled (no playwright download): env CHROMIUM_PATH, else the known locations. */
export function chromiumPath() {
  const p = process.env.CHROMIUM_PATH ?? CHROMIUM_DEFAULTS.find((c) => existsSync(c));
  if (!p) throw new Error('No Chromium found: set CHROMIUM_PATH');
  return p;
}

/**
 * Starts Chromium with software WebGL (no GPU in the sandbox) and opens one page.
 * Returns { browser, page, errors }; `errors` collects uncaught page errors.
 */
export async function launch({ width = 1100, height = 760, mobile = false } = {}) {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A fresh save every run (no saved characters in slot 0).
  await page.addInitScript(() => localStorage.clear());
  return { browser, page, errors, mobile };
}

/**
 * Opens the game with ?debug, creates a character in slot 0 and waits for the simulation to run.
 * `window.ashfall` (the Game) is then available. Taps on mobile, clicks otherwise.
 */
export async function startGame(page, { url = 'http://localhost:5173/', classId = 'bastion', mobile = false, onSelect } = {}) {
  const press = (sel) => (mobile ? page.tap(sel) : page.click(sel));
  await page.goto(url + (url.includes('?') ? '&debug' : '?debug'));
  await page.waitForSelector('[data-testid=slot-0]', { timeout: 180000 });
  await press('[data-testid=slot-0]');
  await press(`[data-testid=class-${classId}]`);
  if (onSelect) await onSelect();
  await press('[data-testid=char-create]');
  await page.waitForFunction(() => window.ashfall?.ctx.tick > 30, null, { timeout: 90000 });
}

export const DEFAULT_HUD = '.hud, .quest-tracker, .region-card, .minimap, .loot-label';

/** Hides HUD elements so a screenshot shows only the world. */
export async function hideHud(page, selectors = DEFAULT_HUD) {
  await page.evaluate((sel) => document.querySelectorAll(sel).forEach((e) => (e.style.display = 'none')), selectors);
}

/** Screenshots into outDir (created if missing) and returns the file path. */
export async function shot(page, outDir, name) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}
