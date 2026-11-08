import { EFFORT_LEVELS } from '../protocol/effort.ts';
import {
  readEnum,
  readFlag,
  readInteger,
  readList,
  readTable,
  readText,
  type FieldRead,
} from './frontmatter-values.ts';
import { warning, type PluginIssue } from './issues.ts';

/** What one agent field read gives: its value, or `undefined` with the issues that say why. */
export interface AgentFieldRead<T> {
  readonly value: T | undefined;
  readonly issues: readonly PluginIssue[];
}

/** The coercer of a field: `path` is the agent file, for the issues it reports. */
export type AgentCoercer<T> = (path: string, key: string, raw: unknown) => AgentFieldRead<T>;

/**
 * A value of the wrong shape is dropped with a warning and the agent still loads: sub-agents.md
 * says only that Claude Code "ignores a field it doesn't recognize without reporting an error",
 * and, for `autoCompactWindow`, that a bad value loads "as if the field were absent". The same is
 * the kit's judgment for every field the docs give no invalid-value rule (spec/judgments.md).
 */
function ignored(path: string, key: string, reason: string): readonly PluginIssue[] {
  return [warning(path, `Invalid "${key}": it ${reason}; the field is ignored`)];
}

/** Adapts a shared coercion (`frontmatter-values.ts`) to the agent shape. */
function adapt<T>(path: string, read: FieldRead<T>): AgentFieldRead<T> {
  const { problem } = read;
  return {
    value: read.value,
    issues: problem === undefined ? [] : ignored(path, problem.key, problem.reason),
  };
}

export const textField: AgentCoercer<string> = (path, key, raw) => adapt(path, readText(key, raw));

export const boolField: AgentCoercer<boolean> = (path, key, raw) => adapt(path, readFlag(key, raw));

/** `tools`, `disallowedTools`, `skills`: "a comma-separated string ... or a YAML list". */
export const tokenList: AgentCoercer<string[]> = (path, key, raw) => {
  const read = adapt(path, readList(key, raw, { separators: 'comma' }));
  return { value: read.value === undefined ? undefined : [...read.value], issues: read.issues };
};

/** A whole number of at least 1. */
export const positiveInt: AgentCoercer<number> = (path, key, raw) =>
  adapt(path, readInteger(key, raw, { min: 1 }));

/** One of `allowed`, exactly. */
export function enumField<T extends string>(allowed: readonly T[]): AgentCoercer<T> {
  return (path, key, raw) => adapt(path, readEnum(key, raw, allowed));
}

/** sub-agents.md, "Choose an effort level": `low`, `medium`, `high`, `xhigh` or `max`. */
export const effortField = enumField(EFFORT_LEVELS);

/** sub-agents.md, "Set the auto-compact window for one subagent": a token count in this range. */
export const AUTO_COMPACT_RANGE = { min: 100_000, max: 1_000_000 } as const;

const LEADING_INTEGER = /^\s*[+-]?\d+/;

/**
 * What Claude Code reads from the field: a YAML number as it is, and a string as its leading
 * integer, because "in frontmatter Claude Code reads `200k` as 200". YAML 1.2 reads `200k` as a
 * string, so the leading integer is how the kit reaches the documented 200. A value with no
 * leading integer reads as nothing (judgment, spec/judgments.md).
 */
function windowTokens(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return undefined;
  const match = LEADING_INTEGER.exec(raw);
  return match === null ? undefined : Number(match[0]);
}

/**
 * `autoCompactWindow`: from 100000 to 1000000. A value out of that range (or not a number) leaves
 * the subagent loading "as if the field were absent", reported with the words the docs tell the
 * author to search the debug log for: `invalid autoCompactWindow`.
 */
export const autoCompactWindow: AgentCoercer<number> = (path, key, raw) => {
  if (raw === undefined || raw === null) return { value: undefined, issues: [] };
  const tokens = windowTokens(raw);
  const { min, max } = AUTO_COMPACT_RANGE;
  if (tokens !== undefined && Number.isSafeInteger(tokens) && tokens >= min && tokens <= max) {
    return { value: tokens, issues: [] };
  }
  const read = tokens === undefined ? 'not a number' : `read as ${tokens}`;
  const message = `invalid ${key} ${JSON.stringify(raw)}: ${read}, outside ${min} to ${max}; the field is ignored`;
  return { value: undefined, issues: [warning(path, message)] };
};

/** `experimental.cacheTtl`: "`5m` or `1h`". */
const CACHE_TTLS = ['5m', '1h'] as const;
export type CacheTtl = (typeof CACHE_TTLS)[number];

/** What the kit keeps of the `experimental` map: only `cacheTtl`. */
export interface Experimental {
  readonly cacheTtl?: CacheTtl;
}

/**
 * The `experimental` map: "Claude Code ignores any other value", so another key is dropped
 * silently, and a `cacheTtl` that is not `5m` or `1h` is dropped with a warning (judgment).
 */
export const experimentalMap: AgentCoercer<Experimental> = (path, key, raw) => {
  const table = readTable(key, raw);
  if (table.value === undefined) return adapt(path, table);
  const ttl = readEnum(`${key}.cacheTtl`, table.value.cacheTtl, CACHE_TTLS);
  const { value, issues } = adapt(path, ttl);
  return { value: value === undefined ? {} : { cacheTtl: value }, issues };
};
