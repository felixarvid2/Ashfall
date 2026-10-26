/**
 * npm run build:android — the web build into the Android app's assets, Gradle, and the APK in dist-android/.
 * Needs the Android SDK (`android/local.properties` with `sdk.dir`, or ANDROID_HOME); see docs/android.md.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const run = (cmd: string, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

// The WebView serves this folder at https://appassets.androidplatform.net/ (vite.config.ts has base './').
const www = join(root, 'android/app/src/main/assets/www');
run('npx vite build --outDir android/app/src/main/assets/www --emptyOutDir --sourcemap false');
// The APK does not need source maps (about 7 MB); drop any that a config change might bring back.
const dropMaps = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) dropMaps(path);
    else if (name.endsWith('.map')) rmSync(path);
  }
};
dropMaps(www);
run('./gradlew assembleDebug', join(root, 'android'));

const apk = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) throw new Error(`Gradle finished but ${apk} is missing`);
mkdirSync(join(root, 'dist-android'), { recursive: true });
copyFileSync(apk, join(root, 'dist-android/ashfall-thor.apk'));
console.log(`dist-android/ashfall-thor.apk (${(statSync(join(root, 'dist-android/ashfall-thor.apk')).size / 1048576).toFixed(1)} MB)`);
