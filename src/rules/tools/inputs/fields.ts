import { z } from 'zod';
import type {
  AgentInput,
  AskUserQuestionInput,
  BashInput,
  ExitPlanModeInput,
  FileEditInput,
  FileReadInput,
  FileWriteInput,
  GlobInput,
  GrepInput,
  WebFetchInput,
  WebSearchInput,
} from '../../../protocol/official-tools.ts';
import { answersSchema, questionsSchema } from './ask-user-question.ts';
import { choice, flag, list, num, text } from './field-schemas.ts';
import { WEB_SEARCH_MODES } from './web-search.ts';

/** The JSON types of the tables of hooks.md ("PreToolUse input"). */
export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * What a rule can do with a field (permissions.md, "Match by input parameter"):
 * - `primary`: the content field of the tool; a parameter rule on it is ignored with a warning.
 * - `subject`: the field the tool's own specifier reads without being primary (the subagent type of
 *   `Agent(Explore)`); `Agent(subagent_type:Explore)` still matches it.
 * - `param`: any other scalar; a deny or ask `Tool(field:value)` rule matches it.
 * - `structured`: an array or object; "Fields nested inside an object or array are not matchable".
 */
export type FieldRole = 'subject' | 'param' | 'primary' | 'structured';

/** Where a field is documented: the SDK's input type, or only the docs (which the compiler cannot tie to the SDK). */
export type FieldSource = 'sdk' | 'docs';

export interface FieldSpec {
  readonly type: FieldType;
  readonly optional: boolean;
  readonly role: FieldRole;
  readonly source: FieldSource;
  /** The schema of the field's value, with `optional` already applied. */
  readonly schema: z.ZodType;
}

type Draft = Omit<FieldSpec, 'source'>;

const draft = (type: FieldType, role: FieldRole, schema: z.ZodType): Draft => ({
  type,
  role,
  optional: false,
  schema,
});
const string = (role: FieldRole = 'param'): Draft => draft('string', role, text);
const number = (): Draft => draft('number', 'param', num);
const boolean = (): Draft => draft('boolean', 'param', flag);
const oneOf = (values: readonly [string, ...string[]]): Draft =>
  draft('string', 'param', choice(values));
const array = (schema: z.ZodType): Draft => draft('array', 'structured', schema);
const object = (schema: z.ZodType): Draft => draft('object', 'structured', schema);
const optional = (field: Draft): Draft => ({
  ...field,
  optional: true,
  schema: field.schema.optional(),
});

type Fields = Readonly<Record<string, FieldSpec>>;

const withSource =
  (source: FieldSource) =>
  (drafts: Readonly<Record<string, Draft>>): Fields =>
    Object.fromEntries(
      Object.entries(drafts).map(([field, entry]) => [field, { ...entry, source }]),
    );

/**
 * The fields of a tool that the SDK's input type `I` has: a name that is not a key of `I` fails the
 * typecheck, so an SDK that renames a field breaks here and not in a hook.
 */
/* oxlint-disable typescript/no-unnecessary-type-parameters -- `I` and `K` each appear once by design: the tie is the constraint `K extends keyof I`, which rejects a field the SDK type lacks */
const official =
  <I extends object>() =>
  <K extends keyof I & string>(drafts: { readonly [F in K]: Draft }): Fields =>
    withSource('sdk')(drafts);
/* oxlint-enable typescript/no-unnecessary-type-parameters */

/** Documented fields the SDK's input type lacks: nothing ties them to it, so each says so. */
const documented = withSource('docs');

const merge = (...parts: readonly Fields[]): Fields => Object.assign({}, ...parts);

/** The `Bash` table; PowerShell's "fields match the Bash tool" and the SDK has no PowerShell input (spec/judgments.md). */
const shell = (): Fields =>
  official<BashInput>()({
    command: string('primary'),
    description: optional(string()),
    timeout: optional(number()),
    run_in_background: optional(boolean()),
  });

/**
 * One table per tool of hooks.md ("PreToolUse input"). Optionality is the table's ("Optional ...");
 * where it is silent (the boolean flags `run_in_background`, `replace_all`, `-i`, `multiline`, and
 * Agent, WebFetch and ExitPlanMode fields), the SDK's input type decides (spec/judgments.md).
 */
export const TOOL_INPUT_FIELDS = {
  Bash: shell(),
  PowerShell: shell(),
  Write: official<FileWriteInput>()({ file_path: string('primary'), content: string() }),
  Edit: official<FileEditInput>()({
    file_path: string('primary'),
    old_string: string(),
    new_string: string(),
    replace_all: optional(boolean()),
  }),
  Read: official<FileReadInput>()({
    file_path: string('primary'),
    offset: optional(number()),
    limit: optional(number()),
  }),
  Glob: official<GlobInput>()({ pattern: string(), path: optional(string('primary')) }),
  Grep: official<GrepInput>()({
    pattern: string(),
    path: optional(string('primary')),
    glob: optional(string()),
    output_mode: optional(oneOf(['content', 'files_with_matches', 'count'])),
    '-i': optional(boolean()),
    multiline: optional(boolean()),
  }),
  WebFetch: official<WebFetchInput>()({
    url: string('primary'),
    prompt: string(),
    offset: optional(number()),
  }),
  WebSearch: merge(
    official<WebSearchInput>()({
      query: string(),
      allowed_domains: optional(array(list(text))),
      blocked_domains: optional(array(list(text))),
    }),
    // hooks.md, "WebSearch": "standard" or "extended"; the SDK's WebSearchInput has no `mode`.
    documented({ mode: optional(oneOf(WEB_SEARCH_MODES)) }),
  ),
  Agent: official<AgentInput>()({
    prompt: string(),
    description: string(),
    subagent_type: optional(string('subject')),
    // A string, not the SDK's four aliases: the docs say "model alias" and a full model ID can be sent.
    model: optional(string()),
  }),
  AskUserQuestion: official<AskUserQuestionInput>()({
    questions: array(questionsSchema),
    answers: optional(object(answersSchema)),
  }),
  ExitPlanMode: merge(
    // The entries of the deprecated, ignored field are not inspected.
    official<ExitPlanModeInput>()({ allowedPrompts: optional(array(list(z.unknown()))) }),
    // hooks.md, "ExitPlanMode": injected by Claude Code; the SDK's input is an open index signature.
    documented({ plan: optional(string()), planFilePath: optional(string()) }),
  ),
} satisfies Readonly<Record<string, Fields>>;

export type InputToolName = keyof typeof TOOL_INPUT_FIELDS;
