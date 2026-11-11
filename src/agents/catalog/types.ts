import type { AgentExtras, AgentRecord, AgentSource } from '../../format/agent-record.ts';
import type { FolderSource, PluginSource } from '../../format/component-source.ts';
import type { HooksSettings } from '../../protocol/hook-config.ts';
import type { AgentDefinition } from '../../protocol/official.ts';

/**
 * One subagent a session can run, whatever it came from (sub-agents.md, "Choose the subagent scope"
 * and "Built-in subagents"): a built-in, the `--agents` flag, a file of the managed, project, user or
 * added-directory folders, or a plugin. The catalog holds these in one shape so a call, an @-mention
 * and `--agent` ask one question. The tier is the row of the Priority column a source ranks by.
 */
export type CatalogTier = AgentSource | 'builtin';

/** The scope folders an agent file is read from; `project` also stands for an added directory. */
export type AgentFolderScope = Exclude<AgentSource, 'flag' | 'plugin'>;

/**
 * Where a catalog agent comes from, in the shape `SessionSkill.source` has (`format/component-source`):
 * a plugin by the id the host uses for it, a scope folder, the `--agents` flag (or the SDK `agents`
 * option), or Claude Code's built-ins. `catalogTier` gives the row of the Priority column it ranks by.
 */
export type CatalogSource =
  | PluginSource
  | FolderSource<AgentFolderScope>
  | { readonly kind: 'flag' }
  | { readonly kind: 'builtin' };

/** The tier of each source that is not a folder: a folder source ranks by its scope. */
const KIND_TIER = { plugin: 'plugin', flag: 'flag', builtin: 'builtin' } as const;

/** The row of the Priority column (sub-agents.md, "Choose the subagent scope") a source ranks by. */
export const catalogTier = (source: CatalogSource): CatalogTier =>
  'scope' in source ? source.scope : KIND_TIER[source.kind];

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

/** The source of a record; a plugin record names the plugin by `pluginId`. */
const SOURCE_OF: { readonly [S in AgentSource]: (pluginId: string) => CatalogSource } = {
  managed: () => ({ kind: 'folder', scope: 'managed' }),
  flag: () => ({ kind: 'flag' }),
  project: () => ({ kind: 'folder', scope: 'project' }),
  user: () => ({ kind: 'folder', scope: 'user' }),
  plugin: (pluginId) => ({ kind: 'plugin', pluginId }),
};

/** A plugin record's plugin name: its scoped name up to the first `:`. */
const pluginNameOf = (record: AgentRecord): string => record.scopedName.split(':')[0] ?? '';

/**
 * The catalog entry of an agent read from a file, the flag or a plugin. `pluginId` is the id the host
 * uses for the plugin of a plugin record (a session passes it); without it the plugin's name stands.
 */
export function catalogAgentOf(record: AgentRecord, pluginId?: string): CatalogAgent {
  return {
    name: record.scopedName,
    ownName: record.name,
    source: SOURCE_OF[record.source](pluginId ?? pluginNameOf(record)),
    definition: record.definition,
    extras: record.extras,
    hooks: record.hooks,
    path: record.path,
    // "unless you set `omitClaudeMd` in a custom subagent's definition to start it without the user,
    // project, and local CLAUDE.md files"; the git status snapshot is the one every custom agent loads.
    startsWith: { claudeMd: record.definition.omitClaudeMd !== true, gitStatus: true },
  };
}

/** Which tiers count as built-in; a registry over the tiers, so no code compares one to a string. */
const BUILTIN_SOURCE: { readonly [S in CatalogTier]: boolean } = {
  builtin: true,
  managed: false,
  flag: false,
  project: false,
  user: false,
  plugin: false,
};

export const isBuiltinAgent = (agent: CatalogAgent): boolean =>
  BUILTIN_SOURCE[catalogTier(agent.source)];
