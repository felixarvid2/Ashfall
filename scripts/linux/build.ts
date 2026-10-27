/**
 * npm run build:deb [-- --version 1.4.2] — the web build inside an Electron shell as dist-linux/ashfall_<version>_amd64.deb.
 * Assembled by hand (no electron-builder): /opt/ashfall holds the Electron runtime renamed to `ashfall` plus
 * resources/app/{main.js,package.json,www/}; see docs/linux.md. Needs dpkg-deb (any Debian/Ubuntu runner has it).
 */
import { execFileSync, execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import {
  chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';

const root = new URL('../..', import.meta.url).pathname;
const run = (cmd: string, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const out = join(root, 'dist-linux');
const stage = join(out, 'stage');
const pkg = join(out, 'pkg');
const opt = join(pkg, 'opt/ashfall');
const app = join(opt, 'resources/app');

/** `--version X` or `--version=X`; default is the newest docs/releases/vX.Y.Z.md. */
function pickVersion(): string {
  const args = process.argv.slice(2);
  let v: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--version') v = args[++i];
    else if (a.startsWith('--version=')) v = a.slice('--version='.length);
  }
  if (!v) {
    const tags = readdirSync(join(root, 'docs/releases'))
      .map((f) => /^v(\d+)\.(\d+)\.(\d+)\.md$/.exec(f))
      .filter((m): m is RegExpExecArray => !!m)
      .sort((a, b) => [1, 2, 3].map((i) => Number(a[i]) - Number(b[i])).find((d) => d !== 0) ?? 0);
    const last = tags[tags.length - 1];
    if (!last) throw new Error('No docs/releases/vX.Y.Z.md to take a version from; pass --version X.Y.Z');
    v = `${last[1]}.${last[2]}.${last[3]}`;
  }
  v = v.replace(/^v/, '');
  if (!/^\d+(\.\d+)*([-+~][A-Za-z0-9.+~]+)?$/.test(v)) throw new Error(`Not a valid Debian version: '${v}'`);
  return v;
}

const version = pickVersion();
console.log(`Ashfall ${version} -> dist-linux/ashfall_${version}_amd64.deb`);
if (process.platform !== 'linux') console.warn('Not on Linux: the Electron runtime downloaded here would be for this platform. Build on Linux x64.');

rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// 1. The web build (vite.config.ts has base './'); source maps are not needed on a desktop install.
const www = join(stage, 'www');
run(`npx vite build --outDir "${www}" --emptyOutDir --sourcemap false`);
const dropMaps = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) dropMaps(path);
    else if (name.endsWith('.map')) rmSync(path);
  }
};
dropMaps(www);

// 2. The Electron runtime. Electron 45 has no postinstall; its binary is fetched by install.js into
// node_modules/electron/dist (cached by @electron/get, honours ELECTRON_MIRROR). NODE_USE_ENV_PROXY lets Node's
// fetch follow HTTPS_PROXY in sandboxes that have one; it does nothing elsewhere.
const electronDir = join(root, 'node_modules/electron');
const dist = join(electronDir, 'dist');
if (!existsSync(join(dist, 'electron'))) {
  execFileSync(process.execPath, [join(electronDir, 'install.js')], {
    cwd: electronDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? '1' },
  });
}
if (!existsSync(join(dist, 'electron'))) throw new Error(`Electron binary missing in ${dist}`);
mkdirSync(opt, { recursive: true });
cpSync(dist, opt, { recursive: true });
renameSync(join(opt, 'electron'), join(opt, 'ashfall'));
rmSync(join(opt, 'resources/default_app.asar'), { force: true });
// The game is English only: keep Chromium's en-US strings, drop the other ~55 locale packs (about 40 MB).
for (const f of readdirSync(join(opt, 'locales'))) if (f !== 'en-US.pak') rmSync(join(opt, 'locales', f));

// 3. The app: shell code, the version, the web build.
mkdirSync(app, { recursive: true });
for (const f of ['main.js', 'serve.js']) cpSync(join(root, 'linux', f), join(app, f));
const shellPkg = JSON.parse(readFileSync(join(root, 'linux/package.json'), 'utf8')) as Record<string, unknown>;
writeFileSync(join(app, 'package.json'), JSON.stringify({ ...shellPkg, version }, null, 2) + '\n');
cpSync(www, join(app, 'www'), { recursive: true });

// 4. Icons from the title art: the square around the planet and the soldier, rounded corners.
const art = join(root, 'public/assets/art/menu/title.webp');
const icon = async (size: number): Promise<Buffer> => {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.18}"/></svg>`);
  return sharp(art)
    .extract({ left: 280, top: 0, width: 720, height: 720 })
    .resize(size, size)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};
