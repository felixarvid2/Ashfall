import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorReport, showErrorScreen } from '../src/core/errorScreen';

/** Just enough DOM for the error screen: elements that remember their children, text and listeners. */
class FakeEl {
  children: FakeEl[] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, () => void> = {};
  textContent = '';
  className = '';
  type = '';
  constructor(readonly tag: string) {}
  append(...kids: FakeEl[]): void { this.children.push(...kids); }
  appendChild(kid: FakeEl): FakeEl { this.children.push(kid); return kid; }
  setAttribute(): void {}
  addEventListener(name: string, fn: () => void): void { this.listeners[name] = fn; }
  querySelectorAll(): FakeEl[] { return []; }
}

afterEach(() => vi.unstubAllGlobals());

describe('error report (C13)', () => {
  it('names the build, the error, the stack and the browser', () => {
    vi.stubGlobal('navigator', { userAgent: 'TestBrowser/1.0' });
    const text = errorReport('crash', 'boom', 'Error: boom\n    at tick (game.ts:1:1)');
    expect(text).toMatch(/^Ashfall \S+ - crash/);
    expect(text).toContain('Error: boom');
    expect(text).toContain('at tick (game.ts:1:1)');
    expect(text).toContain('Browser: TestBrowser/1.0');
  });

  it('"Copy details" writes the report to the clipboard and says so', async () => {
    const written: string[] = [];
    vi.stubGlobal('navigator', { userAgent: 'TestBrowser/1.0', clipboard: { writeText: async (s: string) => void written.push(s) } });
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) });
    const root = new FakeEl('div');
    const screen = showErrorScreen(root as unknown as HTMLElement, 'crash', 'boom', () => {}, 'stack-text') as unknown as FakeEl;
    const copy = screen.children.find((c) => c.dataset.testid === 'error-copy')!;
    expect(copy.textContent).toBe('Copy details');
    copy.listeners.click!();
    await new Promise((r) => setTimeout(r, 0));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('stack-text');
    expect(copy.textContent).toBe('Copied');
  });

  it('reports a failed copy instead of claiming success', async () => {
    vi.stubGlobal('navigator', { userAgent: 'x', clipboard: { writeText: async () => { throw new Error('denied'); } } });
    const fakeBody = new FakeEl('body');
    vi.stubGlobal('document', {
      createElement: (tag: string) => Object.assign(new FakeEl(tag), { select() {}, remove() {}, value: '' }),
      body: fakeBody,
      execCommand: () => false,
    });
    const screen = showErrorScreen(new FakeEl('div') as unknown as HTMLElement, 'startup', 'x') as unknown as FakeEl;
    const copy = screen.children.find((c) => c.dataset.testid === 'error-copy')!;
    copy.listeners.click!();
    await new Promise((r) => setTimeout(r, 0));
    expect(copy.textContent).toMatch(/Copy failed/);
  });
});
