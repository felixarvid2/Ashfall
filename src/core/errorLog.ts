/**
 * B18: a ring buffer of the last console warnings and errors (and uncaught errors), so a player can copy it from
 * Settings > Data and send it with a bug report. Installed once, first thing in main.ts. The console keeps working as
 * before; nothing here is sent anywhere.
 */

export const LOG_KEEP = 200;
/** A single entry is cut to this many characters (a stack trace of a deep error is enough, a dumped save is not). */
const ENTRY_MAX = 2000;

export interface LogEntry {
  /** Epoch ms. */
  at: number;
  level: 'warn' | 'error';
  text: string;
}

let entries: LogEntry[] = [];
let installed = false;

function show(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/** Adds one entry (also used by tests and by code that wants a line in the log without a console call). */
export function logEntry(level: LogEntry['level'], args: unknown[], at: number = Date.now()): void {
  let text = args.map(show).join(' ');
  if (text.length > ENTRY_MAX) text = `${text.slice(0, ENTRY_MAX)}... (cut)`;
  entries.push({ at, level, text });
  if (entries.length > LOG_KEEP) entries.splice(0, entries.length - LOG_KEEP);
}

export function logEntries(): readonly LogEntry[] {
  return entries;
}

export function clearLog(): void {
  entries = [];
}

/** The text that is copied: a header (version, browser, time) and one line per entry, oldest first. */
export function formatLog(
  list: readonly LogEntry[] = entries,
  info: { version?: string; userAgent?: string; now?: number } = {},
): string {
  const head = [
    `Ashfall ${info.version ?? 'dev'} log, ${new Date(info.now ?? Date.now()).toISOString()}`,
    info.userAgent ? `Browser: ${info.userAgent}` : null,
    `${list.length} warning/error entries (newest last)`,
    '',
  ].filter((l): l is string => l !== null);
  return [...head, ...list.map((e) => `${new Date(e.at).toISOString().slice(11, 23)} ${e.level.toUpperCase().padEnd(5)} ${e.text}`)].join('\n');
}

/** Hooks console.warn / console.error, window errors and rejected promises. Safe to call twice. */
export function installErrorLog(target: { warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void } = console, win?: EventTarget): void {
  if (installed) return;
  installed = true;
  for (const level of ['warn', 'error'] as const) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      try {
        logEntry(level, args);
      } catch {
        // Logging must never break the caller.
      }
      original(...args);
    };
  }
  win?.addEventListener('error', (ev) => {
    const e = ev as ErrorEvent;
    logEntry('error', [`Uncaught: ${e.message ?? ''}`, e.error ?? '']);
  });
  win?.addEventListener('unhandledrejection', (ev) => logEntry('error', ['Unhandled rejection:', (ev as PromiseRejectionEvent).reason]));
}

/** Test hook: lets a test install again on a fresh console. */
export function resetErrorLogForTests(): void {
  installed = false;
  entries = [];
}

/** Copies text with the clipboard API, or a hidden textarea where that is blocked (a WebView). Returns whether it worked. */
export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea route.
  }
  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    doc.body.append(area);
    area.select();
    const ok = doc.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
