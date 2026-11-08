/**
 * The little of Markdown the extractor reads: headings (with their nesting) and pipe tables. A
 * table belongs to the nearest heading above it; a cell's `|` inside a code span is text.
 */

export interface Heading {
  readonly level: number;
  /** The heading's text, code ticks removed: "### `name`" → "name". */
  readonly text: string;
  /** The texts of the headings that contain this one, outermost first. */
  readonly parents: readonly string[];
}

export interface Table {
  readonly heading: Heading;
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface Page {
  readonly headings: readonly Heading[];
  readonly tables: readonly Table[];
}

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Splits a table line into cells, keeping `|` inside code spans. */
export function cellsOf(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '`') inCode = !inCode;
    if (char === '\\' && body[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

const plain = (text: string): string => text.replace(/`/g, '').trim();

/** Reads a page's headings and tables. Fenced code blocks are skipped. */
export function parsePage(markdown: string): Page {
  const lines = markdown.split('\n');
  const headings: Heading[] = [];
  const tables: Table[] = [];
  const stack: Heading[] = [];
  let fenced = false;
  let current: Heading = { level: 0, text: '', parents: [] };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const heading = HEADING.exec(line);
    if (heading?.[1] && heading[2] !== undefined) {
      const level = heading[1].length;
      while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
      current = { level, text: plain(heading[2]), parents: stack.map((h) => h.text) };
      stack.push(current);
      headings.push(current);
      continue;
    }
    if (line.trim().startsWith('|') && SEPARATOR.test(lines[index + 1] ?? '')) {
      const rows: string[][] = [];
      let next = index + 2;
      while ((lines[next] ?? '').trim().startsWith('|')) rows.push(cellsOf(lines[next++] ?? ''));
      tables.push({ heading: current, header: cellsOf(line), rows });
      index = next - 1;
    }
  }
  return { headings, tables };
}

const LIST_OF_CODE = /^(?:\[?`[^`]+`\]?(?:\([^)]*\))?\s*(?:\/|,|or|and)?\s*)+$/;

/**
 * The identifiers a cell names: every code span when the cell is only a list of them
 * (`` `min` / `max` ``), else the one `keyOf` reads.
 */
export function keysOf(cell: string): string[] {
  if (!LIST_OF_CODE.test(cell.trim())) return [keyOf(cell)];
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? '').trim());
}

/**
 * The identifier a cell names: its first code span (`` `name` `` or a linked `` [`name`](#x) ``),
 * else its plain text with links and emphasis removed.
 */
export function keyOf(cell: string): string {
  const code = /`([^`]+)`/.exec(cell);
  if (code?.[1]) return code[1].trim();
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .trim();
}
