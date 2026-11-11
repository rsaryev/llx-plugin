import { isRecord } from '../protocol/is-record.ts';
import { LineCounter, parseDocument, type Document } from 'yaml';
import { NOT_A_TABLE } from './frontmatter-values.ts';

/**
 * Where the frontmatter stands:
 *
 * - `none`: the file does not open with a `---` line, or no closing `---` follows; all of it is
 *   body.
 * - `ok`: a YAML table (or an empty block) between the markers; `fields` holds it.
 * - `invalid-yaml`: the YAML between the markers does not parse; the file loads with no fields.
 * - `not-a-table`: it parses to a list or a single value; the file loads with no fields.
 */
export type FrontmatterState = 'none' | 'ok' | 'invalid-yaml' | 'not-a-table';

export interface Frontmatter {
  readonly state: FrontmatterState;
  /** `state` is not `none`: the file has a frontmatter block, valid or not. */
  readonly present: boolean;
  /** Always a plain object: empty unless `state` is `ok`. */
  readonly fields: Readonly<Record<string, unknown>>;
  /** The text after the closing marker, or the whole file when `state` is `none`. */
  readonly body: string;
  /** Why `state` is `invalid-yaml` or `not-a-table`, as the YAML parser or `readTable` words it, for a notice. */
  readonly problem?: string;
  /**
   * Where the problem is in the file, counted from 1 (the opening `---` is line 1): the first
   * YAML line is 2. Present when `problem` is.
   */
  readonly line?: number;
  readonly column?: number;
  /** What the block parsed to when `state` is `not-a-table` (a list or a single value). */
  readonly value?: unknown;
}

interface Where {
  readonly line: number;
  readonly column: number;
}

/** The first line after the opening marker. */
const BLOCK_START: Where = { line: 2, column: 1 };

const MARKER = /^---[ \t]*$/;
const BOM = '\uFEFF';

const isMarker = (line: string | undefined): boolean =>
  MARKER.test((line ?? '').replace(/\r$/, ''));

const none = (text: string): Frontmatter => ({
  state: 'none',
  present: false,
  fields: {},
  body: text,
});

const failed = (
  state: 'invalid-yaml' | 'not-a-table',
  body: string,
  problem: string,
  { line, column }: Where = BLOCK_START,
): Frontmatter => ({
  state,
  present: true,
  fields: {},
  body,
  problem,
  line,
  column,
});

/**
 * `logLevel: 'error'` keeps the parser's warnings (a key that is a collection) off the host's
 * `process.emitWarning`: a library writes nothing to the host's stderr, and the key is read as the
 * text it is either way (judgment).
 */
const YAML_OPTIONS = { prettyErrors: false, uniqueKeys: false, logLevel: 'error' } as const;

function relaxed(yaml: string, strict: Document): Document {
  const quoted = quotePlainScalars(yaml);
  if (quoted === yaml) return strict;
  const retry = parseDocument(quoted, YAML_OPTIONS);
  return retry.errors.length === 0 ? retry : strict;
}

/** One line of `text` from `at`, and where the next line starts (past the end on the last line). */
export function lineAt(text: string, at: number): { line: string; next: number } {
  const end = text.indexOf('\n', at);
  return end < 0
    ? { line: text.slice(at), next: text.length + 1 }
    : { line: text.slice(at, end), next: end + 1 };
}

/**
 * The YAML text between the markers and the body after them, or `undefined` without a block. Reads
 * line by line up to the closing marker only, so a long body is never split into lines.
 */
function splitBlock(text: string): { yaml: string; body: string } | undefined {
  const opening = lineAt(text, 0);
  if (!isMarker(opening.line)) return undefined;
  for (let at = opening.next; at <= text.length;) {
    const { line, next } = lineAt(text, at);
    if (isMarker(line)) {
      const yaml = text.slice(opening.next, Math.max(opening.next, at - 1));
      return { yaml: yaml.replace(/\r(?=\n|$)/g, ''), body: text.slice(next) };
    }
    at = next;
  }
  return undefined;
}

/**
 * Claude Code retries a block its YAML parser refuses with the value of each top-level `key: value`
 * line quoted when it holds a character plain YAML cannot (oracle 2.1.319: `description: Does X:
 * then Y`, `argument-hint: "<a>" [--b]`, `tools: *`, `metadata: {"a": 1}` read as the text written).
 * What the retry does not touch stays an error: an indented line, a value already wrapped in one
 * kind of quote (`"a" or "b"`), a value with no such character (`"a" b`), and a block scalar
 * marker, which the retry does quote and so breaks the lines that follow it.
 */
const TOP_LEVEL = /^([A-Za-z_][\w-]*:[ \t]+)(\S.*)$/;
const SPECIAL = /[{}[\]*&#!|>%@`]|: /;

/** A value that opens and closes with one kind of quote: the retry takes it as quoted already. */
const wrapped = (value: string): boolean =>
  value.length > 1 &&
  (value.startsWith('"') || value.startsWith("'")) &&
  value.endsWith(value.charAt(0));

function quoteRefused(line: string): string {
  const match = TOP_LEVEL.exec(line);
  const value = match?.[2]?.trimEnd();
  if (!match || value === undefined || wrapped(value) || !SPECIAL.test(value)) return line;
  return `${match[1]}'${value.replaceAll("'", "''")}'`;
}

const quotePlainScalars = (yaml: string): string => yaml.split('\n').map(quoteRefused).join('\n');

/**
 * The block's YAML document as `parseFrontmatter` reads it (the relaxed retry applied) and the
 * body after it; `undefined` when the file has no block. The writer edits this document, so a file
 * is edited as it is read.
 */
export function frontmatterDocument(text: string):
  | {
      readonly block: { readonly body: string };
      readonly document: Document;
      readonly lineCounter: LineCounter;
    }
  | undefined {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const block = splitBlock(source);
  if (!block) return undefined;
  const lineCounter = new LineCounter();
  const strict = parseDocument(block.yaml, { ...YAML_OPTIONS, lineCounter });
  return {
    block,
    document: strict.errors.length === 0 ? strict : relaxed(block.yaml, strict),
    lineCounter,
  };
}

/**
 * Split a Markdown file into its YAML frontmatter and body, as skills.md and output-styles.md
 * describe: the opening `---` must be line 1, a block that does not parse leaves the file loaded
 * with no fields. Never throws; CRLF files read like LF ones.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const read = frontmatterDocument(text);
  if (!read) return none(text);
  const { block, document, lineCounter } = read;
  const [first] = document.errors;
  if (first) {
    const { line, col } = lineCounter.linePos(first.pos[0]);
    return failed('invalid-yaml', block.body, first.message, { line: line + 1, column: col });
  }
  try {
    const value: unknown = document.toJS();
    if (value === null || value === undefined) {
      return { state: 'ok', present: true, fields: {}, body: block.body };
    }
    if (!isRecord(value)) {
      return { ...failed('not-a-table', block.body, NOT_A_TABLE), value };
    }
    return { state: 'ok', present: true, fields: value, body: block.body };
  } catch (thrown) {
    // `toJS` refuses an alias bomb by throwing: that is a document that does not parse.
    return failed(
      'invalid-yaml',
      block.body,
      thrown instanceof Error ? thrown.message : String(thrown),
    );
  }
}
