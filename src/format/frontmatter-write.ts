import { Document, isMap, isScalar, type YAMLMap } from 'yaml';
import { frontmatterDocument, parseFrontmatter, type FrontmatterState } from './frontmatter.ts';

/**
 * The writer of a Markdown file's frontmatter, the inverse of `parseFrontmatter`: what it writes
 * reads back to the same `fields` and the same `body` (tests/format/frontmatter-write.test.ts). The
 * YAML is the `yaml` package's, the parser's own, so a value that needs quoting (`Use when: x`,
 * `true` as text, `@file`) is quoted and never relies on the reader's relaxed retry. A value is a
 * JSON-shaped one (text, number, boolean, `null`, a list, a table); `undefined` is "no key".
 */

/** No line folding: a long `description` stays the one line it was given. */
const WRITE_OPTIONS = { lineWidth: 0 } as const;
/** A value given twice is written twice, never as a YAML anchor and alias. */
const NODE_OPTIONS = { aliasDuplicateObjects: false } as const;

const definedEntries = (fields: Readonly<Record<string, unknown>>): [string, unknown][] =>
  Object.entries(fields).filter(([, value]) => value !== undefined);

/**
 * A whole file: `---`, the fields in the order given (JavaScript lists integer-like keys first),
 * `---`, then `body` exactly as given, with no line added before it. An empty `fields` still writes
 * the two markers, so a body that opens with `---` stays body.
 */
export function writeFrontmatter(fields: Readonly<Record<string, unknown>>, body: string): string {
  const entries = definedEntries(fields);
  const document = new Document(Object.fromEntries(entries), NODE_OPTIONS);
  return `---\n${entries.length === 0 ? '' : document.toString(WRITE_OPTIONS)}---\n${body}`;
}

export type FrontmatterEdit =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      /** The block does not read: writing would drop what the file holds, so nothing is written. */
      readonly state: 'invalid-yaml' | 'not-a-table';
      readonly problem: string;
    };

/** A block that is there but does not read: what `parseFrontmatter` gives a `problem` for. */
const REFUSED: ReadonlySet<FrontmatterState> = new Set(['invalid-yaml', 'not-a-table']);
const isRefused = (state: FrontmatterState): state is 'invalid-yaml' | 'not-a-table' =>
  REFUSED.has(state);

const isKey = (key: string) => (pair: { readonly key: unknown }) =>
  isScalar(pair.key) ? String(pair.key.value) === key : pair.key === key;

/** One key of the map set or removed; a key the block repeats keeps its first place only. */
function apply(document: Document, map: YAMLMap, key: string, value: unknown): void {
  const first = map.items.findIndex(isKey(key));
  map.items = map.items.filter((pair, at) => at === first || !isKey(key)(pair));
  if (value === undefined) {
    map.items = map.items.filter((pair) => !isKey(key)(pair));
    return;
  }
  map.set(key, document.createNode(value, NODE_OPTIONS));
}

/**
 * `text` with `changes` set in its frontmatter: a key it has keeps its place, a new one goes after
 * the others in the order given, `undefined` removes one; every other key and the comments stay.
 * `body` replaces the body when given, else the body stays byte for byte. A file without a block
 * gets one, its whole text the body. A block that does not read is refused, not overwritten.
 */
export function editFrontmatter(
  text: string,
  changes: Readonly<Record<string, unknown>>,
  body?: string,
): FrontmatterEdit {
  const read = parseFrontmatter(text);
  const found = frontmatterDocument(text);
  if (read.problem !== undefined && isRefused(read.state)) {
    return { ok: false, state: read.state, problem: read.problem };
  }
  const kept = body ?? read.body;
  if (found === undefined) return { ok: true, text: writeFrontmatter(changes, kept) };
  const document = isMap(found.document.contents) ? found.document : new Document({});
  const map = document.contents;
  if (!isMap(map)) return { ok: true, text: writeFrontmatter(changes, kept) };
  for (const [key, value] of Object.entries(changes)) apply(document, map, key, value);
  const yaml = map.items.length === 0 ? '' : document.toString(WRITE_OPTIONS);
  return { ok: true, text: `---\n${yaml}---\n${kept}` };
}
