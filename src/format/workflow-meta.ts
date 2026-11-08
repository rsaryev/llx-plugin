import { error, warning, type PluginIssue } from './issues.ts';
import { readObjectLiteral, type LiteralObject } from './js-literal.ts';
import { tokenize, type JsToken } from './js-tokens.ts';

/**
 * The `meta` block of a workflow script (workflows.md, "What the saved script looks like", "Edit a
 * saved script"; agent-sdk/typescript.md, "Workflow": the script "must begin with `export const meta
 * = { name, description }` as a literal"). Claude Code reads it without running the script, so the
 * kit does too: it finds the literal in the tokens, reads it, and rewrites single fields in place,
 * keeping every other byte.
 */

export interface WorkflowMeta {
  readonly name: string;
  readonly description: string;
  /** The stage titles of `phases`, in order; `[]` when there are none. */
  readonly phases: readonly string[];
  /** Every other literal field, as written. */
  readonly extra: Readonly<Record<string, unknown>>;
}

/** A script split at the end of its `meta` statement. */
export interface ScriptHead {
  readonly meta: WorkflowMeta | undefined;
  readonly issues: readonly PluginIssue[];
  /** The tokens of the whole script. */
  readonly tokens: readonly JsToken[];
  /** The literal, when the script begins with one. */
  readonly object: LiteralObject | undefined;
  /** Where the `meta` statement ends (after its `;`); the body starts here. `0` without a literal. */
  readonly headEnd: number;
  /** The index of the first token of the body. */
  readonly bodyIndex: number;
}

const CORE_KEYS: ReadonlySet<string> = new Set(['name', 'description', 'phases']);
const OPENING = ['export', 'const', 'meta', '='] as const;
const NO_LITERAL = 'must be a plain object literal with a name and a description';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nothing = (issues: readonly PluginIssue[], tokens: readonly JsToken[] = []): ScriptHead => ({
  meta: undefined,
  issues,
  tokens,
  object: undefined,
  headEnd: 0,
  bodyIndex: 0,
});

const required = (
  fields: Record<string, unknown>,
  key: 'name' | 'description',
): string | PluginIssue => {
  const value = fields[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value
    : error(`meta.${key}`, `meta needs a ${key}: a string that is not empty`);
};

function titleOf(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  const title = isRecord(entry) ? entry.title : undefined;
  return typeof title === 'string' ? title : undefined;
}

/** `phases`: a list of titles (or of objects with a `title`); what is not one is skipped with a warning. */
function readPhases(value: unknown): { titles: string[]; issues: PluginIssue[] } {
  if (value === undefined) return { titles: [], issues: [] };
  if (!Array.isArray(value)) {
    const issue = warning('meta.phases', 'meta.phases must be a list of titles; ignored');
    return { titles: [], issues: [issue] };
  }
  const titles = value.flatMap((entry) => titleOf(entry) ?? []);
  const skipped = value.length - titles.length;
  const issues =
    skipped === 0
      ? []
      : [
          warning(
            'meta.phases',
            `meta.phases has ${skipped} entries that are not a title; skipped`,
          ),
        ];
  return { titles, issues };
}

function buildMeta(fields: Record<string, unknown>): {
  meta?: WorkflowMeta;
  issues: PluginIssue[];
} {
  const name = required(fields, 'name');
  const description = required(fields, 'description');
  const missing = [name, description].filter((each) => typeof each !== 'string');
  if (missing.length > 0 || typeof name !== 'string' || typeof description !== 'string') {
    return { issues: missing };
  }
  const phases = readPhases(fields.phases);
  const extra = Object.fromEntries(Object.entries(fields).filter(([key]) => !CORE_KEYS.has(key)));
  return {
    meta: { name: name.trim(), description, phases: phases.titles, extra },
    issues: phases.issues,
  };
}

const startsWithMeta = (tokens: readonly JsToken[]): boolean =>
  OPENING.every((word, index) => tokens[index]?.text === word);

/**
 * Splits a script at the end of its `meta` statement and reads the literal. What the docs leave open
 * (the severity of each finding, blank names) is in spec/judgments.md.
 */
export function readScriptHead(source: string): ScriptHead {
  const { tokens, problem } = tokenize(source);
  if (problem !== undefined) {
    return nothing([error('meta', `the script is not valid JavaScript: ${problem}`)]);
  }
  if (!startsWithMeta(tokens)) {
    const message = '`export const meta = {…}` must be the first statement of the script';
    return nothing([error('meta', message)], tokens);
  }
  const read = readObjectLiteral(tokens, OPENING.length);
  if (read.found === undefined) {
    const message = `meta ${NO_LITERAL} (${read.problem}); Claude Code drops /<name> from / autocomplete`;
    return nothing([warning('meta', message)], tokens);
  }
  const object = read.found;
  const fields = Object.fromEntries(object.properties.map((each) => [each.key, each.value]));
  const built = buildMeta(fields);
  const semicolon = tokens[object.endIndex]?.text === ';' ? tokens[object.endIndex] : undefined;
  return {
    meta: built.meta,
    issues: built.issues,
    tokens,
    object,
    headEnd: semicolon?.end ?? object.end,
    bodyIndex: object.endIndex + (semicolon === undefined ? 0 : 1),
  };
}

/** The `meta` of a script and what is wrong with it. Never runs the script, never throws. */
export function readWorkflowMeta(source: string): {
  readonly meta: WorkflowMeta | undefined;
  readonly issues: readonly PluginIssue[];
} {
  const { meta, issues } = readScriptHead(source);
  return { meta, issues };
}

/** The fields a rewrite sets; a field not given is left as written. */
export interface MetaPatch {
  readonly name?: string;
  readonly description?: string;
  readonly phases?: readonly string[];
}

const PATCH_KEYS = ['name', 'description', 'phases'] as const;

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

const quote = (text: string): string =>
  `'${text.replace(NEEDS_ESCAPE, (char) => ESCAPED[char] ?? char)}'`;

const encode = (value: string | readonly string[]): string =>
  typeof value === 'string' ? quote(value) : `[${value.map(quote).join(', ')}]`;

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

/** The text that appends `added` (`key: value` pieces) after the last property, in the style of the block. */
function appendix(
  source: string,
  object: LiteralObject,
  added: readonly string[],
): Splice | undefined {
  if (added.length === 0) return undefined;
  const last = object.properties.at(-1);
  const multiline = source.slice(object.start, object.end).includes('\n');
  const indent = indentOf(source, object);
  if (last === undefined) {
    return { start: object.start + 1, end: object.start + 1, text: ` ${added.join(', ')} ` };
  }
  const trailing = object.trailingComma;
  const at = trailing ? object.afterLast : last.valueEnd;
  const lines = multiline
    ? added.map((each) => (trailing ? `\n${indent}${each},` : `,\n${indent}${each}`))
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
      replaced.push({ start: existing.valueStart, end: existing.valueEnd, text: encode(value) });
    else added.push(`${key}: ${encode(value)}`);
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
