'use strict';
/**
 * Ashfall desktop shell (Ubuntu/Debian package, docs/linux.md): a plain Electron window around the Vite web build.
 * The build is served from resources/app/www through a privileged custom scheme, `app://ashfall/`, never file://
 * (ES modules, fetch and localStorage break there). The origin is fixed, so saves in localStorage persist.
 */
const { app, BrowserWindow, Menu, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileResponse, resolveAppPath } = require('./serve.js');
const windowState = require('./windowState.js');

const ORIGIN = 'app://ashfall';
const WWW = path.join(__dirname, 'www');

// Must run before `ready`. standard + secure give the page a real origin (localStorage, fetch, ES modules);
// stream is needed for audio/video range requests.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // Music and effects start without waiting for a click on this origin.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  // Machines without a usable GPU driver (VMs, remote desktops) fall back to software WebGL instead of a black window.
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');

  app.whenReady().then(() => {
    protocol.handle('app', serve);
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}

/** protocol.handle callback: the file as a stream, with byte ranges answered as 206 + Content-Range (media seeking, B11). */
async function serve(request) {
  const file = resolveAppPath(WWW, request.url);
  if (!file) return new Response('Bad request', { status: 400 });
  try {
    if (!fs.statSync(file).isFile()) return new Response('Not found', { status: 404 });
    return fileResponse(file, request.headers.get('range'));
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function isAppUrl(url) {
  return url === ORIGIN || url.startsWith(ORIGIN + '/');
}

function openExternal(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

function createWindow() {
  // Size, position and fullscreen come back as they were left (B12); a position on a vanished monitor is dropped.
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const saved = windowState.readState(stateFile);
  const bounds = windowState.fitToDisplays(saved, screen.getAllDisplays().map((d) => d.workArea));
  win = new BrowserWindow({
    ...bounds,
    minWidth: windowState.MIN_SIZE.width,
    minHeight: windowState.MIN_SIZE.height,
    title: 'Ashfall',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0b0b0c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.removeMenu();
  windowState.track(win, stateFile);
  win.once('ready-to-show', () => {
    if (saved?.maximized) win.maximize();
    win.show();
    if (saved?.fullscreen) win.setFullScreen(true);
  });
  win.on('closed', () => {
    win = null;
  });

  const wc = win.webContents;
  // The page title is "Ashfall" already; keep it that way whatever the game sets.
  wc.on('page-title-updated', (event) => event.preventDefault());
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  // Links out of the game open in the system browser; the window never leaves the app origin.
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  win.loadURL(ORIGIN + '/');
}
