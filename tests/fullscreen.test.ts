import { describe, expect, it, vi } from 'vitest';
import { fullscreenAvailable, fullscreenOrFallback, inFrame, isFullscreen, onFullscreenChange, toggleFullscreen } from '../src/ui/fullscreen';

/** A document stub: only the members the helper looks at. */
const stubDoc = (extra: Record<string, unknown> = {}, el: Record<string, unknown> = {}) =>
  ({ documentElement: el, ...extra }) as unknown as Parameters<typeof toggleFullscreen>[0];

describe('fullscreen helper', () => {
  it('is available when the standard or the webkit flag is set', () => {
    expect(fullscreenAvailable(stubDoc({ fullscreenEnabled: true }))).toBe(true);
    expect(fullscreenAvailable(stubDoc({ webkitFullscreenEnabled: true }))).toBe(true);
  });

  it('is unavailable when neither flag is set (iPhone Safari, iframe without allow=fullscreen)', () => {
    expect(fullscreenAvailable(stubDoc())).toBe(false);
    expect(fullscreenAvailable(stubDoc({ fullscreenEnabled: false, webkitFullscreenEnabled: false }))).toBe(false);
  });

  it('reads the fullscreen element, standard or webkit', () => {
    expect(isFullscreen(stubDoc())).toBe(false);
    expect(isFullscreen(stubDoc({ fullscreenElement: null }))).toBe(false);
    expect(isFullscreen(stubDoc({ fullscreenElement: {} }))).toBe(true);
    expect(isFullscreen(stubDoc({ webkitFullscreenElement: {} }))).toBe(true);
  });

  it('enters with requestFullscreen on the page element', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    await toggleFullscreen(stubDoc({ fullscreenEnabled: true }, { requestFullscreen }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('falls back to webkitRequestFullscreen', async () => {
    const webkitRequestFullscreen = vi.fn();
    await toggleFullscreen(stubDoc({ webkitFullscreenEnabled: true }, { webkitRequestFullscreen }));
    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves with exitFullscreen, or webkitExitFullscreen', async () => {
    const exitFullscreen = vi.fn(() => Promise.resolve());
    const requestFullscreen = vi.fn();
    await toggleFullscreen(stubDoc({ fullscreenElement: {}, exitFullscreen }, { requestFullscreen }));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).not.toHaveBeenCalled();

    const webkitExitFullscreen = vi.fn();
    await toggleFullscreen(stubDoc({ webkitFullscreenElement: {}, webkitExitFullscreen }, { requestFullscreen }));
    expect(webkitExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected request and a missing API', async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')));
    await expect(toggleFullscreen(stubDoc({}, { requestFullscreen }))).resolves.toBeUndefined();
    await expect(toggleFullscreen(stubDoc())).resolves.toBeUndefined();
  });

  it('listens to both change events and unsubscribes', () => {
    const add = vi.fn();
    const remove = vi.fn();
    const off = onFullscreenChange(() => {}, { addEventListener: add, removeEventListener: remove });
    expect(add.mock.calls.map((c) => c[0])).toEqual(['fullscreenchange', 'webkitfullscreenchange']);
    off();
    expect(remove.mock.calls.map((c) => c[0])).toEqual(['fullscreenchange', 'webkitfullscreenchange']);
  });
});

type Win = NonNullable<Parameters<typeof fullscreenOrFallback>[1]>;

describe('fullscreen button fallbacks', () => {
  const win = (over: Record<string, unknown> = {}): Win => {
    const self = {};
    return { self, top: self, location: { href: 'https://game.test/play' }, open: vi.fn(() => null), ...over } as unknown as Win;
  };
  const framed = (open: () => unknown): Win => win({ top: {}, open: vi.fn(open) });

  it('uses the API when it exists, even inside a frame', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const w = framed(() => ({}));
    expect(await fullscreenOrFallback(stubDoc({ fullscreenEnabled: true }, { requestFullscreen }), w)).toBe('toggled');
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(w.open).not.toHaveBeenCalled();
  });

  it('opens the game in its own tab from an iframe and drops the opener', async () => {
    const tab = { opener: {} as unknown };
    const w = framed(() => tab);
    expect(await fullscreenOrFallback(stubDoc(), w)).toBe('newTab');
    expect(w.open).toHaveBeenCalledWith('https://game.test/play', '_blank');
    expect(tab.opener).toBeNull();
  });

  it('asks for a tab when the popup is blocked or open throws', async () => {
    expect(await fullscreenOrFallback(stubDoc(), framed(() => null))).toBe('needsTab');
    expect(
      await fullscreenOrFallback(stubDoc(), framed(() => { throw new Error('sandboxed'); })),
    ).toBe('needsTab');
  });

  it('points to Add to Home Screen on a top-level page without the API', async () => {
    const w = win();
    expect(await fullscreenOrFallback(stubDoc(), w)).toBe('needsHomeScreen');
    expect(w.open).not.toHaveBeenCalled();
  });

  it('treats a throwing window.top as framed', () => {
    const w = { self: {}, get top(): Window { throw new Error('cross-origin'); } } as unknown as Window;
    expect(inFrame(w)).toBe(true);
    expect(inFrame({ self: w, top: w } as unknown as Window)).toBe(false);
  });
});
