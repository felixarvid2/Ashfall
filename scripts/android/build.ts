/**
 * npm run build:android — the web build into the Android app's assets, Gradle, and the APK in dist-android/.
 * Needs the Android SDK (`android/local.properties` with `sdk.dir`, or ANDROID_HOME); see docs/android.md.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const run = (cmd: string, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

// The WebView serves this folder at https://appassets.androidplatform.net/ (vite.config.ts has base './').
run('npx vite build --outDir android/app/src/main/assets/www --emptyOutDir');
run('./gradlew assembleDebug', join(root, 'android'));

const apk = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) throw new Error(`Gradle finished but ${apk} is missing`);
mkdirSync(join(root, 'dist-android'), { recursive: true });
copyFileSync(apk, join(root, 'dist-android/ashfall-thor.apk'));
console.log('dist-android/ashfall-thor.apk');
