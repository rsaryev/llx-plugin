import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The mods reference as `bun run docs:pull` keeps it: tests read the tables from it, never from a copy. */
const REFERENCE = join(
  import.meta.dir,
  '..',
  '..',
  '.cache',
  'claude-docs',
  'plugins',
  'mods',
  'reference.md',
);

export interface Section {
  readonly heading: string;
  readonly lines: readonly string[];
}

/** The sections of the page at one heading level (`##` or `###`), each with its lines up to the next heading of that level or above. */
export function sectionsOf(level: 2 | 3, within?: string): readonly Section[] {
  const lines = readFileSync(REFERENCE, 'utf8').split('\n');
  const mark = '#'.repeat(level);
  const above = new RegExp(`^#{1,${level}} `);
  let scope = within === undefined;
  const found: { heading: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) scope = within === undefined || line === `## ${within}`;
    if (!scope) continue;
    if (line.startsWith(`${mark} `)) found.push({ heading: line.slice(level + 1), lines: [] });
    else if (above.test(line)) continue;
    else found.at(-1)?.lines.push(line);
  }
  return found;
}

/** The rows of every table in `lines`, as cells; the header and the separator are left out. */
export function tableRows(lines: readonly string[], firstHeader?: string): readonly string[][] {
  const rows: string[][] = [];
  let keep = false;
  let header = true;
  for (const line of lines) {
    if (!line.startsWith('|')) {
      header = true;
      continue;
    }
    const cells = line
      .slice(1, line.lastIndexOf('|'))
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
    if (header) {
      keep = firstHeader === undefined || cells[0] === firstHeader;
      header = false;
    } else if (keep && !/^:?-+:?$/.test(cells[0] ?? '')) rows.push(cells);
  }
  return rows;
}

/** Every `code` token of a cell. */
export const codeTokens = (cell: string): string[] =>
  [...cell.matchAll(/`([^`]+)`/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
