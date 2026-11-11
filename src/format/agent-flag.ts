import { isRecord } from '../protocol/is-record.ts';
import { agentRecord } from './agent.ts';
import { readAgentFields, type AgentFieldsRead, type ReadFieldName } from './agent-field-read.ts';
import type { AgentRecord } from './agent-record.ts';
import { unrecognizedFields } from './agent-unrecognized.ts';
import { readText } from './frontmatter-values.ts';
import { error, type PluginIssue } from './issues.ts';

/**
 * The agents of the `--agents` flag (sub-agents.md, "Choose the subagent scope"): a JSON object whose
 * top-level keys are agent names and whose values are definitions. The host reads and parses the flag
 * (or the file `-p` takes); this reads the parsed value the way Claude Code reads a definition:
 * `prompt` is the system prompt, the other keys are the frontmatter fields of a file, and `color` and
 * `experimental` "aren't accepted here and are ignored rather than rejected".
 */

const FLAG_PATH = '--agents';

/** Fields a CLI-defined agent does not accept; they are dropped without a word. */
const NOT_ACCEPTED: readonly ReadFieldName[] = ['color', 'experimental'];

/** Keys read here, not by the field registry. */
const OWN_KEYS: ReadonlySet<string> = new Set(['prompt', 'description', 'name']);

export interface FlagAgentsRead {
  readonly agents: readonly AgentRecord[];
  /** Errors name `--agents` or `--agents.<name>`; a refused definition is not in `agents`. */
  readonly issues: readonly PluginIssue[];
}

/** One definition as read; `dashed` is the error of a name that starts with `-`, which loads nowhere. */
interface OneRead extends FlagAgentsRead {
  readonly dashed: PluginIssue | undefined;
}

const refused = (path: string, message: string, dashed?: PluginIssue): OneRead => ({
  agents: [],
  issues: [error(path, message)],
  dashed,
});

/** A value that is no object of definitions at all: nothing to name a `-` for. */
const refusedWhole = (message: string): FlagAgentsRead => ({
  agents: [],
  issues: [error(FLAG_PATH, message)],
});

/** The text of `prompt` (empty allowed), or why the definition is refused. */
function promptOf(definition: Readonly<Record<string, unknown>>): string | undefined {
  const { prompt } = definition;
  return typeof prompt === 'string' ? prompt : undefined;
}

const without = (
  definition: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(definition).filter(([key]) => !keys.includes(key)));

/** The part of the definition the field registry reads, and which dropped fields it had. */
function fieldsOf(definition: Readonly<Record<string, unknown>>, path: string): AgentFieldsRead {
  const read = readAgentFields(without(definition, [...OWN_KEYS, ...NOT_ACCEPTED]), {
    plugin: false,
    path,
  });
  const dropped = NOT_ACCEPTED.filter((field) => Object.hasOwn(definition, field));
  return { ...read, ignored: [...read.ignored, ...dropped] };
}

/**
 * A problem with the name itself; a name that starts with `-` is not one (it is checked after the
 * schema). Oracle 2.1.322 (spec/judgments.md): the binary loads a key with `:` or over 256 characters,
 * so neither file rule binds the flag; an empty key is the kit's refusal.
 */
const nameProblem = (name: string): string | undefined => (name === '' ? 'is empty' : undefined);

/**
 * What `--agent <name>` finds a flag agent by without its scope: the last `:` segment, as for a
 * plugin agent (oracle 2.1.322: `--agent c` runs `a:b:c`). A name without `:` is its own.
 */
const bareName = (name: string): string => name.slice(name.lastIndexOf(':') + 1);

function readOne(name: string, definition: unknown): OneRead {
  const path = `${FLAG_PATH}.${name}`;
  const dashed = name.startsWith('-')
    ? error(FLAG_PATH, `${name}: agent names must not start with '-'`)
    : undefined;
  const problem = nameProblem(name);
  if (problem !== undefined) return refused(path, `Invalid agent name "${name}": it ${problem}`);
  if (!isRecord(definition)) return refused(path, 'The definition is not an object', dashed);
  const description = readText('description', definition.description);
  if (description.value === undefined) {
    return refused(path, `Agent "${name}" has no "description"`, dashed);
  }
  const prompt = promptOf(definition);
  if (prompt === undefined) {
    return refused(path, `Agent "${name}" has no "prompt" (it may be an empty string)`, dashed);
  }
  const fields = fieldsOf(definition, path);
  if (dashed !== undefined) return { agents: [], issues: fields.issues, dashed };
  const agent = agentRecord(
    { path, source: 'flag' },
    { name: bareName(name), description: description.value, prompt },
    fields,
    unrecognizedFields(without(definition, ['prompt', ...NOT_ACCEPTED])),
  );
  return { agents: [{ ...agent, scopedName: name }], issues: fields.issues, dashed };
}

/** errors.md: "When there are more than 20 problem lines, Claude Code prints the first 20 and replaces the rest with `…and N more`." */
const MAX_PROBLEM_LINES = 20;

function capped(problems: readonly PluginIssue[]): readonly PluginIssue[] {
  if (problems.length <= MAX_PROBLEM_LINES) return problems;
  const more = problems.length - MAX_PROBLEM_LINES;
  return [...problems.slice(0, MAX_PROBLEM_LINES), error(FLAG_PATH, `…and ${more} more`)];
}

const isError = (issue: PluginIssue): boolean => issue.severity === 'error';

/**
 * Reads the parsed `--agents` value. A definition that cannot load is an error and is left out; the
 * rest still load (Claude Code stops at the first failing check; a host has no process to stop, so the
 * rest load and the checks only decide which errors are reported). Judgment (spec/judgments.md): the
 * docs do not say which keys a definition must
 * have, so `description` and `prompt` are required (they are the two fields every subagent has).
 */
export function readFlagAgents(raw: unknown): FlagAgentsRead {
  if (!isRecord(raw)) {
    return refusedWhole('The value is not a JSON object of agent names to definitions');
  }
  const reads = Object.entries(raw).map(([name, definition]) => readOne(name, definition));
  const issues = reads.flatMap((read) => read.issues);
  const schema = issues.filter(isError);
  // errors.md orders the checks: the schema problems of every definition first, and the `-` names only
  // when none is left ("you see the second only after you fix the first").
  const dashed = reads.flatMap((read) => read.dashed ?? []);
  return {
    agents: reads.flatMap((read) => read.agents),
    issues: [...capped(schema.length > 0 ? schema : dashed), ...issues.filter((i) => !isError(i))],
  };
}
