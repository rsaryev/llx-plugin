import type { AgentExtras, AgentRecord, AgentSource } from '../../format/agent-record.ts';
import type { HooksSettings } from '../../protocol/hook-config.ts';
import type { AgentDefinition } from '../../protocol/official.ts';

/**
 * One subagent a session can run, whatever it came from (sub-agents.md, "Choose the subagent scope"
 * and "Built-in subagents"): a built-in, the `--agents` flag, a file of the managed, project, user or
 * added-directory folders, or a plugin. The catalog holds these in one shape so a call, an @-mention
 * and `--agent` ask one question.
 */
export type CatalogSource = AgentSource | 'builtin';

/** What a subagent loads when it starts (sub-agents.md, "Built-in subagents" and "What loads at startup"). */
export interface StartContext {
  /** The user, project and local CLAUDE.md files. */
  readonly claudeMd: boolean;
  /** The git status snapshot. */
  readonly gitStatus: boolean;
}

export interface CatalogAgent {
  /**
   * The identifier a call, an @-mention, `--agent` and a hook matcher use: the frontmatter name, or for
   * a plugin agent its scoped name (`my-plugin:review:security`).
   */
  readonly name: string;
  /** The name without the plugin and folder scope: what `--agent security-reviewer` finds. */
  readonly ownName: string;
  readonly source: CatalogSource;
  /** The official shape; a built-in has an empty prompt (its own is Claude Code's). */
  readonly definition: AgentDefinition;
  readonly extras: AgentExtras;
  /** The frontmatter `hooks`; never set for a plugin or built-in agent. */
  readonly hooks: HooksSettings | undefined;
  /** The file, or `--agents.<name>`; absent for a built-in. */
  readonly path: string | undefined;
  readonly startsWith: StartContext;
}

/** The catalog entry of an agent read from a file, the flag or a plugin. */
export function catalogAgentOf(record: AgentRecord): CatalogAgent {
  return {
    name: record.scopedName,
    ownName: record.name,
    source: record.source,
    definition: record.definition,
    extras: record.extras,
    hooks: record.hooks,
    path: record.path,
    // "unless you set `omitClaudeMd` in a custom subagent's definition to start it without the user,
    // project, and local CLAUDE.md files"; the git status snapshot is the one every custom agent loads.
    startsWith: { claudeMd: record.definition.omitClaudeMd !== true, gitStatus: true },
  };
}

/** Which sources count as built-in; a registry over the sources, so no code compares one to a string. */
const BUILTIN_SOURCE: { readonly [S in CatalogSource]: boolean } = {
  builtin: true,
  managed: false,
  flag: false,
  project: false,
  user: false,
  plugin: false,
};

export const isBuiltinAgent = (agent: CatalogAgent): boolean => BUILTIN_SOURCE[agent.source];
