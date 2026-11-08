import { parseDocument } from 'yaml';
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
}

const MARKER = /^---[ \t]*$/;
const BOM = '﻿';

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
): Frontmatter => ({
  state,
  present: true,
  fields: {},
  body,
  problem,
});

/** The YAML text between the markers and the body after them, or `undefined` without a block. */
function splitBlock(text: string): { yaml: string; body: string } | undefined {
  const lines = text.split('\n');
  if (!isMarker(lines[0])) return undefined;
  const closing = lines.findIndex((line, i) => i > 0 && isMarker(line));
  if (closing < 0) return undefined;
  const consumed = lines.slice(0, closing + 1).join('\n').length + 1;
  return {
    yaml: lines
      .slice(1, closing)
      .map((line) => line.replace(/\r$/, ''))
      .join('\n'),
    body: text.slice(consumed),
  };
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Split a Markdown file into its YAML frontmatter and body, as skills.md and output-styles.md
 * describe: the opening `---` must be line 1, a block that does not parse leaves the file loaded
 * with no fields. Never throws; CRLF files read like LF ones.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const block = splitBlock(source);
  if (!block) return none(text);
  const document = parseDocument(block.yaml, { prettyErrors: false });
  const [first] = document.errors;
  if (first) return failed('invalid-yaml', block.body, first.message);
  try {
    const value: unknown = document.toJS();
    if (value === null || value === undefined) {
      return { state: 'ok', present: true, fields: {}, body: block.body };
    }
    if (!isTable(value)) return failed('not-a-table', block.body, NOT_A_TABLE);
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
