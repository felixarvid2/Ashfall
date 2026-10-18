/**
 * Full-screen toggle for the touch menu. Standard API first, WebKit-prefixed fallbacks for older
 * Safari/iPadOS. Not available on iPhone Safari or inside an iframe without `allow="fullscreen"`
 * (the claude.ai artifact); there the button opens the game in its own tab, or says what to do instead.
 */

interface FullscreenDoc {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
  documentElement: FullscreenElement;
}

interface FullscreenElement {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** True when the browser lets this page go full screen. */
export function fullscreenAvailable(doc: FullscreenDoc = document as unknown as FullscreenDoc): boolean {
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isFullscreen(doc: FullscreenDoc = document as unknown as FullscreenDoc): boolean {
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Enter or leave full screen. Call it from a tap handler (it needs a user gesture); it never throws or rejects. */
export async function toggleFullscreen(doc: FullscreenDoc = document as unknown as FullscreenDoc): Promise<void> {
  try {
    if (isFullscreen(doc)) {
      await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
      return;
    }
    const el = doc.documentElement;
    // Hide the browser bars; browsers that can't just ignore the option.
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
    lockLandscape();
  } catch {
    // Denied (no gesture, iframe policy, user cancelled): the button simply does nothing.
  }
}

/** Phones are played sideways; the lock only works in full screen and on some browsers, so failures are ignored. */
function lockLandscape(): void {
  try {
    const lock = (screen.orientation as { lock?: (o: string) => Promise<void> } | undefined)?.lock;
    if (lock && window.innerWidth > window.innerHeight) void lock.call(screen.orientation, 'landscape').catch(() => {});
  } catch {
    // Not supported.
  }
}

/** Calls `onChange` whenever full screen is entered or left; returns the unsubscribe function. */
export function onFullscreenChange(onChange: () => void, target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  target.addEventListener('fullscreenchange', onChange);
  target.addEventListener('webkitfullscreenchange', onChange);
  return () => {
    target.removeEventListener('fullscreenchange', onChange);
    target.removeEventListener('webkitfullscreenchange', onChange);
  };
}

/** What a tap on the full-screen button did. */
export type FullscreenOutcome =
  /** The Fullscreen API was used (entered or left). */
  | 'toggled'
  /** Framed page: the game was opened in its own tab. */
  | 'newTab'
  /** Framed page and the tab could not be opened: tell the player to do it. */
  | 'needsTab'
  /** Top-level page without the API (iPhone Safari): tell the player about Add to Home Screen. */
  | 'needsHomeScreen';

/** True inside an iframe; a cross-origin parent that throws on access counts as framed too. */
export function inFrame(win: Pick<Window, 'self' | 'top'> = window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

/** Tap handler body: toggle full screen where the API exists, else the best fallback. Call it from the tap (user gesture). */
export async function fullscreenOrFallback(
  doc: FullscreenDoc = document as unknown as FullscreenDoc,
  win: Pick<Window, 'self' | 'top' | 'open' | 'location'> = window,
): Promise<FullscreenOutcome> {
  if (fullscreenAvailable(doc)) {
    await toggleFullscreen(doc);
    return 'toggled';
  }
  if (inFrame(win)) {
    try {
      // No `noopener` feature: it makes open() return null even on success, so a blocked popup could not be told apart.
      const tab = win.open(win.location.href, '_blank');
      if (tab) {
        try {
          tab.opener = null;
        } catch {
          // Cross-origin windows may refuse; harmless.
        }
        return 'newTab';
      }
    } catch {
      // Sandboxed frame without allow-popups.
    }
    return 'needsTab';
  }
  return 'needsHomeScreen';
}
