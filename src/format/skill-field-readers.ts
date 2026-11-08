import { readTable, readText, type FieldProblem, type FieldRead } from './frontmatter-values.ts';
import { readHooksSettings } from './hooks-settings.ts';
import type { InvocableFrontmatter } from './skill-types.ts';

/**
 * Readers of the skill frontmatter fields (skills.md, "Frontmatter reference"). Each takes the
 * raw YAML value and its key and returns what it sets plus the problems with the value; a value
 * the field does not take is dropped with a problem, never thrown (the skill still loads).
 */

/** What one field sets: a piece of the skill, `name` (resolved elsewhere) included. */
export type SkillFieldValues = Partial<InvocableFrontmatter> & { readonly name?: string };

export interface FieldOutcome {
  readonly values: SkillFieldValues;
  readonly problems: readonly FieldProblem[];
}

export type FieldReader = (value: unknown, key: string) => FieldOutcome;

/** Turn a `FieldRead` into an outcome: nothing is set for an absent or dropped value. */
export const take = <T>(
  read: FieldRead<T>,
  toValues: (value: T) => SkillFieldValues,
): FieldOutcome => ({
  values: read.value === undefined ? {} : toValues(read.value),
  problems: read.problem === undefined ? [] : [read.problem],
});

/** A YAML scalar written back as text; blank stays blank. */
const scalarText = (item: unknown): string | undefined =>
  typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    ? String(item).trim()
    : undefined;

/** One pair of a map item, as `key: value` (`[topic:]` is a null value, written `topic:`). */
function hintPair([name, value]: readonly [string, unknown]): string | undefined {
  if (value === null) return `${name}:`;
  const text = scalarText(value);
  return text === undefined ? undefined : `${name}: ${text}`;
}

/** A list item of an unquoted hint: a scalar, or a map such as `topic: foo | bar` written back. */
function hintItem(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) return scalarText(item);
  if (Array.isArray(item)) return undefined;
  const pairs = Object.entries(item).map(hintPair);
  return pairs.includes(undefined) ? undefined : pairs.join(', ');
}

/**
 * `argument-hint`, "[issue-number]" in the docs. Unquoted, that is a YAML flow list, so a list
 * is written back in its brackets, a map item as `key: value`: `[topic: foo | bar]`, the
 * changelog's example, reads as the text it was typed as (spec/judgments.md).
 */
export function readArgumentHint(value: unknown, key: string): FieldOutcome {
  if (!Array.isArray(value))
    return take(readText(key, value), (argumentHint) => ({ argumentHint }));
  const items = value.map(hintItem);
  const parts = items.filter((part): part is string => part !== undefined && part !== '');
  return {
    values: parts.length === 0 ? {} : { argumentHint: `[${parts.join(', ')}]` },
    problems: items.includes(undefined) ? [{ key, reason: 'has an item that is not text' }] : [],
  };
}

/** The Agent Skills spec's limit, quoted by skills.md: "a string of up to 500 characters". */
export const COMPATIBILITY_LIMIT = 500;

/** `compatibility` is kept whole; a longer one is reported (spec/judgments.md: a warning). */
export function readCompatibility(value: unknown, key: string): FieldOutcome {
  const read = readText(key, value);
  const length = read.value === undefined ? 0 : Array.from(read.value).length;
  const tooLong: FieldProblem[] =
    length > COMPATIBILITY_LIMIT
      ? [{ key, reason: `has ${length} characters; the limit is ${COMPATIBILITY_LIMIT}` }]
      : [];
  const outcome = take(read, (compatibility) => ({ compatibility }));
  return { values: outcome.values, problems: [...outcome.problems, ...tooLong] };
}

/**
 * `hooks`, validated by the hooks reader and carried in the official shape. The skill still
 * loads when the reader refuses the block, only without its hooks (spec/judgments.md).
 */
export function readHooks(value: unknown, key: string): FieldOutcome {
  const table = readTable(key, value);
  if (table.value === undefined) return take(table, () => ({}));
  const { hooks, issues } = readHooksSettings(table.value);
  const problems = issues.map((found) => ({
    key:
      found.path === key || found.path.startsWith(`${key}.`) ? found.path : `${key}.${found.path}`,
    reason: found.message,
  }));
  return { values: Object.keys(hooks).length === 0 ? {} : { hooks }, problems };
}
