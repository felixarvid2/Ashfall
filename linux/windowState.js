'use strict';
/**
 * Remembers the desktop window's size, position, maximised and fullscreen state between runs (B12). Free of Electron
 * imports: main.js hands in the window and the displays' work areas, so tests/linuxHost.test.ts runs it under Node.
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SIZE = { width: 1600, height: 900 };
const MIN_SIZE = { width: 960, height: 540 };
/** At least this much of the window must lie on a display, or the saved position is dropped (a monitor was unplugged). */
const VISIBLE_MIN = { width: 160, height: 80 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** The saved state from `file`, or null when it is missing or not usable. Never throws. */
function readState(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || !isNum(raw.width) || !isNum(raw.height)) return null;
    const state = { width: Math.round(raw.width), height: Math.round(raw.height), fullscreen: raw.fullscreen === true, maximized: raw.maximized === true };
    if (isNum(raw.x) && isNum(raw.y)) {
      state.x = Math.round(raw.x);
      state.y = Math.round(raw.y);
    }
    return state;
  } catch {
    return null;
  }
}

/** Writes through a temp file and a rename, so a crash never leaves half a file. Returns whether it worked. */
function writeState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Window options for a saved state: size within the minimum and the largest display, and the position only when the
 * window would still be visible on one of the `workAreas` ({ x, y, width, height }).
 */
function fitToDisplays(state, workAreas) {
  const base = state ?? DEFAULT_SIZE;
  const maxW = workAreas.length ? Math.max(...workAreas.map((a) => a.width)) : Infinity;
  const maxH = workAreas.length ? Math.max(...workAreas.map((a) => a.height)) : Infinity;
  const out = {
    width: Math.min(Math.max(base.width, MIN_SIZE.width), Math.max(maxW, MIN_SIZE.width)),
    height: Math.min(Math.max(base.height, MIN_SIZE.height), Math.max(maxH, MIN_SIZE.height)),
  };
  if (state && isNum(state.x) && isNum(state.y)) {
    const visible = workAreas.some((a) => {
      const w = Math.min(state.x + out.width, a.x + a.width) - Math.max(state.x, a.x);
      const h = Math.min(state.y + out.height, a.y + a.height) - Math.max(state.y, a.y);
      return w >= VISIBLE_MIN.width && h >= VISIBLE_MIN.height;
    });
    if (visible) {
      out.x = state.x;
      out.y = state.y;
    }
  }
  return out;
}

/**
 * Follows a window and saves its state shortly after it settles (resize and move fire constantly while dragging) and
 * once more when it closes. `win` needs on(event, fn), getNormalBounds(), isFullScreen(), isMaximized().
 * Fullscreen and maximised windows keep their normal bounds, so leaving them returns to the size you had.
 */
function track(win, file, { delayMs = 500, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  const save = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    try {
      const b = win.getNormalBounds();
      writeState(file, { x: b.x, y: b.y, width: b.width, height: b.height, fullscreen: win.isFullScreen(), maximized: win.isMaximized() });
    } catch {
      // The window is already gone.
    }
  };
  const later = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(save, delayMs);
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, later);
  win.on('close', save);
  return save;
}

module.exports = { DEFAULT_SIZE, MIN_SIZE, readState, writeState, fitToDisplays, track };
