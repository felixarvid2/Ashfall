# Ubuntu/Debian package

Ashfall installs on Ubuntu and Debian (amd64) as a desktop app: a plain Electron window around the same web build
as the browser version. Gamepads work through the browser Gamepad API, nothing special is needed.

## What the package installs

- `/opt/ashfall/` the Electron runtime (binary renamed to `ashfall`, only the en-US locale pack) and
  `resources/app/{main.js,serve.js,package.json,icon.png,www/}`; `www/` is the Vite build without source maps.
- `/usr/bin/ashfall` a symlink to `/opt/ashfall/ashfall`.
- `/usr/share/applications/ashfall.desktop` (Name Ashfall, `Exec=ashfall %U`, categories Game;ActionGame;RolePlaying).
- `/usr/share/icons/hicolor/{256x256,512x512}/apps/ashfall.png` cut from the title art (`public/assets/art/menu/title.webp`).
- `/usr/share/doc/ashfall/{copyright,changelog.gz,credits.md}`.
- Depends on the usual Electron libraries (GTK 3, NSS, GBM, ALSA, libxss, libxtst, libnotify, libsecret, AT-SPI,
  libdrm, xdg-utils). `postinst` sets `/opt/ashfall/chrome-sandbox` to `root:root 4755` (Electron's SUID sandbox,
  needed where unprivileged user namespaces are restricted, e.g. Ubuntu 24.04).

## The shell (`linux/`)

- `main.js` a 1600x900 resizable window titled "Ashfall", no menu bar, F11 toggles fullscreen, single instance
  (a second launch focuses the first), links to http(s)/mailto open in the system browser, the window never
  navigates away from the app. `contextIsolation` and `sandbox` are on, `nodeIntegration` off, no preload.
- The game is never loaded from `file://` (ES modules, fetch and localStorage break there). `main.js` registers the
  privileged scheme `app://` (standard, secure, fetch, CORS, stream) and `protocol.handle` serves
  `resources/app/www` on `app://ashfall/`. The origin is fixed, so saves in `localStorage` persist
  (`~/.config/Ashfall/`). Byte ranges (audio) are kept, the Content-Type comes from the extension.
- `serve.js` holds the pure parts (URL to file with a path-traversal guard, extension to MIME type); tests/linuxHost.test.ts
  covers them. Add an extension there when the game starts shipping a new file type.
- Software WebGL (SwiftShader) is allowed as a fallback, so the game also starts on machines without a GPU driver.

## Build

```
npm ci
npm run build:deb                       # version of the newest docs/releases/vX.Y.Z.md
npm run build:deb -- --version 1.4.2    # or an explicit one (the release workflow passes the tag without the v)
```

`scripts/linux/build.ts` runs `vite build` into `dist-linux/stage/www`, copies the Electron runtime from
`node_modules/electron/dist`, writes the icons with sharp, assembles the tree in `dist-linux/pkg/`, writes `DEBIAN/`
and calls `dpkg-deb --root-owner-group -Zxz --build`. Output: `dist-linux/ashfall_<version>_amd64.deb` (about 144 MB;
`dist-linux/` is gitignored). It needs `dpkg-deb`, which every Debian/Ubuntu machine has, including `ubuntu-latest`.

Electron is a devDependency pinned to an exact version (45.0.0). Since Electron 45 `npm ci` no longer downloads the
binary; `build.ts` runs `node_modules/electron/install.js` when `dist/` is missing, which uses `@electron/get`
(cache in `~/.cache/electron`, `ELECTRON_MIRROR` honoured). In a sandbox with an HTTPS proxy Node's fetch needs
`NODE_USE_ENV_PROXY=1`, which the script sets by default. Build on Linux x64: the runtime is for the build machine.

The release workflow runs `npm run build:deb -- --version "${TAG#v}"` after the Android step and attaches the file as
`ashfall-vX.Y.Z-ubuntu-amd64.deb`.

## Install and remove

```
sudo apt install ./ashfall-vX.Y.Z-ubuntu-amd64.deb     # pulls in the dependencies; start it from the menu or with `ashfall`
sudo apt remove ashfall                                # saves in ~/.config/Ashfall stay; delete that folder to reset
```

## Checks

lintian reports no error that matters for a private package: the remaining ones are `dir-or-file-in-opt`,
`embedded-library` and `shared-library-is-executable` from the bundled Chromium, and `section-games-but-contains-no-game`.
Headless smoke test (as root add `--no-sandbox`):
`xvfb-run -a ashfall --no-sandbox --remote-debugging-port=9333`, then `chromium.connectOverCDP('http://localhost:9333')`
from Playwright and wait for `.char-select`.