for (const size of [256, 512]) {
  const dir = join(pkg, `usr/share/icons/hicolor/${size}x${size}/apps`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ashfall.png'), await icon(size));
}
writeFileSync(join(app, 'icon.png'), await icon(256));

// 5. Launcher, desktop entry, docs.
mkdirSync(join(pkg, 'usr/bin'), { recursive: true });
symlinkSync('/opt/ashfall/ashfall', join(pkg, 'usr/bin/ashfall'));
mkdirSync(join(pkg, 'usr/share/applications'), { recursive: true });
writeFileSync(
  join(pkg, 'usr/share/applications/ashfall.desktop'),
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Ashfall',
    'Comment=Dark sci-fi isometric action RPG',
    'Exec=ashfall %U',
    'Icon=ashfall',
    'Terminal=false',
    'Categories=Game;ActionGame;RolePlaying;',
    'Keywords=rpg;action;sci-fi;',
    'StartupWMClass=ashfall',
    '',
  ].join('\n'),
);
const doc = join(pkg, 'usr/share/doc/ashfall');
mkdirSync(doc, { recursive: true });
cpSync(join(root, 'docs/credits.md'), join(doc, 'credits.md'));
writeFileSync(
  join(doc, 'changelog.gz'),
  gzipSync(
    [
      `ashfall (${version}) unstable; urgency=low`,
      '',
      `  * Release notes: https://github.com/felixarvid2/Ashfall/releases/tag/v${version}`,
      '',
      ` -- Felix Arvid <felixarvid2@users.noreply.github.com>  ${new Date().toUTCString().replace('GMT', '+0000')}`,
      '',
    ].join('\n'),
  ),
);
writeFileSync(
  join(doc, 'copyright'),
  [
    'Copyright (c) Felix Arvid. All rights reserved.',
    '',
    'The package bundles Electron (MIT licence, /opt/ashfall/LICENSE) and Chromium (/opt/ashfall/LICENSES.chromium.html).',
    'Third-party game assets and their licences are listed in /usr/share/doc/ashfall/credits.md.',
    '',
  ].join('\n'),
);

// 6. File modes: root-owned (dpkg-deb --root-owner-group), directories 755, files 644, executables stay 755.
let bytes = 0;
const normalize = (dir: string): void => {
  chmodSync(dir, 0o755);
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isSymbolicLink()) continue;
    if (name.isDirectory()) normalize(path);
    else {
      const st = statSync(path);
      bytes += st.size;
      chmodSync(path, st.mode & 0o111 ? 0o755 : 0o644);
    }
  }
};
normalize(pkg);

// 7. DEBIAN/. Electron's SUID sandbox helper must be root:root 4755 (user namespaces are restricted on newer Ubuntu).
const debian = join(pkg, 'DEBIAN');
mkdirSync(debian);
writeFileSync(
  join(debian, 'control'),
  [
    'Package: ashfall',
    `Version: ${version}`,
    'Architecture: amd64',
    'Maintainer: Felix Arvid <felixarvid2@users.noreply.github.com>',
    'Section: games',
    'Priority: optional',
    `Installed-Size: ${Math.ceil(bytes / 1024)}`,
    'Homepage: https://github.com/felixarvid2/Ashfall',
    'Depends: libc6, libgtk-3-0t64 | libgtk-3-0, libnss3, libgbm1, libasound2t64 | libasound2, libxss1, libxtst6, libnotify4, libsecret-1-0, libatspi2.0-0t64 | libatspi2.0-0, libdrm2, xdg-utils',
    'Description: Dark sci-fi isometric action RPG',
    ' Ashfall is an isometric action RPG with classes, skill trees, loot, zones,',
    ' dungeons and bosses. This package runs the web build in its own window',
    ' (Electron), with gamepad support and saves kept in the user profile.',
    '',
  ].join('\n'),
);
const script = (body: string) => `#!/bin/sh\nset -e\n${body}\n`;
writeFileSync(
  join(debian, 'postinst'),
  script(`case "$1" in
  configure)
    chown root:root /opt/ashfall/chrome-sandbox
    chmod 4755 /opt/ashfall/chrome-sandbox
    ;;
esac`),
);
writeFileSync(
  join(debian, 'postrm'),
  script(`case "$1" in
  purge)
    # Saves live in each user's ~/.config/Ashfall and are left alone.
    rmdir /opt/ashfall 2>/dev/null || true
    ;;
esac`),
);
for (const f of ['postinst', 'postrm']) chmodSync(join(debian, f), 0o755);
chmodSync(debian, 0o755);

// 8. Build.
const deb = join(out, `ashfall_${version}_amd64.deb`);
execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', pkg, deb], { stdio: 'inherit' });
if (!existsSync(deb)) throw new Error(`dpkg-deb finished but ${deb} is missing`);
// Leave only the .deb in dist-linux/ (the staged tree is about 340 MB).
rmSync(stage, { recursive: true, force: true });
rmSync(pkg, { recursive: true, force: true });
console.log(`${relative(root, deb)} (${(statSync(deb).size / 1048576).toFixed(1)} MB)`);
