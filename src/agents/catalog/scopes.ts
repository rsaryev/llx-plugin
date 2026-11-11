import type { AgentSource } from '../../format/agent-record.ts';
import { SCOPE_PLACES, type ScopePlaces } from '../../foundation/scope-folders.ts';
import type { AgentsOrigin } from '../../settings/customization/sources.ts';

/**
 * Where subagents come from and which wins a shared name (sub-agents.md, "Choose the subagent scope",
 * the table "Location, Scope, Priority"): managed settings, the `--agents` flag, `.claude/agents/`,
 * `~/.claude/agents/`, then a plugin's `agents/`. A registry typed over the sources, so a new source
 * fails the typecheck until it says its rank and where its folders are. A built-in ranks below all of
 * them (a user or project subagent named `Explore` "overrides the built-in").
 */

/** One folder of a source: below each base directory, `.claude/agents` (and `<extra>/agents`). */
export interface AgentFolder {
  /** The name `strictPluginOnlyCustomization` knows it by. */
  readonly origin: AgentsOrigin;
  /** Whether Claude Code watches it for changes ("watches `~/.claude/agents/` and `.claude/agents/`"). */
  readonly watched: boolean;
  /** The folders read below the base directories, in precedence order (`SCOPE_PLACES`). */
  readonly places: ScopePlaces;
}

export interface AgentScopeRule {
  /** The Priority column: 1 is the highest. */
  readonly priority: number;
  /** The folders read through the folder-scan port; none for the flag and for plugins. */
  readonly folders: readonly AgentFolder[];
}

/** The folder below a base directory's scope folder (`.claude`, or one of the host's extra folders). */
export const AGENTS_FOLDER = 'agents';

export const AGENT_SCOPE_RULES: { readonly [S in AgentSource]: AgentScopeRule } = {
  managed: {
    priority: 1,
    folders: [
      {
        origin: 'managedDirectory',
        watched: false,
        places: SCOPE_PLACES.managed,
      },
    ],
  },
  flag: { priority: 2, folders: [] },
  project: {
    priority: 3,
    folders: [
      {
        origin: 'projectAgents',
        watched: true,
        places: SCOPE_PLACES.project,
      },
      {
        // "Claude Code doesn't watch `.claude/agents/` inside directories added with `--add-dir`".
        origin: 'addDir',
        watched: false,
        places: SCOPE_PLACES.added,
      },
    ],
  },
  user: {
    priority: 4,
    folders: [{ origin: 'userAgents', watched: true, places: SCOPE_PLACES.user }],
  },
  plugin: { priority: 5, folders: [] },
};

/** The priority a built-in has: after every source of the table. */
export const BUILTIN_PRIORITY = 6;
