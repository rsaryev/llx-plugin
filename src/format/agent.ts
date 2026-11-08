import { error, warning, type PluginIssue } from './issues.ts';
import { parseFrontmatter, type Frontmatter } from './frontmatter.ts';
import { readText } from './frontmatter-values.ts';
import { agentFileName, agentNameProblem, MAX_AGENT_NAME, scopedAgentName } from './agent-name.ts';
import type { AgentOrigin, AgentReadResult, AgentRecord } from './agent-record.ts';
import { readAgentFields, type AgentFieldsRead } from './agent-field-read.ts';
import { unrecognizedFields } from './agent-unrecognized.ts';

type FileOrigin = Extract<AgentOrigin, { plugin?: undefined }>;
type PluginOrigin = Extract<AgentOrigin, { source: 'plugin' }>;

const skipped = (
  reason: 'documentation' | 'invalid',
  issues: readonly PluginIssue[],
): AgentReadResult => ({ outcome: 'skipped', reason, agent: undefined, issues });

/** `problem` is set exactly when the YAML does not parse or is not a table. */
const unparsed = (front: Frontmatter): boolean => front.problem !== undefined;

/** `does not parse: <parser's reason> (line 3, column 4)`, so the author can find it. */
function parseProblem(front: Frontmatter): string {
  const where = front.line === undefined ? '' : ` (line ${front.line}, column ${front.column})`;
  return `Frontmatter does not parse: ${front.problem ?? 'unknown problem'}${where}`;
}

/** No field beyond `name` and `description`: the frontmatter did not parse. */
const NO_FIELDS: AgentFieldsRead = { values: {}, ignored: [], issues: [] };

/**
 * The agent Claude Code would load. `fields` is what the registry read; `unknown` the top-level
 * fields Claude Code does not recognize. A key of the official `AgentDefinition` goes into
 * `definition`; the keys it has no place for are `extras` (and `hooks`).
 */
function record(
  origin: AgentOrigin,
  basics: { readonly name: string; readonly description: string; readonly prompt: string },
  fields: AgentFieldsRead,
  unknown: AgentRecord['unrecognized'],
): AgentRecord {
  const { name, description, prompt } = basics;
  const { color, isolation, experimental, hooks, ...official } = fields.values;
  const scopedName =
    origin.plugin === undefined
      ? name
      : scopedAgentName(origin.plugin.name, origin.plugin.relativePath, name);
  return {
    name,
    scopedName,
    source: origin.source,
    path: origin.path,
    definition: { description, prompt, ...official },
    extras: {
      ...(color !== undefined && { color }),
      ...(isolation !== undefined && { isolation }),
      ...(experimental?.cacheTtl !== undefined && { cacheTtl: experimental.cacheTtl }),
    },
    hooks,
    ignored: fields.ignored,
    unrecognized: unknown,
  };
}

/**
 * A project, user, managed or `--add-dir` agent file (sub-agents.md, "Subagent files Claude Code
 * skips"). No name is documentation and is skipped silently; the other problems skip the file and
 * are reported (Claude Code writes them to the debug log).
 */
function readFileAgent(front: Frontmatter, origin: FileOrigin): AgentReadResult {
  const invalid = (message: string) => skipped('invalid', [error(origin.path, message)]);
  if (unparsed(front)) return invalid(parseProblem(front));
  const name = readText('name', front.fields.name);
  if (name.problem) return invalid(`Invalid "name": it ${name.problem.reason}`);
  if (name.value === undefined) return skipped('documentation', []);
  const problem = agentNameProblem(name.value);
  if (problem) return invalid(`Invalid "name": "${name.value}" ${problem}`);
  const description = readText('description', front.fields.description);
  if (description.problem)
    return invalid(`Invalid "description": it ${description.problem.reason}`);
  if (description.value === undefined) {
    return invalid(`Agent "${name.value}" has a name but no "description"`);
  }
  const fields = readAgentFields(front.fields, { plugin: false, path: origin.path });
  const basics = { name: name.value, description: description.value, prompt: front.body };
  return {
    outcome: 'loaded',
    agent: record(origin, basics, fields, unrecognizedFields(front.fields)),
    issues: fields.issues,
  };
}

/** A plugin agent's name: the frontmatter's when usable, else the file's (components.md). */
function pluginName(
  front: Frontmatter,
  origin: PluginOrigin,
): { name: string; issues: PluginIssue[] } {
  const fallback = agentFileName(origin.path);
  const given = readText('name', front.fields.name);
  if (given.problem) {
    const message = `Invalid "name": it ${given.problem.reason}; the agent is named after its file`;
    return { name: fallback, issues: [warning(origin.path, message)] };
  }
  if (given.value === undefined) return { name: fallback, issues: [] };
  if (given.value.length > MAX_AGENT_NAME) {
    const message = `"name" is longer than ${MAX_AGENT_NAME} characters and is ignored; the agent is named after its file`;
    return { name: fallback, issues: [warning(origin.path, message)] };
  }
  return { name: given.value, issues: [] };
}

/**
 * A plugin agent file (plugins/components.md, "Agents" and "Frontmatter fields in plugin
 * agents"): it always loads. A missing, too long or unusable name falls back to the file name;
 * frontmatter that does not parse loads with every field ignored and the description
 * `Agent from <plugin> plugin`.
 */
function readPluginAgent(front: Frontmatter, origin: PluginOrigin): AgentReadResult {
  const fallbackDescription = `Agent from ${origin.plugin.name} plugin`;
  if (unparsed(front)) {
    const message = `${parseProblem(front)}; the agent loads with every field ignored`;
    const name = agentFileName(origin.path);
    return {
      outcome: 'loaded',
      agent: record(
        origin,
        { name, description: fallbackDescription, prompt: front.body },
        NO_FIELDS,
        [],
      ),
      issues: [warning(origin.path, message)],
    };
  }
  const { name, issues } = pluginName(front, origin);
  const description = readText('description', front.fields.description);
  const lacking = description.value === undefined;
  if (lacking) {
    // Judgment (spec/judgments.md): the docs give the fallback description for unparseable
    // frontmatter only; the same text stands in for a missing or unusable one.
    const reason = description.problem ? `it ${description.problem.reason}` : 'it is missing';
    issues.push(
      warning(origin.path, `Invalid "description": ${reason}; using "${fallbackDescription}"`),
    );
  }
  const fields = readAgentFields(front.fields, { plugin: true, path: origin.path });
  const basics = {
    name,
    description: description.value ?? fallbackDescription,
    prompt: front.body,
  };
  return {
    outcome: 'loaded',
    agent: record(origin, basics, fields, unrecognizedFields(front.fields)),
    issues: [...issues, ...fields.issues],
  };
}

/**
 * Read one agent file (sub-agents.md, "Frontmatter reference"): the Markdown body is the system
 * prompt, `name` and `description` are required. Never throws; a file Claude Code would skip is
 * `skipped`, with the reason it names.
 */
export function readAgent(text: string, origin: AgentOrigin): AgentReadResult {
  const front = parseFrontmatter(text);
  return origin.plugin === undefined
    ? readFileAgent(front, origin)
    : readPluginAgent(front, origin);
}
