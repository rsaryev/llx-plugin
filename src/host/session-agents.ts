import { readFlagAgents } from '../format/agent-flag.ts';
import { warning, type PluginIssue } from '../format/issues.ts';
import {
  builtinAgents,
  catalogAgentOf,
  resolveAgents,
  scanAgents,
  type AgentCatalog,
  type BuiltinPolicy,
  type CatalogAgent,
  type ScannedAgent,
} from '../agents/catalog/index.ts';
import { createCustomizationPolicy } from '../settings/customization/index.ts';
import type { SessionDirectories } from './session-directories.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { SessionOptions } from './types.ts';

/**
 * A session's subagents (sub-agents.md, "Choose the subagent scope"): the built-ins, the `--agents`
 * flag, the managed, project, personal and added `.claude/agents/` folders and the plugins' `agents/`,
 * resolved by priority. The folders are read through the host's `FolderScan` port when the session is
 * asked to (`reloadAgents`); everything else is known when the session opens.
 */

export interface AgentsReload {
  /** The flag's and the files' problems: a file skipped, a field that did not read. */
  readonly issues: readonly PluginIssue[];
  /** The agents folders to watch for changes, those that exist now (sub-agents.md, "Write subagent files"). */
  readonly watch: readonly string[];
}

export interface AgentPart {
  /**
   * Reads the agents folders again: the managed directory, `~/.claude/agents`, the project's `.claude/agents`
   * up to the repository root and the added directories'. The first call is what lists them at all.
   * Needs `HostPorts.folders`.
   */
  reloadAgents(options: { readonly signal: AbortSignal }): Promise<AgentsReload>;
  /** Every subagent of the session as of the last read, one definition per name (`resolveAgents`). */
  agentCatalog(): AgentCatalog;
  /** The plugin an agent of the `plugin` source belongs to. */
  pluginOf(agent: CatalogAgent): ActivePlugin | undefined;
}

const NOT_WIRED = warning(
  'agents',
  'the host gave no folder-scan port, so no personal, project, managed or added-directory agent is read',
);

const ON = '1';

const NO_FLAG: ReturnType<typeof readFlagAgents> = { agents: [], issues: [] };

/** The environment switches of "Built-in subagents". */
function builtinPolicyOf(state: HostState, options: SessionOptions): BuiltinPolicy {
  const { environment } = state.options.ports;
  return {
    interactive: options.interactive ?? true,
    disableExplorePlan: environment.get('CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS') === ON,
    disableAll: environment.get('CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS') === ON,
  };
}

function pluginAgents(state: HostState) {
  const owners = new Map<CatalogAgent, ActivePlugin>();
  const agents = state.active.flatMap((plugin) =>
    plugin.catalog.agents.map((record) => {
      const agent = catalogAgentOf(record);
      owners.set(agent, plugin);
      return agent;
    }),
  );
  return { owners, agents };
}

export function createAgentPart(
  state: HostState,
  options: SessionOptions,
  directories: SessionDirectories,
): AgentPart {
  const policy = createCustomizationPolicy(state.view, state.parent);
  const flag = options.agents === undefined ? NO_FLAG : readFlagAgents(options.agents);
  const flagAgents = flag.agents.map(catalogAgentOf);
  const plugins = pluginAgents(state);
  const builtin = policy.loads('agents', 'builtIn')
    ? builtinAgents(builtinPolicyOf(state, options))
    : [];
  let scanned: readonly ScannedAgent[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (signal: AbortSignal): Promise<AgentsReload> => {
    const { folders, locations } = state.options.ports;
    if (folders === undefined) return { issues: [...flag.issues, NOT_WIRED], watch: [] };
    const outcome = await scanAgents({
      folders,
      request: {
        home: locations.homeDir(),
        cwd: directories.cwd(),
        addedDirectories: directories.added(),
      },
      allows: (origin) => policy.loads('agents', origin),
      signal,
    });
    scanned = outcome.entries;
    return { issues: [...flag.issues, ...outcome.issues], watch: outcome.watch };
  };

  return {
    reloadAgents: (reload) => {
      const result = queue.then(() => read(reload.signal));
      queue = result.catch(() => undefined);
      return result;
    },
    agentCatalog: () =>
      resolveAgents({
        builtin,
        flag: flagAgents,
        scanned,
        plugin: plugins.agents,
        ...(options.permissionRules === undefined ? {} : { denied: options.permissionRules }),
      }),
    pluginOf: (agent) => plugins.owners.get(agent),
  };
}
