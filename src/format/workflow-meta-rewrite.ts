import type { PluginIssue } from './issues.ts';
import type { LiteralObject } from './js-literal.ts';
import { readScriptHead, readWorkflowMeta, type PhaseEntry } from './workflow-meta.ts';

/**
 * Rewrites single fields of the `meta` literal of a workflow script and keeps every other byte
 * (workflows.md, "Edit a saved script"). What the docs leave open (quoting, layout, line endings) is
 * in spec/judgments.md.
 */

/** The fields a rewrite sets; a field not given is left as written. */
export interface MetaPatch {
  readonly name?: string;
  readonly description?: string;
  readonly phases?: readonly PhaseEntry[];
  readonly whenToUse?: string;
}

const PATCH_KEYS = ['name', 'description', 'phases', 'whenToUse'] as const;

/** The two Unicode line separators, which end a line in a JavaScript string; spelled by code point. */
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);

/** What a single-quoted JavaScript string must escape: the quote, the backslash and every line break. */
const ESCAPED: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  [LINE_SEPARATOR]: '\\u2028',
  [PARAGRAPH_SEPARATOR]: '\\u2029',
};
const NEEDS_ESCAPE = new RegExp(`[${Object.keys(ESCAPED).join('').replace('\\', '\\\\')}]`, 'g');
const IDENTIFIER = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;

const quote = (text: string): string =>
  `'${text.replace(NEEDS_ESCAPE, (char) => ESCAPED[char] ?? char)}'`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const keyText = (key: string): string => (IDENTIFIER.test(key) ? key : quote(key));

/** A literal value as source: strings single-quoted, arrays and objects in one line. */
function literal(value: unknown): string {
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (isRecord(value)) {
    const fields = Object.entries(value).map(([key, each]) => `${keyText(key)}: ${literal(each)}`);
    return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`;
  }
  return String(value);
}

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function indentOf(source: string, object: LiteralObject): string {
  const last = object.properties.at(-1);
  if (last === undefined) return '  ';
  const lineStart = source.lastIndexOf('\n', last.valueStart) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? '  ';
}

/** The line terminator of the block: `\r\n` when the block uses it, so a rewrite never mixes endings (judgment). */
const terminatorOf = (block: string): string => (block.includes('\r\n') ? '\r\n' : '\n');

/** The text that appends `added` (`key: value` pieces) after the last property, in the style of the block. */
function appendix(
  source: string,
  object: LiteralObject,
  added: readonly string[],
): Splice | undefined {
  if (added.length === 0) return undefined;
  const last = object.properties.at(-1);
  const block = source.slice(object.start, object.end);
  const indent = indentOf(source, object);
  if (last === undefined) {
    return { start: object.start + 1, end: object.start + 1, text: ` ${added.join(', ')} ` };
  }
  const trailing = object.trailingComma;
  const at = trailing ? object.afterLast : last.valueEnd;
  const eol = terminatorOf(block);
  const lines = block.includes('\n')
    ? added.map((each) => (trailing ? `${eol}${indent}${each},` : `,${eol}${indent}${each}`))
    : added.map((each) => (trailing ? ` ${each},` : `, ${each}`));
  return { start: at, end: at, text: lines.join('') };
}

function splices(source: string, object: LiteralObject, patch: MetaPatch): Splice[] {
  const replaced: Splice[] = [];
  const added: string[] = [];
  for (const key of PATCH_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const existing = object.properties.findLast((each) => each.key === key);
    if (existing)
      replaced.push({ start: existing.valueStart, end: existing.valueEnd, text: literal(value) });
    else added.push(`${key}: ${literal(value)}`);
  }
  const appended = appendix(source, object, added);
  return appended === undefined ? replaced : [...replaced, appended];
}

/**
 * Sets fields of the `meta` literal and keeps every other byte of the script. A `meta` that is not a
 * literal is left alone (the reasons come back as issues), and so is a script the rewrite would leave
 * without a name or a description: `source` is then `undefined`.
 */
export function rewriteWorkflowMeta(
  source: string,
  patch: MetaPatch,
): { readonly source: string | undefined; readonly issues: readonly PluginIssue[] } {
  const head = readScriptHead(source);
  if (head.object === undefined) return { source: undefined, issues: head.issues };
  const edited = splices(source, head.object, patch)
    .toSorted((first, second) => second.start - first.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
  const check = readWorkflowMeta(edited);
  return check.meta === undefined
    ? { source: undefined, issues: check.issues }
    : { source: edited, issues: check.issues };
}
