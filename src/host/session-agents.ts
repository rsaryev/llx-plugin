import { readFlagAgents } from '../format/agent-flag.ts';
import { warning, type PluginIssue } from '../format/issues.ts';
import type { PluginSettings } from '../format/plugin-settings.ts';
import {
  builtinAgents,
  catalogAgentOf,
  resolveAgents,
  scanAgents,
  selectSessionAgent,
  type AgentCatalog,
  type AgentSetting,
  type BuiltinPolicy,
  type CatalogAgent,
  type ScannedAgent,
  type SessionAgentChoice,
} from '../agents/catalog/index.ts';
import type { PermissionRule } from '../rules/index.ts';
import {
  readSubagentStatusLine,
  type PluginDefaults,
  type SubagentLineRead,
} from '../settings/general/index.ts';
import { createHookPolicy, type CommandSessionFacts } from '../settings/hooks/index.ts';
import { extraFoldersOf, scopeRequestOf } from './scope.ts';
import { portsOf } from './session-environment.ts';
import { createFirstRead } from './session-first-read.ts';
import type { SessionDirectories } from './session-directories.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { SessionOptions } from './session-types.ts';
import { pluginDefaultsOf, valueWithPluginDefaults } from '../settings/general/plugin-defaults.ts';

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
  /**
   * Every subagent of the session as of the last read, one definition per name (`resolveAgents`).
   * Until the first `reloadAgents`, `issues` says the folders are not read (the rule skills share).
   */
  agentCatalog(overrides?: AgentOverrides): AgentCatalog;
  /**
   * The agent the session runs as, found in `agentCatalog(overrides)`: `flag` (`--agent`, or the SDK
   * `agent` option) over the `agent` setting of the session's settings, over the enabled plugins'
   * default `agent` (the plugin loaded last wins). `from` says which; `plugin` names the plugin of a
   * default.
   */
  selectAgent(
    choice: { readonly flag?: string | undefined },
    overrides?: AgentOverrides,
  ): SessionAgentChoice;
  /**
   * The enabled plugins' default settings (plugins/components.md, "Default settings"): `agent` and
   * `subagentStatusLine`, which plugin each came from, and the `overrides setting` debug lines.
   */
  pluginDefaults(): SessionPluginDefaults;
  /**
   * The `subagentStatusLine` that runs: the settings' value, else the plugin default, under the gates
   * of `statusLine` (`disableAllHooks`, trust, `allowManagedHooksOnly`; a plugin's value never runs
   * narrowed). `folderTrusted` defaults to `SessionOptions.trusted`. Running the command, its input and
   * the rows it rewrites are the host's.
   */
  subagentStatusLine(facts?: CommandSessionFacts): SubagentLineRead<DefaultsPlugin>;
  /** The plugin an agent of the `plugin` source belongs to. */
  pluginOf(agent: CatalogAgent): ActivePlugin | undefined;
}

/** A plugin whose `settings.json` holds defaults: its id, name and applied settings. */
export interface DefaultsPlugin {
  readonly id: string;
  readonly name: string;
  readonly settings: PluginSettings;
}

export type SessionPluginDefaults = PluginDefaults<DefaultsPlugin>;

/** The enabled plugins' defaults, in the order the host gave them (the load order). */
const sessionPluginDefaults = (state: HostState): SessionPluginDefaults =>
  pluginDefaultsOf(
    state.active.map((active) => ({
      id: active.id,
      name: active.plugin.name,
      settings: active.plugin.settings,
    })),
  );

/** The `agent` setting after the plugin defaults, in the shape `selectSessionAgent` takes. */
function agentSettingOf(state: HostState): AgentSetting | undefined {
  const found = valueWithPluginDefaults(state.view, 'agent', sessionPluginDefaults(state));
  if (found === undefined) return undefined;
  return found.plugin === undefined
    ? { name: found.value }
    : { name: found.value, plugin: found.plugin.id };
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
function builtinPolicyOf(
  state: HostState,
  options: SessionOptions,
  interactive: boolean,
): BuiltinPolicy {
  const { environment } = portsOf(state, options);
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
      const agent = catalogAgentOf(record, plugin.id);
      owners.set(agent, plugin);
      return agent;
    }),
  );
  return { owners, agents };
}

export function createAgentPart(
  stateOf: () => HostState,
  options: SessionOptions,
  directories: SessionDirectories,
): AgentPart {
  const cache = new WeakMap<HostState, ReturnType<typeof pluginAgents>>();
  const pluginsOf = () => {
    const state = stateOf();
    const found = cache.get(state) ?? pluginAgents(state);
    cache.set(state, found);
    return found;
  };
  const policyOf = () => stateOf().customization;
  let scanned: readonly ScannedAgent[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const firstRead = createFirstRead('agents', 'reloadAgents');

  /** The flag as this call has it: the override when given (even `undefined`), else the session's. */
  const flagOf = (overrides?: AgentOverrides) =>
    readFlag(overrides !== undefined && 'flag' in overrides ? overrides.flag : options.agents);

  const read = async (signal: AbortSignal, overrides?: AgentOverrides): Promise<AgentsReload> => {
    const state = stateOf();
    const { folders } = state.options.ports;
    const flag = flagOf(overrides);
    if (folders === undefined) return { issues: [...flag.issues, NOT_WIRED], watch: [] };
    const outcome = await scanAgents({
      folders,
      request: scopeRequestOf({ state, options }, directories),
      allows: (origin) => policyOf().loads('agents', origin),
      signal,
      ...extraFoldersOf(state),
    });
    scanned = outcome.entries;
    firstRead.done();
    return { issues: [...flag.issues, ...outcome.issues], watch: outcome.watch };
  };

  const catalog = (overrides?: AgentOverrides): AgentCatalog => {
    const interactive = overrides?.interactive ?? options.interactive ?? true;
    const denied = overrides?.permissionRules ?? options.permissionRules;
    const resolved = resolveAgents({
      builtin: policyOf().loads('agents', 'builtIn')
        ? builtinAgents(builtinPolicyOf(stateOf(), options, interactive))
        : [],
      flag: flagOf(overrides).agents.map((record) => catalogAgentOf(record)),
      scanned: scanned.filter((entry) => policyOf().loads('agents', entry.origin)),
      plugin: pluginsOf().agents,
      ...(denied === undefined ? {} : { denied }),
    });
    return { ...resolved, issues: [...firstRead.issues(stateOf()), ...resolved.issues] };
  };

  return {
    reloadAgents: (reload) => {
      const result = queue.then(() => read(reload.signal, reload.overrides));
      queue = result.catch(() => undefined);
      return result;
    },
    agentCatalog: catalog,
    selectAgent: (choice, overrides) =>
      selectSessionAgent(catalog(overrides), {
        flag: choice.flag,
        setting: agentSettingOf(stateOf()),
      }),
    pluginDefaults: () => sessionPluginDefaults(stateOf()),
    subagentStatusLine: (facts) => {
      const state = stateOf();
      const context = { ...state.parent, folderTrusted: options.trusted ?? true, ...facts };
      const policy = createHookPolicy(state.view, context);
      return readSubagentStatusLine(state.view, policy, sessionPluginDefaults(state));
    },
    pluginOf: (agent) => pluginsOf().owners.get(agent),
  };
}
