import { readFlagAgents } from '../format/agent-flag.ts';
import { warning, type PluginIssue } from '../format/issues.ts';
import {
  builtinAgents,
  catalogAgentOf,
  resolveAgents,
  scanAgents,
  selectSessionAgent,
  type AgentCatalog,
  type BuiltinPolicy,
  type CatalogAgent,
  type ScannedAgent,
  type SessionAgentChoice,
} from '../agents/catalog/index.ts';
import type { PermissionRule } from '../rules/index.ts';
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

/**
 * What a host that rebuilds its run state per run passes instead of what the session opened with. Each
 * field replaces its `SessionOptions` twin for that one call and is remembered by nothing; a field left
 * out keeps the session's value, and `{ flag: undefined }` means no `--agents` flag.
 */
export interface AgentOverrides {
  /** The deny rules in force for this run (`SessionOptions.permissionRules`). */
  readonly permissionRules?: readonly PermissionRule[];
  /** The `--agents` flag, already parsed (`SessionOptions.agents`). */
  readonly flag?: unknown;
  /** Whether the run is interactive (`SessionOptions.interactive`): it decides which built-ins exist. */
  readonly interactive?: boolean;
}

export interface AgentPart {
  /**
   * Reads the agents folders again: the managed directory, `~/.claude/agents`, the project's `.claude/agents`
   * up to the repository root and the added directories'. The first call is what lists them at all.
   * Needs `HostPorts.folders`. `overrides.flag` decides which flag problems come back.
   */
  reloadAgents(options: {
    readonly signal: AbortSignal;
    readonly overrides?: AgentOverrides;
  }): Promise<AgentsReload>;
  /** Every subagent of the session as of the last read, one definition per name (`resolveAgents`). */
  agentCatalog(overrides?: AgentOverrides): AgentCatalog;
  /** The agent the session runs as (`--agent`, the `agent` setting), found in `agentCatalog(overrides)`. */
  selectAgent(
    choice: { readonly flag?: string | undefined; readonly setting?: string | undefined },
    overrides?: AgentOverrides,
  ): SessionAgentChoice;
  /** The plugin an agent of the `plugin` source belongs to. */
  pluginOf(agent: CatalogAgent): ActivePlugin | undefined;
}

const NOT_WIRED = warning(
  'agents',
  'the host gave no folder-scan port, so no personal, project, managed or added-directory agent is read',
);

const ON = '1';

const NO_FLAG: ReturnType<typeof readFlagAgents> = { agents: [], issues: [] };

const readFlag = (flag: unknown): ReturnType<typeof readFlagAgents> =>
  flag === undefined ? NO_FLAG : readFlagAgents(flag);

/** The environment switches of "Built-in subagents". */
function builtinPolicyOf(state: HostState, interactive: boolean): BuiltinPolicy {
  const { environment } = state.options.ports;
  return {
    interactive,
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
  const plugins = pluginAgents(state);
  let scanned: readonly ScannedAgent[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  /** The flag as this call has it: the override when given (even `undefined`), else the session's. */
  const flagOf = (overrides?: AgentOverrides) =>
    readFlag(overrides !== undefined && 'flag' in overrides ? overrides.flag : options.agents);

  const read = async (signal: AbortSignal, overrides?: AgentOverrides): Promise<AgentsReload> => {
    const { folders, locations } = state.options.ports;
    const flag = flagOf(overrides);
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

  const catalog = (overrides?: AgentOverrides): AgentCatalog => {
    const interactive = overrides?.interactive ?? options.interactive ?? true;
    const denied = overrides?.permissionRules ?? options.permissionRules;
    return resolveAgents({
      builtin: policy.loads('agents', 'builtIn')
        ? builtinAgents(builtinPolicyOf(state, interactive))
        : [],
      flag: flagOf(overrides).agents.map(catalogAgentOf),
      scanned,
      plugin: plugins.agents,
      ...(denied === undefined ? {} : { denied }),
    });
  };

  return {
    reloadAgents: (reload) => {
      const result = queue.then(() => read(reload.signal, reload.overrides));
      queue = result.catch(() => undefined);
      return result;
    },
    agentCatalog: catalog,
    selectAgent: (choice, overrides) => selectSessionAgent(catalog(overrides), choice),
    pluginOf: (agent) => plugins.owners.get(agent),
  };
}
