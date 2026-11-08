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

/** A `phases` entry as written: a title, or an object with a `title` and whatever else it carries (judgment). */
export type PhaseEntry = string | { readonly title: string; readonly [field: string]: unknown };

export interface WorkflowMeta {
  readonly name: string;
  readonly description: string;
  /** The stage titles of `phases`, in order; `[]` when there are none. */
  readonly phases: readonly string[];
  /** The entries behind `phases`, as written, so an object entry keeps its other fields (judgment). */
  readonly phaseEntries: readonly PhaseEntry[];
  /** `whenToUse`, when it is a string (judgment: the docs do not name the field). */
  readonly whenToUse: string | undefined;
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
const WHEN_TO_USE = 'whenToUse';
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

const asEntry = (entry: unknown, title: string): PhaseEntry =>
  typeof entry === 'string' || !isRecord(entry) ? title : { ...entry, title };

interface ReadPhases {
  readonly titles: string[];
  readonly entries: PhaseEntry[];
  readonly issues: PluginIssue[];
}

/** `phases`: a list of titles (or of objects with a `title`); what is not one is skipped with a warning. */
function readPhases(value: unknown): ReadPhases {
  if (value === undefined) return { titles: [], entries: [], issues: [] };
  if (!Array.isArray(value)) {
    const issue = warning('meta.phases', 'meta.phases must be a list of titles; ignored');
    return { titles: [], entries: [], issues: [issue] };
  }
  const found = value.flatMap((entry) => {
    const title = titleOf(entry);
    return title === undefined ? [] : [{ title, entry: asEntry(entry, title) }];
  });
  const skipped = value.length - found.length;
  const issues =
    skipped === 0
      ? []
      : [
          warning(
            'meta.phases',
            `meta.phases has ${skipped} entries that are not a title; skipped`,
          ),
        ];
  return {
    titles: found.map((each) => each.title),
    entries: found.map((each) => each.entry),
    issues,
  };
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
  const whenToUse = typeof fields[WHEN_TO_USE] === 'string' ? fields[WHEN_TO_USE] : undefined;
  const extra = Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) => !CORE_KEYS.has(key) && !(key === WHEN_TO_USE && whenToUse !== undefined),
    ),
  );
  return {
    meta: {
      name: name.trim(),
      description,
      phases: phases.titles,
      phaseEntries: phases.entries,
      whenToUse,
      extra,
    },
    issues: phases.issues,
  };
}

const startsWithMeta = (tokens: readonly JsToken[]): boolean =>
  OPENING.every((word, index) => tokens[index]?.text === word);

/** Whether the tokens that came before a lexical problem still can be the start of `export const meta =`. */
const couldStartMeta = (tokens: readonly JsToken[]): boolean =>
  OPENING.every((word, index) => tokens[index] === undefined || tokens[index]?.text === word);

const notJavaScript = (problem: string): PluginIssue =>
  error('meta', `the script is not valid JavaScript: ${problem}`);

/** The script does not begin with `export const meta =`: not the first statement, or a lexical problem cut it short. */
function notMeta(tokens: readonly JsToken[], problem: string | undefined): ScriptHead {
  if (problem !== undefined && couldStartMeta(tokens)) {
    return nothing([notJavaScript(problem)], tokens);
  }
  const message = '`export const meta = {…}` must be the first statement of the script';
  return nothing([error('meta', message)], tokens);
}

/**
 * Splits a script at the end of its `meta` statement and reads the literal. What the docs leave open
 * (the severity of each finding, blank names) is in spec/judgments.md. A lexical problem (an
 * unterminated string, template or comment) is the runtime's to report when it lies after the `meta`
 * statement ("If the body has a syntax error, Claude Code reports it when you run the workflow"): the
 * `meta` is still read. When the literal cannot be read at all, the problem may be what broke it, so
 * it is the error (judgment).
 */
export function readScriptHead(source: string): ScriptHead {
  const { tokens, problem } = tokenize(source);
  if (!startsWithMeta(tokens)) return notMeta(tokens, problem);
  const read = readObjectLiteral(tokens, OPENING.length);
  if (read.found === undefined) {
    if (problem !== undefined) return nothing([notJavaScript(problem)], tokens);
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
