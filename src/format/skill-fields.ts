import { EFFORT_LEVELS } from '../protocol/effort.ts';
import {
  readEnum,
  readFlag,
  readList,
  readTable,
  readText,
  type FieldProblem,
} from './frontmatter-values.ts';
import {
  readArgumentHint,
  readCompatibility,
  readHooks,
  take,
  type FieldOutcome,
  type FieldReader,
  type SkillFieldValues,
} from './skill-field-readers.ts';
import { SKILL_SHELLS, type InvocableFrontmatter } from './skill-types.ts';

/**
 * The frontmatter keys of a skill, as the table of skills.md ("Frontmatter reference") lists
 * them. "A field name must match the table exactly, hyphens included: Claude Code ignores a field
 * it doesn't recognize without reporting an error", so this list is closed and an unknown key
 * (`when-to-use`, `Description`) is skipped without an issue.
 */
export const SKILL_FIELDS = [
  'name',
  'description',
  'when_to_use',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'disallowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'background',
  'hooks',
  'paths',
  'shell',
  'metadata',
  'license',
  'compatibility',
] as const;

export type SkillField = (typeof SKILL_FIELDS)[number];

/** One reader per documented key (K1: a registry typed over the keys, no switch). */
export const FIELD_READERS: { readonly [K in SkillField]: FieldReader } = {
  name: (value, key) => take(readText(key, value), (name) => ({ name })),
  description: (value, key) => take(readText(key, value), (description) => ({ description })),
  when_to_use: (value, key) => take(readText(key, value), (whenToUse) => ({ whenToUse })),
  'argument-hint': readArgumentHint,
  arguments: (value, key) =>
    take(readList(key, value, { separators: 'space-or-comma' }), (names) => ({ arguments: names })),
  'disable-model-invocation': (value, key) =>
    take(readFlag(key, value), (flag) => ({ disableModelInvocation: flag })),
  'user-invocable': (value, key) => take(readFlag(key, value), (flag) => ({ userInvocable: flag })),
  'allowed-tools': (value, key) =>
    take(readList(key, value, { separators: 'space-or-comma' }), (list) => ({
      allowedTools: list,
    })),
  'disallowed-tools': (value, key) =>
    take(readList(key, value, { separators: 'space-or-comma' }), (list) => ({
      disallowedTools: list,
    })),
  model: (value, key) => take(readText(key, value), (model) => ({ model })),
  effort: (value, key) => take(readEnum(key, value, EFFORT_LEVELS), (effort) => ({ effort })),
  context: (value, key) =>
    take(readEnum(key, value, ['fork'] as const), (context) => ({ context })),
  agent: (value, key) => take(readText(key, value), (agent) => ({ agent })),
  background: (value, key) => take(readFlag(key, value), (flag) => ({ background: flag })),
  hooks: readHooks,
  paths: (value, key) =>
    take(readList(key, value, { separators: 'comma', braces: true }), (paths) => ({ paths })),
  shell: (value, key) => take(readEnum(key, value, SKILL_SHELLS), (shell) => ({ shell })),
  metadata: (value, key) => take(readTable(key, value), (metadata) => ({ metadata })),
  license: (value, key) => take(readText(key, value), (license) => ({ license })),
  compatibility: readCompatibility,
};

/** Run the reader of every documented key that is present; any other key is skipped. */
export function readSkillFields(fields: Readonly<Record<string, unknown>>): FieldOutcome {
  const values: SkillFieldValues[] = [];
  const problems: FieldProblem[] = [];
  for (const key of SKILL_FIELDS) {
    if (!Object.hasOwn(fields, key)) continue;
    const outcome = FIELD_READERS[key](fields[key], key);
    values.push(outcome.values);
    problems.push(...outcome.problems);
  }
  return {
    values: values.reduce<SkillFieldValues>((all, next) => ({ ...all, ...next }), {}),
    problems,
  };
}

/** The first non-empty line of a Markdown body, as written (skills.md: `description` is optional). */
export function firstContentLine(body: string): string | undefined {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');
}

/**
 * `<` and `>` in `description` and `when_to_use` "show as `&lt;` and `&gt;`" (skills.md, "Angle
 * brackets in a skill description"). The model keeps the text as written; a listing or menu that
 * shows it applies this.
 */
export const escapeAngleBrackets = (text: string): string =>
  text.replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export interface InvocableRead {
  readonly frontmatter: InvocableFrontmatter;
  /** The `name` as declared, not yet resolved to a command name. */
  readonly declaredName?: string;
  readonly problems: readonly FieldProblem[];
}

/**
 * The frontmatter a skill and a command share, with the documented defaults: `disable-model-
 * invocation` false, `user-invocable` true, `background` true, `shell` bash, and the first
 * non-empty body line for a missing `description`. A command file passes its fields without
 * `name` and `paths`, which it does not take.
 */
export function readInvocable(
  fields: Readonly<Record<string, unknown>>,
  body: string,
): InvocableRead {
  const { values, problems } = readSkillFields(fields);
  const { name, ...rest } = values;
  const description = rest.description ?? firstContentLine(body);
  return {
    frontmatter: {
      arguments: [],
      disableModelInvocation: false,
      userInvocable: true,
      allowedTools: [],
      disallowedTools: [],
      background: true,
      paths: [],
      shell: 'bash',
      ...rest,
      ...(rest.shell === undefined ? {} : { shellDeclared: true as const }),
      ...(description === undefined ? {} : { description }),
    },
    ...(name === undefined ? {} : { declaredName: name }),
    problems,
  };
}
