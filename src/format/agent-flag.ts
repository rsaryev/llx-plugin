import { agentRecord } from './agent.ts';
import { readAgentFields, type AgentFieldsRead, type ReadFieldName } from './agent-field-read.ts';
import { agentNameProblem } from './agent-name.ts';
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

const isTable = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const refused = (path: string, message: string): FlagAgentsRead => ({
  agents: [],
  issues: [error(path, message)],
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

function readOne(name: string, definition: unknown): FlagAgentsRead {
  const path = `${FLAG_PATH}.${name}`;
  const problem = agentNameProblem(name);
  if (name.startsWith('-'))
    return refused(FLAG_PATH, `${name}: agent names must not start with '-'`);
  if (problem !== undefined || name === '') {
    return refused(path, `Invalid agent name "${name}": it ${problem ?? 'is empty'}`);
  }
  if (!isTable(definition)) return refused(path, 'The definition is not an object');
  const description = readText('description', definition.description);
  if (description.value === undefined) {
    return refused(path, `Agent "${name}" has no "description"`);
  }
  const prompt = promptOf(definition);
  if (prompt === undefined) {
    return refused(path, `Agent "${name}" has no "prompt" (it may be an empty string)`);
  }
  const fields = fieldsOf(definition, path);
  const agent = agentRecord(
    { path, source: 'flag' },
    { name, description: description.value, prompt },
    fields,
    unrecognizedFields(without(definition, ['prompt', ...NOT_ACCEPTED])),
  );
  return { agents: [agent], issues: fields.issues };
}

/**
 * Reads the parsed `--agents` value. A definition that cannot load is an error and is left out; the
 * rest still load. Judgment (spec/judgments.md): the docs do not say which keys a definition must
 * have, so `description` and `prompt` are required (they are the two fields every subagent has).
 */
export function readFlagAgents(raw: unknown): FlagAgentsRead {
  if (!isTable(raw)) {
    return refused(FLAG_PATH, 'The value is not a JSON object of agent names to definitions');
  }
  const reads = Object.entries(raw).map(([name, definition]) => readOne(name, definition));
  return {
    agents: reads.flatMap((read) => read.agents),
    issues: reads.flatMap((read) => read.issues),
  };
}
