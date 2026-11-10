/**
 * B09: registers the service worker of the plain web build (tools/serviceWorkerPlugin.ts) so the game runs offline and
 * can be installed as an app. Not part of the artifact, Android or Linux builds: `enabled` is the build-time flag
 * `__PWA__`, which is false there, so the call is dead code and sw.js does not exist.
 */

export interface PwaEnv {
  enabled: boolean;
  /** `navigator`-like: only serviceWorker is used. */
  nav: { serviceWorker?: ServiceWorkerContainer } | undefined;
  loc: { protocol: string; hostname: string };
  /** A new build has taken over from an older one while this page was open. */
  onUpdate: () => void;
  /** Runs `fn` once the page has loaded, so registration never competes with start-up. */
  whenLoaded: (fn: () => void) => void;
  /** URLs the page has fetched so far (performance entries); sent to the worker once it is active so the first visit is cached too. */
  resources?: () => string[];
  log?: (msg: string, err?: unknown) => void;
}

/** Service workers need https (or localhost). Packaged hosts use their own schemes and are excluded at build time. */
export function canRegister(env: Pick<PwaEnv, 'enabled' | 'nav' | 'loc'>): boolean {
  if (!env.enabled || !env.nav?.serviceWorker) return false;
  return env.loc.protocol === 'https:' || env.loc.hostname === 'localhost' || env.loc.hostname === '127.0.0.1';
}

/** Registers `./sw.js`. Returns whether a registration was started. */
export function registerServiceWorker(env: PwaEnv): boolean {
  if (!canRegister(env)) return false;
  const container = env.nav!.serviceWorker!;
  // A controller at load means an older worker already runs this page; a later controller change is an update.
  const hadController = !!container.controller;
  let updated = false;
  container.addEventListener('controllerchange', () => {
    if (!hadController || updated) return;
    updated = true;
    env.onUpdate();
  });
  env.whenLoaded(() => {
    container.register('./sw.js').then(
      (reg) => env.log?.('[ashfall] service worker registered', reg.scope),
      (err) => env.log?.('[ashfall] service worker registration failed', err),
    );
    // Whatever loaded before the worker was in control is handed over to be cached.
    if (env.resources) {
      void container.ready.then(
        (reg) => reg.active?.postMessage({ type: 'warm', urls: env.resources!() }),
        () => undefined,
      );
    }
  });
  return true;
}
