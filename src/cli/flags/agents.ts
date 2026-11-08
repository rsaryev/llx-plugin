import { isRecord } from '../../settings/record.ts';
import { sideloadRefusal } from './sideload.ts';
import { refuse, type Contribution, type FlagContext } from './types.ts';
import { parseJson, type Parsed } from './values.ts';

/**
 * `--agent` and `--agents` (cli-reference.md, "CLI flags"; sub-agents.md, "Choose the subagent
 * scope" and "Invoke subagents explicitly"; errors.md, "Invalid `--agents` configuration"). `--agent`
 * names the session's agent and "overrides the `agent` setting". `--agents` is JSON of definitions
 * keyed by name; "with `--print`, the value can instead be the path to a JSON file"; Claude Code
 * "validates the value at startup and exits on an invalid one", running the checks "in order and
 * stops at the first one that fails": the JSON, the definitions, the names. `--safe-mode` and
 * `CLAUDE_CODE_SAFE_MODE` "ignore `--agents` entirely"; with `--resume` or `--continue` "an inline
 * JSON value isn't checked and the session starts; a value read from a file is checked on every
 * launch". The refusal wording is errors.md's; what the docs leave open is in
 * spec/judgments.md.
 */

export const agent = (name: string): Contribution => ({ agent: name });

/** "Specify an agent for the current session (overrides the `agent` setting)": the flag wins when both name one. */
export const sessionAgent = (
  flag: string | undefined,
  setting: string | undefined,
): string | undefined => flag ?? setting;

const HEADING = 'Error: Invalid --agents configuration:';
const MAX_PROBLEM_LINES = 20;

/** "`color` and `experimental` aren't accepted here and are ignored rather than rejected." */
const IGNORED_FIELDS: readonly string[] = ['color', 'experimental'];

/** The problems of one definition: `description` and `prompt` are the two a definition always carries; `prompt` may be empty. */
function definitionProblems(name: string, definition: unknown): readonly string[] {
  if (!isRecord(definition)) return [`${name}: must be an object`];
  const problems: string[] = [];
  const description = definition.description;
  if (typeof description !== 'string' || description.trim() === '') {
    problems.push(`${name}.description: Required`);
  }
  if (typeof definition.prompt !== 'string') problems.push(`${name}.prompt: Required`);
  return problems;
}

const invalid = (lines: readonly string[]): Contribution => {
  const shown = lines.slice(0, MAX_PROBLEM_LINES);
  const rest = lines.length - shown.length;
  return refuse([HEADING, ...shown, ...(rest > 0 ? [`…and ${rest} more`] : [])].join('\n'));
};

/** The checks in the order the docs give: schema, then names. */
function checkDefinitions(value: unknown): Contribution {
  if (!isRecord(value)) return invalid(['the value must be a JSON object keyed by agent name']);
  const entries = Object.entries(value);
  const schema = entries.flatMap(([name, definition]) => definitionProblems(name, definition));
  if (schema.length > 0) return invalid(schema);
  const names = entries
    .filter(([name]) => name.startsWith('-'))
    .map(([name]) => `${name}: agent names must not start with '-'`);
  if (names.length > 0) return invalid(names);
  const kept = entries.map(([name, definition]) => [name, withoutIgnored(definition)] as const);
  return { cliAgents: Object.fromEntries(kept) };
}

function withoutIgnored(definition: unknown): unknown {
  return isRecord(definition)
    ? Object.fromEntries(
        Object.entries(definition).filter(([key]) => !IGNORED_FIELDS.includes(key)),
      )
    : definition;
}

const isInline = (value: string): boolean => value.trimStart().startsWith('{');

/** `--safe-mode` or `CLAUDE_CODE_SAFE_MODE=1` ("Equivalent to passing `--safe-mode`", env-vars.md). */
const safeModeOn = ({ given, facts }: FlagContext): boolean =>
  given['--safe-mode'] === true || facts.env.CLAUDE_CODE_SAFE_MODE === '1';

/** The value as JSON, or the refusal: an object starts with `{`; any other value is a path to a file. */
function agentsJson(value: string, context: FlagContext): Parsed | { readonly refusal: string } {
  if (isInline(value)) return parseJson(value);
  if (!context.facts.print) {
    return {
      refusal: 'Error: --agents takes a JSON object, or a file path only with --print (-p)',
    };
  }
  const file = context.facts.files[value];
  if (file === undefined) return { refusal: `Error: --agents file not found: ${value}` };
  return parseJson(file.text);
}

function validated(value: string, context: FlagContext): Contribution {
  const json = agentsJson(value, context);
  if ('refusal' in json) return refuse(json.refusal);
  if ('problem' in json) return invalid([`invalid JSON: ${json.problem}`]);
  return checkDefinitions(json.value);
}

/** An inline value on a resumed session is not checked: it defines agents when valid and is ignored when not (judgment). */
const unchecked = (value: string, { facts }: FlagContext): boolean =>
  isInline(value) && (facts.resume || facts.continuing);

export function agents(value: string, context: FlagContext): Contribution {
  const refusal = sideloadRefusal('--agents', context.facts);
  if (refusal !== undefined) return refuse(refusal);
  if (safeModeOn(context)) return {};
  const result = validated(value, context);
  const failed = (result.refusals ?? []).length > 0;
  return failed && unchecked(value, context) ? {} : result;
}
