/**
 * npm run docs:decisions: rewrites the index at the top of docs/decisions.md (between the two marker comments) from
 * the `###` headings below it: one line per entry, newest last, with a link. Run it after adding an entry (round 4 B19).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../../docs/decisions.md', import.meta.url);
const START = '<!-- index:start -->';
const END = '<!-- index:end -->';

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

export function buildIndex(markdown: string): string {
  const body = markdown.includes(END) ? markdown.slice(markdown.indexOf(END) + END.length) : markdown;
  const seen = new Map<string, number>();
  const lines: string[] = [];
  for (const m of body.matchAll(/^### (.+)$/gm)) {
    const title = m[1]!.trim();
    const base = slug(title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    lines.push(`- [${title}](#${n === 0 ? base : `${base}-${n}`})`);
  }
  return lines.join('\n');
}

export function withIndex(markdown: string): string {
  const index = `${START}\n${buildIndex(markdown)}\n${END}`;
  if (markdown.includes(START) && markdown.includes(END)) {
    return markdown.slice(0, markdown.indexOf(START)) + index + markdown.slice(markdown.indexOf(END) + END.length);
  }
  // First run: after the one-line intro, under its own heading.
  const firstEntry = markdown.indexOf('\n### ');
  return `${markdown.slice(0, firstEntry)}\n\n## Index\n\n${index}\n${markdown.slice(firstEntry)}`;
}

if (process.argv[1]?.endsWith('decisionsIndex.ts')) {
  const before = readFileSync(FILE, 'utf8');
  const after = withIndex(before);
  if (after !== before) writeFileSync(FILE, after);
  console.log(`docs/decisions.md index: ${after.split(START)[1]!.split(END)[0]!.trim().split('\n').length} entries`);
}
