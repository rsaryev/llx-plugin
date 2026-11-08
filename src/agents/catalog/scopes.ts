import type { AgentSource } from '../../format/agent-record.ts';
import { projectDirectories } from '../../foundation/project-directories.ts';
import type { FolderScan } from '../../ports/folder-scan.ts';
import type { AgentsOrigin } from '../../settings/customization/sources.ts';

/**
 * Where subagents come from and which wins a shared name (sub-agents.md, "Choose the subagent scope",
 * the table "Location, Scope, Priority"): managed settings, the `--agents` flag, `.claude/agents/`,
 * `~/.claude/agents/`, then a plugin's `agents/`. A registry typed over the sources, so a new source
 * fails the typecheck until it says its rank and where its folders are. A built-in ranks below all of
 * them (a user or project subagent named `Explore` "overrides the built-in").
 */

/** What a scan is asked for. */
export interface AgentScanRequest {
  readonly home: string;
  /** The working directory the session started in (or moved to with `/cd`). */
  readonly cwd: string;
  /** The directories passed with `--add-dir` or `/add-dir`, in the order they were added. */
  readonly addedDirectories?: readonly string[];
}

export interface AgentFolderContext {
  readonly folders: FolderScan;
  readonly request: AgentScanRequest;
  readonly signal?: AbortSignal;
}

/** One folder of a source: below each base directory, `.claude/agents`. */
export interface AgentFolder {
  /** The name `strictPluginOnlyCustomization` knows it by. */
  readonly origin: AgentsOrigin;
  /** Whether Claude Code watches it for changes ("watches `~/.claude/agents/` and `.claude/agents/`"). */
  readonly watched: boolean;
  /** The base directories, in precedence order within the folder. */
  bases(context: AgentFolderContext): Promise<readonly string[]>;
}

export interface AgentScopeRule {
  /** The Priority column: 1 is the highest. */
  readonly priority: number;
  /** The folders read through the folder-scan port; none for the flag and for plugins. */
  readonly folders: readonly AgentFolder[];
}

/** The folder below a base directory. */
export const AGENTS_FOLDER = '.claude/agents';

const only = (dir: string | undefined): Promise<readonly string[]> =>
  Promise.resolve(dir === undefined ? [] : [dir]);

export const AGENT_SCOPE_RULES: { readonly [S in AgentSource]: AgentScopeRule } = {
  managed: {
    priority: 1,
    folders: [
      {
        origin: 'managedDirectory',
        watched: false,
        bases: ({ folders }) => only(folders.managedDirectory()),
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
        bases: ({ folders, request, signal }) => projectDirectories(folders, request.cwd, signal),
      },
      {
        // "Claude Code doesn't watch `.claude/agents/` inside directories added with `--add-dir`".
        origin: 'addDir',
        watched: false,
        bases: ({ request }) => Promise.resolve(request.addedDirectories ?? []),
      },
    ],
  },
  user: {
    priority: 4,
    folders: [{ origin: 'userAgents', watched: true, bases: ({ request }) => only(request.home) }],
  },
  plugin: { priority: 5, folders: [] },
};

/** The priority a built-in has: after every source of the table. */
export const BUILTIN_PRIORITY = 6;
