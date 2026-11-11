import type { AgentRecord, AgentSource } from './agent-record.ts';

/** sub-agents.md, "Frontmatter reference": a name is "at most 256 characters". */
export const MAX_AGENT_NAME = 256;

/**
 * Why a name cannot be used by a project, user, managed or `--add-dir` agent, or undefined when it
 * can (sub-agents.md, "Subagent files Claude Code skips": a name that "starts with `-`, contains
 * `:`, or is longer than 256 characters"). Judgment: length counts UTF-16 code units (spec/judgments.md).
 */
export function agentNameProblem(name: string): string | undefined {
  if (name.length > MAX_AGENT_NAME) return `is longer than ${MAX_AGENT_NAME} characters`;
  if (name.startsWith('-')) return 'starts with "-"';
  if (name.includes(':'))
    return 'contains ":", which is reserved for plugin-scoped identifiers such as my-plugin:reviewer';
  return undefined;
}

export const validAgentName = (name: string): boolean =>
  name !== '' && agentNameProblem(name) === undefined;

const SEPARATORS = /[\\/]/;
const MARKDOWN_EXTENSION = /\.md$/i;

/**
 * The last segment of a path without its `.md`: what a plugin agent is named without a `name`.
 * Judgment (spec/judgments.md): a segment that is nothing but `.md` keeps its whole text, so a
 * name is never empty.
 */
export function agentFileName(path: string): string {
  const last = path.split(SEPARATORS).at(-1) ?? path;
  return last.replace(MARKDOWN_EXTENSION, '') || last;
}

/**
 * The name a plugin agent is registered under (plugins/components.md, "Organize agents in
 * subfolders"): the plugin name, each subfolder of `relativePath` and `name`, joined by colons.
 * `name` takes the place of the file name only, so `review/security.md` with `name: audit` is
 * `my-plugin:review:audit`. A file the manifest lists has no `relativePath`: no subfolder names.
 */
export function scopedAgentName(
  plugin: string,
  relativePath: string | undefined,
  name: string,
): string {
  const folders = (relativePath?.split(SEPARATORS) ?? [])
    .slice(0, -1)
    .filter((segment) => segment !== '' && segment !== '.');
  return [plugin, ...folders, name].join(':');
}

type HookAgentType = (agent: Pick<AgentRecord, 'name' | 'scopedName'>) => string;

const OWN_NAME: HookAgentType = (agent) => agent.name;
const SCOPED_NAME: HookAgentType = (agent) => agent.scopedName;

/** hooks.md, "SubagentStart": a plugin agent reports `my-plugin:reviewer`, not the bare name. */
const HOOK_AGENT_TYPE: { readonly [S in AgentSource]: HookAgentType } = {
  managed: OWN_NAME,
  flag: OWN_NAME,
  project: OWN_NAME,
  user: OWN_NAME,
  plugin: SCOPED_NAME,
};

/** The `agent_type` hooks receive for this agent, and the value a hook matcher is matched against. */
export const hookAgentType = (agent: Pick<AgentRecord, 'name' | 'scopedName' | 'source'>): string =>
  HOOK_AGENT_TYPE[agent.source](agent);
